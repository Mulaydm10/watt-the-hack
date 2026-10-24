import { assess } from '../engine/assess';
import type { Assessment } from '../engine/types';
import { DEFAULT_CONFIG, type SalesConfig } from './config';
import { serviceArea } from './offer';
import { preCheckCompleteness } from './preCheck';
import type { Commitment, CommitmentLevel, Lead, Tier } from './types';

const DECIDES = ['owner', 'co-owner', 'landlord'];

/** Commitment level from the homeowner's own answers only. Unanswered questions count as unknown, not negative. */
export function commitmentLevel(c: Commitment): { level: CommitmentLevel; signals: string[] } {
  const answered = Object.values(c).filter((v) => v != null).length;
  if (answered === 0) return { level: 'unknown', signals: ['No commitment questions answered yet.'] };
  const signals: string[] = [];
  let score = 0;
  if (c.ownership && DECIDES.includes(c.ownership)) { score++; signals.push(`Decides on the house (${c.ownership}).`); }
  if (c.timeline === 'asap' || c.timeline === 'within6m') { score++; signals.push(`Wants to switch ${c.timeline === 'asap' ? 'as soon as possible' : 'within 6 months'}.`); }
  if (c.boiler === 'broken' || c.boiler === 'over20') { score++; signals.push(c.boiler === 'broken' ? 'Current boiler is broken: real urgency.' : 'Boiler is over 20 years old.'); }
  if (c.decisionMakers === 'yes') { score++; signals.push('All decision-makers are involved.'); }
  if (c.subsidiesLooked === 'yes') { score++; signals.push('Has already looked into subsidies or financing.'); }
  if (c.sharePhotos === 'yes') { score++; signals.push('Willing to share photos now.'); }
  return { level: score >= 4 ? 'high' : score >= 2 ? 'medium' : 'low', signals };
}

export type VisitDecision = {
  tier: Tier;
  outOfArea: boolean;
  reasons: string[];
  commitment: CommitmentLevel;
  commitmentSignals: string[];
  preCheck: number;
  saleProbability: number;
  probabilitySteps: string[];
  expectedValueEur: number;
  worthIt: boolean;
};

/**
 * Deterministic tiers, evaluated top-down: C (info missing) → D (not now) → A (send expert) → B (video call).
 * Uses the technical assessment as an input but never changes it.
 */
export function visitDecision(lead: Lead, cfg: SalesConfig = DEFAULT_CONFIG, a: Assessment = assess(lead.building, lead.photo)): VisitDecision {
  const c = lead.commitment;
  const { level, signals } = commitmentLevel(c);
  const pre = preCheckCompleteness(lead.building, a, lead.preCheck);
  const reasons: string[] = [];
  let tier: Tier | null = null;
  const area = serviceArea(lead.building.location);

  // Outside nuuEnergy's service area: they cannot send an expert. A logistics fact, not a lead-quality judgement.
  if (area.status === 'out') {
    reasons.push('Outside nuuEnergy service area (Greater Munich, Greater Hamburg, Lower Bavaria): no expert can be sent. Refer to a local installer.');
    tier = 'D';
  }

  // C: ask for info first
  const contradictions = a.flags.contradictions.filter((x) => x.critical);
  if (!tier && contradictions.length) reasons.push(`Data contradictions to clear first: ${contradictions.map((x) => x.title.toLowerCase()).join('; ')}.`);
  if (!tier && c.ownership === 'tenant') reasons.push('Tenant: the owner must be involved before a visit makes sense.');
  if (!tier && a.heatLoad.bestKw == null) reasons.push('No heat-load estimate yet: ask for the bill or building facts.');
  if (!tier && reasons.length) tier = 'C';

  // D: not now / nurture
  if (!tier) {
    if (a.verdict === 'red') reasons.push(`Technical obstacle: ${a.flags.obstacles.map((o) => o.title).join('; ')}. A visit now is unlikely to end in a sale.`);
    if (c.timeline === 'curious') reasons.push('Just curious, no timeline yet.');
    if (reasons.length) tier = 'D';
  }

  // A: send expert now (all conditions must hold)
  if (!tier) {
    const technicalOk = a.verdict === 'green' || (a.verdict === 'yellow' && a.flags.obstacles.length === 0);
    const decides = c.ownership != null && DECIDES.includes(c.ownership);
    const urgent = c.timeline === 'asap' || c.timeline === 'within6m' || c.boiler === 'broken' || c.boiler === 'over20';
    const enoughPre = pre >= cfg.tierAMinPreCheck;
    if (technicalOk && decides && urgent && enoughPre) {
      tier = 'A';
      reasons.push(`Technically ${a.verdict}${a.flags.obstacles.length ? '' : ' with no known obstacle'}.`, `Decision-maker (${c.ownership}).`,
        urgent && (c.boiler === 'broken' || c.boiler === 'over20') ? 'Boiler is broken or old.' : 'Wants to switch within 6 months.',
        `Remote pre-check ${pre}% done (≥ ${cfg.tierAMinPreCheck}%).`);
    } else {
      // B: video call first, saying exactly what is missing for A
      tier = 'B';
      if (!technicalOk) reasons.push(a.flags.obstacles.length ? `Known obstacle to discuss first: ${a.flags.obstacles.map((o) => o.title).join('; ')}.` : 'Technical picture not clear yet.');
      if (a.verdict === 'yellow' && a.flags.unknowns.length) reasons.push(`${a.flags.unknowns.length} open question(s) a call can settle.`);
      if (!decides) reasons.push(c.ownership ? `Ownership: ${c.ownership}.` : 'Ownership not stated yet.');
      if (!urgent) reasons.push(c.timeline || c.boiler ? 'No urgent timeline or old boiler.' : 'Timeline and boiler age not stated yet.');
      if (!enoughPre) reasons.push(`Remote pre-check only ${pre}% done (A needs ≥ ${cfg.tierAMinPreCheck}%).`);
    }
  }

  // P(sale): tier base rate plus fixed, visible nudges; capped.
  const adj = cfg.adjustments;
  let p = cfg.baseSaleProbability[tier];
  const steps = [`Base rate for tier ${tier}: ${pct(p)}`];
  const nudge = (cond: boolean, d: number, why: string) => { if (cond) { p += d; steps.push(`${d >= 0 ? '+' : '−'}${pct(Math.abs(d))} ${why}`); } };
  nudge(c.ownership != null && DECIDES.includes(c.ownership), adj.owner, 'decision-maker');
  nudge(c.ownership === 'tenant', adj.tenant, 'tenant');
  nudge(c.timeline === 'asap', adj.timelineAsap, 'wants it as soon as possible');
  nudge(c.timeline === 'within6m', adj.timeline6m, 'within 6 months');
  nudge(c.timeline === 'curious', adj.justCurious, 'just curious');
  nudge(c.boiler === 'broken', adj.boilerBroken, 'boiler broken');
  nudge(c.boiler === 'over20', adj.boilerOver20, 'boiler over 20 years');
  nudge(pre >= cfg.tierAMinPreCheck, adj.preCheckComplete, `pre-check ≥ ${cfg.tierAMinPreCheck}%`);
  nudge(a.verdict === 'green', adj.verdictGreen, 'technically green');
  nudge(a.verdict === 'red', adj.verdictRed, 'technically red');
  const capped = Math.min(cfg.maxProbability, Math.max(cfg.minProbability, p));
  if (capped !== p) steps.push(`Capped to ${pct(capped)}`);
  const ev = Math.round(capped * cfg.averageMarginEur - cfg.visitCostEur);

  return { tier, outOfArea: area.status === 'out', reasons, commitment: level, commitmentSignals: signals, preCheck: pre, saleProbability: capped, probabilitySteps: steps, expectedValueEur: ev, worthIt: ev > 0 };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Visit length shrinks with the remote pre-check (configurable). */
export function visitMinutes(preCheck: number, cfg: SalesConfig = DEFAULT_CONFIG): number {
  const span = cfg.visitMinutesFull - cfg.visitMinutesMin;
  return Math.round(cfg.visitMinutesFull - (span * preCheck) / 100);
}
