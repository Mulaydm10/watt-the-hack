// Session + deterministic state machine. The model never decides the state; it is derived from the facts.
import { emptyProfile, type Profile } from './profile';
import { nextQuestions } from './nextQuestions';
import type { Lang } from './slots';

export type State =
  | 'GREETING' | 'LOCATION' | 'OUT_OF_AREA' | 'MUST_HAVE' | 'DEEPEN' | 'CONFIRM' | 'RESULT'
  | 'SALES_QUESTIONS' | 'CONSENT_CONTACT' | 'HANDOFF' | 'DONE' | 'HUMAN_HANDOFF' | 'PAUSED';

export type Consent = { share: boolean; contact: boolean; photos: boolean; recording: boolean; at: string; textVersion: string };

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export type ToolLogEntry = { at: string; tool: string; args: unknown; result: unknown; ms: number };

export type Session = {
  id: string;
  createdAt: string;
  updatedAt: string;
  channel: 'chat' | 'voice';
  lang: Lang;
  /** Language actually spoken (de, en, fr, it, es, nl, pl, pt); fixed texts use `lang` and are translated by the model. */
  speak?: string;
  profile: Profile;
  flags: {
    started: boolean;
    outOfAreaAck: boolean;
    stopQuestions: boolean;
    confirmed: boolean;
    resultDelivered: boolean;
    salesDone: boolean;
    finished: boolean;
    handoff?: string;
    paused: boolean;
  };
  consent?: Consent;
  photoRequests: { kinds: string[]; to?: string; link: string; at: string }[];
  messages: ChatMessage[];
  toolLog: ToolLogEntry[];
  leadId?: string;
  resumeCode?: string;
  outcomeText?: string;
};

export function newSession(id: string, channel: Session['channel'] = 'chat', lang: Lang = 'de'): Session {
  const now = new Date().toISOString();
  return {
    id, createdAt: now, updatedAt: now, channel, lang, profile: emptyProfile(),
    flags: { started: false, outOfAreaAck: false, stopQuestions: false, confirmed: false, resultDelivered: false, salesDone: false, finished: false, paused: false },
    photoRequests: [], messages: [], toolLog: [],
  };
}

export function deriveState(s: Session): State {
  const f = s.flags;
  if (f.handoff) return 'HUMAN_HANDOFF';
  if (f.paused) return 'PAUSED';
  if (f.finished) return 'DONE';
  if (!f.started) return 'GREETING';
  if (!s.profile.slots.lang || !s.profile.location) return 'LOCATION';
  if (s.profile.location.status === 'out' && !f.outOfAreaAck) return 'OUT_OF_AREA';
  const nq = nextQuestions(s.profile, 1);
  if (nq.questions[0]?.mode === 'ASK') return 'MUST_HAVE';
  if (!f.stopQuestions && nq.questions.length > 0) return 'DEEPEN';
  if (!f.confirmed) return 'CONFIRM';
  if (!f.resultDelivered) return 'RESULT';
  if (!f.salesDone && s.profile.location.status !== 'out') return 'SALES_QUESTIONS';
  if (!s.consent) return 'CONSENT_CONTACT';
  return 'HANDOFF';
}

/** Rough progress for the UI: 0–100. */
export function progress(s: Session): { pct: number; label: Record<Lang, string> } {
  const order: State[] = ['GREETING', 'LOCATION', 'MUST_HAVE', 'DEEPEN', 'CONFIRM', 'RESULT', 'SALES_QUESTIONS', 'CONSENT_CONTACT', 'HANDOFF', 'DONE'];
  const st = deriveState(s);
  const i = Math.max(0, order.indexOf(st));
  const label: Record<Lang, string> = i <= 3 ? { en: 'Your home', de: 'Ihr Zuhause' } : i <= 5 ? { en: 'Your result', de: 'Ihr Ergebnis' } : { en: 'Next steps', de: 'Nächste Schritte' };
  return { pct: Math.round((i / (order.length - 1)) * 100), label };
}
