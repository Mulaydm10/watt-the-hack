// nuuEnergy company rules from nuuenergy.com (read 24 Oct 2026). All figures: "check current rules, nuuEnergy confirms".
import { SERVICE_AREA } from './config';

export function serviceArea(location: string | undefined): { status: 'in' | 'out' | 'unknown'; region?: string } {
  const m = (location ?? '').match(/\b(\d{2})(\d{3}|x{3})\b/i);
  if (!m) return { status: 'unknown' };
  const region = Object.entries(SERVICE_AREA).find(([, p]) => p.includes(m[1]))?.[0];
  return region ? { status: 'in', region } : { status: 'out' };
}

/** nuuEnergy's heat-pump units (kW). */
export const UNITS_KW = [5, 7, 10, 12, 16, 20];

/**
 * Nearest unit that covers the best estimate, shown as a range only when the plausible range reaches the next size.
 * Never "bigger to be safe": oversizing makes the unit cycle on and off.
 */
export function sizeToUnits(bestKw: number | null, rangeHigh?: number): { units: number[]; note: string } {
  const note = 'Exact size only after the on-site heat-load calculation. Oversizing is a costly mistake: the unit cycles on and off constantly.';
  if (bestKw == null) return { units: [], note: 'No size suggestion without a heat-load estimate.' };
  const first = UNITS_KW.find((u) => u >= bestKw);
  if (first == null) return { units: [UNITS_KW[UNITS_KW.length - 1]], note: `Load above ${UNITS_KW[UNITS_KW.length - 1]} kW: needs a cascade or insulation first. ${note}` };
  const next = UNITS_KW.find((u) => u > first);
  const units = next && rangeHigh != null && rangeHigh > first && bestKw > first * 0.9 ? [first, next] : [first];
  return { units, note };
}

/** Published price bands, gross, before subsidy. */
export function priceBand(unitKw: number | undefined): { low: number; high: number; label: string } {
  return unitKw != null && unitKw <= 7
    ? { low: 29000, high: 34000, label: 'small single-family house (~7 kW, short pipe runs, no extras)' }
    : { low: 35000, high: 45000, label: 'medium/large or complex (10 kW+, longer runs, PV, buffer tanks)' };
}

export const COST_DRIVERS = ['Heat-pump size', 'Earthworks / core drilling', 'Storage tanks', 'Solar thermal / PV integration', 'Condition of the existing electrics (meter cabinet)', 'Insulation'];
export const PAYMENT_TERMS = '10% on order · 40% on material delivery · 50% after commissioning';
export const NUU_PAYBACK = 'nuuEnergy states: an old house pays back in ~7–10 years; heating costs typically fall 30–50%.';

export type IncomeBand = 'not-said' | 'le30' | '30to40' | '40to50' | 'gt50';
const BANDS: IncomeBand[] = ['le30', '30to40', '40to50', 'gt50'];
const INCOME_PCT: Record<IncomeBand, number> = { 'not-said': 0, le30: 40, '30to40': 30, '40to50': 10, gt50: 0 };

/** KfW 458 (rules as of 21 Jul 2026) plus city programmes. Homeowner-side only; never sent to sales. */
export const SUBSIDY = { basePct: 30, speedBonusPct: 16, maxTotalPct: 70, maxEligibleCostEur: 28000, munichUpToPct: 15, munichFillsTo: 60, hamburgPct: 20, hamburgMaxEur: 9000 };

export function subsidyEstimate(o: { ownerOccupied: boolean | null; oldBoiler20Plus: boolean; income: IncomeBand; minorChild: boolean; region?: string }): { pct: number; maxEur: number; lines: string[] } {
  const lines: string[] = [];
  if (o.ownerOccupied === false) {
    return { pct: 0, maxEur: 0, lines: ['The KfW base subsidy is for owner-occupied homes: the owner should apply. Involve the owner first.'] };
  }
  let pct = SUBSIDY.basePct;
  lines.push(`${SUBSIDY.basePct}% base subsidy (owner-occupied existing building)`);
  if (o.oldBoiler20Plus) {
    pct += SUBSIDY.speedBonusPct;
    lines.push(`+${SUBSIDY.speedBonusPct}% climate-speed bonus for replacing an oil/gas boiler ≥ 20 years old (drops 4 points every 6 months from Feb 2027)`);
  }
  // A minor child counts the income €10k lower = one band better.
  const band = o.income !== 'not-said' && o.minorChild ? BANDS[Math.max(0, BANDS.indexOf(o.income) - 1)] : o.income;
  const inc = INCOME_PCT[band];
  if (inc) { pct += inc; lines.push(`+${inc}% income bonus (your own estimate, stays on this device)`); }
  if (pct > SUBSIDY.maxTotalPct) { pct = SUBSIDY.maxTotalPct; lines.push(`Capped at ${SUBSIDY.maxTotalPct}% in total`); }
  lines.push(`Counted on at most €${SUBSIDY.maxEligibleCostEur.toLocaleString('en-US')} per unit → up to €${Math.round((SUBSIDY.maxEligibleCostEur * pct) / 100).toLocaleString('en-US')}`);
  if (o.region === 'Munich area') {
    const top = Math.max(0, Math.min(SUBSIDY.munichUpToPct, SUBSIDY.munichFillsTo - pct));
    lines.push(top > 0 ? `Munich FKG: up to +${top}% more (fills up to ${SUBSIDY.munichFillsTo}% in total)` : `Munich FKG: no extra, KfW already ≥ ${SUBSIDY.munichFillsTo}%`);
  }
  if (o.region === 'Hamburg area') lines.push(`Hamburg IFB alternative: +${SUBSIDY.hamburgPct}% (max €${SUBSIDY.hamburgMaxEur.toLocaleString('en-US')}), excludes the speed and income bonus`);
  return { pct, maxEur: Math.round((SUBSIDY.maxEligibleCostEur * pct) / 100), lines };
}
