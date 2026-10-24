import type { Tier } from './types';

/**
 * Every sales number comes from here. All values are company assumptions
 * ("placeholder, nuuEnergy to set"), not learned from data.
 */
export type SalesConfig = {
  visitCostEur: number;
  averageMarginEur: number;
  baseSaleProbability: Record<Tier, number>;
  /** Fixed, visible nudges to P(sale), in percentage points. */
  adjustments: {
    owner: number;
    tenant: number;
    timelineAsap: number;
    timeline6m: number;
    justCurious: number;
    boilerBroken: number;
    boilerOver20: number;
    preCheckComplete: number;
    verdictGreen: number;
    verdictRed: number;
  };
  minProbability: number;
  maxProbability: number;
  /** Tier A needs at least this much of the remote pre-check done (0–100). */
  tierAMinPreCheck: number;
  /** P1: "visit credit" offer for tier B/C leads. */
  visitCreditEnabled: boolean;
  visitCreditEur: number;
  /** Minutes for a visit with no remote pre-check; each % done saves time down to the minimum. */
  visitMinutesFull: number;
  visitMinutesMin: number;
};

export const DEFAULT_CONFIG: SalesConfig = {
  visitCostEur: 250,
  averageMarginEur: 3000,
  baseSaleProbability: { A: 0.35, B: 0.2, C: 0.1, D: 0.03 },
  adjustments: {
    owner: 0.05,
    tenant: -0.1,
    timelineAsap: 0.1,
    timeline6m: 0.05,
    justCurious: -0.1,
    boilerBroken: 0.15,
    boilerOver20: 0.08,
    preCheckComplete: 0.05,
    verdictGreen: 0.05,
    verdictRed: -0.15,
  },
  minProbability: 0.05,
  maxProbability: 0.9,
  tierAMinPreCheck: 60,
  visitCreditEnabled: true,
  visitCreditEur: 99,
  visitMinutesFull: 120,
  visitMinutesMin: 60,
};

export const TIER_INFO: Record<Tier, { label: string; action: string }> = {
  A: { label: 'A: Send expert now', action: 'Book the on-site visit.' },
  B: { label: 'B: Video call first', action: '15-minute remote consult; upgrade to a visit when the gaps close.' },
  C: { label: 'C: Ask for info first', action: 'Send an automated message asking for the missing information.' },
  D: { label: 'D: Not now / nurture', action: 'Send the info pack and subsidy guide; re-contact later.' },
};
