// Deterministic "what to ask next". The model phrases the question; this decides which one.
import { assess } from '@hpr/core/engine/assess';
import { visitDecision } from '@hpr/core/sales/visitDecision';
import type { Lead } from '@hpr/core/sales/types';
import { toBuilding, toCommitment, toPreCheck, type Profile } from './profile';
import { SLOTS, SLOT_BY_ID, type Slot } from './slots';

export type NextQuestion = { slot: string; mode: Slot['mode']; reason: string };

const answered = (p: Profile, id: string) => p.slots[id] != null;
const applies = (p: Profile, s: Slot) => !s.when || s.when(p);

function outcome(p: Profile) {
  const b = toBuilding(p);
  const a = assess(b, p.pipePhoto);
  const lead: Lead = { id: 'x', building: b, photo: p.pipePhoto, commitment: toCommitment(p), preCheck: toPreCheck(p), consent: true, source: 'homeowner', createdAt: '' };
  return { key: `${a.verdict}|${a.confidence}|${visitDecision(lead, undefined, a).tier}`, kw: a.heatLoad.bestKw };
}

/** Heat-load estimate moves by more than this share → the answer matters for sizing even if the verdict holds. */
const KW_CHANGE = 0.2;

/** Would answering this ADAPT slot change verdict, confidence or tier? Tries each candidate value. */
function decisive(p: Profile, s: Slot): boolean {
  if (!s.candidates || s.candidates.length === 0) return false;
  const now = outcome(p);
  return s.candidates.some((c) => {
    const trial: Profile = { ...p, slots: { ...p.slots, [s.id]: { value: c, provenance: 'user_said', at: '' } } };
    const t = outcome(trial);
    const kwMoved = now.kw != null && t.kw != null && Math.abs(t.kw - now.kw) / now.kw > KW_CHANGE;
    return t.key !== now.key || kwMoved;
  });
}

/**
 * Order: (1) unanswered ASK slots, (2) ADAPT slots that apply and are decisive or always-ask-when-applicable.
 * PHOTO/TECH are never spoken questions; SALES/CONTACT come after the result (handled by the state machine).
 */
export function nextQuestions(p: Profile, max = 3): { questions: NextQuestion[]; enoughForResult: boolean } {
  const out: NextQuestion[] = [];
  for (const s of SLOTS.filter((x) => x.mode === 'ASK').sort((a, b) => a.order - b.order)) {
    if (!answered(p, s.id) && applies(p, s)) out.push({ slot: s.id, mode: 'ASK', reason: 'core question' });
  }
  const mustDone = out.length === 0;
  if (mustDone) {
    for (const s of SLOTS.filter((x) => x.mode === 'ADAPT').sort((a, b) => a.order - b.order)) {
      if (answered(p, s.id) || !applies(p, s)) continue;
      if (s.askWhenApplicable) out.push({ slot: s.id, mode: 'ADAPT', reason: 'applies to this home' });
      else if (decisive(p, s)) out.push({ slot: s.id, mode: 'ADAPT', reason: 'the answer would change the result' });
    }
  }
  return { questions: out.slice(0, max), enoughForResult: mustDone && out.length === 0 };
}

/** Photo/document tasks worth requesting for this home (feasibility + pipe system). */
export function photoTasks(p: Profile): string[] {
  const b = toBuilding(p);
  const tasks = ['photo_meter_cabinet', 'photo_outdoor'];
  if (b.heat_distribution !== 'underfloor' && b.pipe_system === 'unknown') tasks.push('photo_radiator');
  tasks.push('photo_boiler_room');
  if (b.annual_consumption_kwh == null) tasks.unshift('doc_bill');
  return tasks.filter((t) => SLOT_BY_ID[t] && !p.photos.some((x) => `photo_${x.kind}` === t || `doc_${x.kind}` === t));
}
