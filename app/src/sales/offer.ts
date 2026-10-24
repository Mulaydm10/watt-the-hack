// nuuEnergy-specific facts from their public website (Oct 2026). All are config, shown with their source.
// Prices and subsidy rules change: every figure is labelled "check current rules".

/** Service area: around Munich and Hamburg (~1.5 h) and Lower Bavaria, by the first two postcode digits. */
export const SERVICE_AREA: Record<string, string[]> = {
  'Munich area': ['80', '81', '82', '83', '85', '86'],
  'Lower Bavaria': ['84', '93', '94'],
  'Hamburg area': ['20', '21', '22', '23', '24', '25', '27', '29'],
};

export function serviceArea(location: string | undefined): { status: 'in' | 'out' | 'unknown'; region?: string } {
  const m = (location ?? '').match(/\b(\d{2})(\d{3}|x{3})\b/i);
  if (!m) return { status: 'unknown' };
  const region = Object.entries(SERVICE_AREA).find(([, p]) => p.includes(m[1]))?.[0];
  return region ? { status: 'in', region } : { status: 'out' };
}

/** nuuEnergy's heat-pump units (kW). */
export const UNITS_KW = [5, 7, 10, 12, 16, 20];

/** Smallest unit that covers the best estimate; the next size up only if the range demands it. Oversizing is a costly mistake. */
export function sizeToUnits(bestKw: number | null, rangeHigh?: number): { units: number[]; note: string } {
  if (bestKw == null) return { units: [], note: 'No size suggestion without a heat-load estimate.' };
  const first = UNITS_KW.find((u) => u >= bestKw);
  if (first == null) return { units: [UNITS_KW[UNITS_KW.length - 1]], note: `Load above ${UNITS_KW[UNITS_KW.length - 1]} kW: needs a cascade or insulation first.` };
  const next = UNITS_KW.find((u) => u > first);
  const units = next && rangeHigh != null && rangeHigh > first && bestKw > first * 0.9 ? [first, next] : [first];
  return { units, note: 'Do not oversize: a too-big heat pump cycles on and off, runs less efficiently and costs more. The room-by-room calculation decides.' };
}

/** Published price bands before subsidy. */
export function priceBand(unitKw: number | undefined): { low: number; high: number; label: string } {
  return unitKw != null && unitKw <= 7
    ? { low: 29000, high: 34000, label: 'small house (~7 kW)' }
    : { low: 35000, high: 45000, label: 'bigger or more complex job (10 kW+)' };
}

/** KfW 458 (2026 rules as published): 30% base, +16% boiler-swap bonus, + up to 40% income bonus, max 70%, on max €28k costs. */
export const SUBSIDY = {
  basePct: 30,
  oldBoilerBonusPct: 16,
  incomeBonusMaxPct: 40,
  maxTotalPct: 70,
  maxEligibleCostEur: 28000,
  cityTopUpPct: { 'Munich area': 15, 'Hamburg area': 20 } as Record<string, number>,
};

export function subsidyEstimate(opts: { oldBoiler20Plus: boolean; incomeBonus: boolean; region?: string }): { pct: number; maxEur: number; lines: string[] } {
  const lines = [`Base subsidy ${SUBSIDY.basePct}%`];
  let pct = SUBSIDY.basePct;
  if (opts.oldBoiler20Plus) { pct += SUBSIDY.oldBoilerBonusPct; lines.push(`+${SUBSIDY.oldBoilerBonusPct}% for replacing an oil/gas boiler that is 20+ years old`); }
  if (opts.incomeBonus) { pct += SUBSIDY.incomeBonusMaxPct; lines.push(`+ up to ${SUBSIDY.incomeBonusMaxPct}% income bonus (your own estimate, never shared)`); }
  if (pct > SUBSIDY.maxTotalPct) { pct = SUBSIDY.maxTotalPct; lines.push(`Capped at ${SUBSIDY.maxTotalPct}% in total`); }
  const city = opts.region ? SUBSIDY.cityTopUpPct[opts.region] : undefined;
  if (city) lines.push(`Possible extra city programme: +${city}% (${opts.region}, separate application)`);
  lines.push(`Counted on at most €${SUBSIDY.maxEligibleCostEur.toLocaleString('en-US')} of costs → up to €${Math.round((SUBSIDY.maxEligibleCostEur * pct) / 100).toLocaleString('en-US')}`);
  return { pct, maxEur: Math.round((SUBSIDY.maxEligibleCostEur * pct) / 100), lines };
}
