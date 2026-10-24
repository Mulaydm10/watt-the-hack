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
  // nuuEnergy promises a free, no-obligation check, so this is off; only an option they could choose.
  visitCreditEnabled: false,
  visitCreditEur: 99,
  visitMinutesFull: 120,
  visitMinutesMin: 60,
};

export const TIER_INFO: Record<Tier, { label: string; action: string }> = {
  A: { label: 'A: Book on-site visit', action: 'Book the ~2-hour visit by the heating master (heat-load calculation and feasibility check).' },
  B: { label: 'B: Phone call first', action: 'Do the ~30-minute technical phone call with the planning team; book the visit when the gaps close.' },
  C: { label: 'C: Ask for info first', action: 'Send an automated message asking for the missing information or photos.' },
  D: { label: 'D: Not now', action: 'Send the info pack and subsidy guide; re-contact later. Never "rejected".' },
};
