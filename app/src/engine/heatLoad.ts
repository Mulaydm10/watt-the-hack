import {
  BANDS,
  BOILER_EFFICIENCY,
  DISAGREEMENT_TOLERANCE,
  FULL_LOAD_HOURS,
  HOT_WATER_KWH_PER_PERSON,
  IMPLAUSIBLY_LOW_W_PER_M2,
  LOW_END_MARGIN_W_PER_M2,
} from './constants';
import type { Building, HeatLoad, Range, Reason } from './types';

const round1 = (x: number) => Math.round(x * 10) / 10;

const OTHER_HEAT_SOURCE = /wood stove|fireplace|stove|kamin|ofen|second heat|other heat source|pellet/i;
const PART_UNUSED = /not lived in|unused|not heated|unheated|vacant|leer/i;
const LOW_ENERGY = /passive house|passivhaus|low-energy|kfw ?(40|55)/i;
const GOOD_ENVELOPE = /u-values?/i;

export const notesOf = (b: Building) => `${b.building_notes ?? ''} ${b.energy_carrier_detail ?? ''}`;
export const hasOtherHeatSource = (b: Building) => OTHER_HEAT_SOURCE.test(b.building_notes ?? '');
export const hasSolarThermal = (b: Building) => /solar thermal|solarthermie/i.test(b.building_notes ?? '');

/** Method A: floor area × W/m² band by age. Gaps and partial renovation widen the band. */
export function methodA(b: Building): HeatLoad['methodA'] {
  const area = b.floor_area_m2;
  const year = b.construction_year;
  if (!area || !year) return null;
  const notes: string[] = [];
  let w: Range;
  let band: string;

  if (LOW_ENERGY.test(b.building_notes ?? '')) {
    w = { low: BANDS.lowEnergy.low, high: BANDS.lowEnergy.high };
    band = BANDS.lowEnergy.label;
  } else if (b.renovation_status === 'fully' || year >= 2002) {
    w = { low: BANDS.y2002.low, high: BANDS.y2002.high };
    band = BANDS.y2002.label;
  } else if (year >= 1980 && year <= 1999) {
    w = { low: BANDS.y80s90s.low, high: BANDS.y80s90s.high };
    band = BANDS.y80s90s.label;
  } else if (year >= 2000) {
    w = { low: BANDS.y2002.low, high: BANDS.y80s90s.high };
    band = 'Between age bands (2000–2001)';
    notes.push('Built 2000–2001 falls between the 1980s–90s and 2002+ bands, so both are combined (40–120 W/m²).');
  } else if (year === 1979) {
    w = { low: BANDS.y80s90s.low, high: BANDS.pre1979.high };
    band = 'Between age bands (1979)';
    notes.push('Built 1979 falls between the pre-1979 and 1980s bands, so both are combined (80–180 W/m²).');
  } else if (b.renovation_status === 'partially') {
    w = { low: 60, high: BANDS.pre1979.high };
    band = 'Pre-1979, partially renovated';
    notes.push('Partial renovation sits between "unrenovated" and "renovated", so the band is widened to 60–180 W/m².');
  } else {
    w = { low: BANDS.pre1979.low, high: BANDS.pre1979.high };
    band = BANDS.pre1979.label;
    if (b.renovation_status == null) notes.push('Renovation status unknown: assuming unrenovated for this method.');
  }
  return { low: round1((area * w.low) / 1000), high: round1((area * w.high) / 1000), wPerM2: w, band, notes };
}

/** Method B: consumption → useful heat → minus hot water → ÷ full-load hours. */
export function methodB(b: Building): HeatLoad['methodB'] {
  const kwh = b.annual_consumption_kwh;
  if (!kwh || !b.floor_area_m2) return null;
  const useful = kwh * BOILER_EFFICIENCY;
  const steps = [`Useful heat = ${fmt(kwh)} kWh × ${BOILER_EFFICIENCY} = ${fmt(useful)} kWh`];
  let heat = useful;
  if (b.hot_water_via_heating && b.persons_in_household) {
    const hw = b.persons_in_household * HOT_WATER_KWH_PER_PERSON;
    heat -= hw;
    steps.push(`Minus hot water: ${b.persons_in_household} persons × ${fmt(HOT_WATER_KWH_PER_PERSON)} kWh = −${fmt(hw)} kWh → ${fmt(heat)} kWh`);
  } else if (b.hot_water_via_heating == null) {
    steps.push('Hot water via heating unknown: no hot-water deduction made.');
  }
  const kw = heat / FULL_LOAD_HOURS;
  steps.push(`÷ ${fmt(FULL_LOAD_HOURS)} full-load hours = ${round1(kw)} kW`);
  return { kw: round1(kw), wPerM2: Math.round((kw * 1000) / b.floor_area_m2), usefulHeatKwh: Math.round(useful), steps };
}

/**
 * Combine both methods with a short list of transparent rules (calibrated on dev cases B-01..B-03).
 * Each rule says what it did and why, so the UI can show "We trusted X because Y".
 */
export function heatLoad(b: Building): HeatLoad {
  const A = methodA(b);
  const B = methodB(b);
  const area = b.floor_area_m2 ?? 0;
  const rules: Reason[] = [];
  let best: number | null = null;
  let range: Range | null = A ? { low: A.low, high: A.high } : null;
  const include = (x: number) => {
    range = range ? { low: Math.min(range.low, x), high: Math.max(range.high, x) } : { low: x, high: x };
  };

  if (A && B) {
    const notes = b.building_notes ?? '';
    if (hasOtherHeatSource(b)) {
      // B-02: wood stove → gas only covers part of the heat.
      best = round1(A.low + 0.75 * (A.high - A.low));
      include(B.kw);
      rules.push({
        effect: 'Consumption treated as a lower bound; area method (upper half) used',
        reason: 'The notes mention another heat source (e.g. a wood stove), so the bill only covers part of the heat demand.',
      });
      if (hasSolarThermal(b)) {
        rules.push({ effect: 'Hot-water deduction likely too large', reason: 'Solar thermal covers part of the hot water, so less of the bill is hot water.' });
      }
    } else if (B.wPerM2 < IMPLAUSIBLY_LOW_W_PER_M2) {
      // B-01: 12 W/m² for a 2001 house is not plausible without an explanation.
      // Low end of the area band plus a 10 W/m² margin (never size exactly at the floor).
      best = round1((area * (A.wPerM2.low + LOW_END_MARGIN_W_PER_M2)) / 1000);
      rules.push({
        effect: 'Consumption distrusted; area method at the low end used',
        reason: `The bill implies only ${B.wPerM2} W/m², implausibly low for this building. Possible causes: partial year, second heat source or vacancy.${GOOD_ENVELOPE.test(notes) ? ' The stated U-values point to a good envelope, so the low end of the area band is used.' : ''}`,
      });
    } else if (b.renovation_status === 'partially' || b.renovation_status === 'fully' || PART_UNUSED.test(notes)) {
      // B-03: partly renovated + top floor unused → area method overestimates.
      best = B.kw;
      include(B.kw);
      rules.push({
        effect: 'Consumption method trusted; area method shrunk',
        reason: [
          b.renovation_status && b.renovation_status !== 'unrenovated' ? `the building is ${b.renovation_status} renovated` : null,
          PART_UNUSED.test(notes) ? 'part of the floor area is not heated' : null,
        ].filter(Boolean).join(' and ').replace(/^./, (c) => c.toUpperCase()) + ', so the area-based table overestimates.',
      });
    } else {
      best = B.kw;
      include(B.kw);
      const gap = B.kw < A.low ? (A.low - B.kw) / A.low : B.kw > A.high ? (B.kw - A.high) / A.high : 0;
      rules.push({
        effect: 'Consumption method used as best estimate',
        reason:
          gap > DISAGREEMENT_TOLERANCE
            ? `Real consumption is the better evidence, but it differs from the area method by ${Math.round(gap * 100)}%, so the data needs checking.`
            : 'Real consumption is the better evidence and it is consistent with the typical range for this building age.',
      });
    }
  } else if (B) {
    best = B.kw;
    include(B.kw);
    rules.push({ effect: 'Consumption method only', reason: 'Building age or floor area missing, so the area method is not possible.' });
  } else if (A) {
    best = round1((A.low + A.high) / 2);
    rules.push({ effect: 'Area method only (mid-point)', reason: 'No usable consumption figure, so only the typical range for this building age is available.' });
  }

  return {
    methodA: A,
    methodB: B,
    bestKw: best,
    bestWPerM2: best != null && area ? Math.round((best * 1000) / area) : null,
    range,
    rules,
  };
}

/** Relative distance of method B outside the method-A range (0 when inside). */
export function methodGap(h: HeatLoad): number {
  const A = h.methodA;
  const B = h.methodB;
  if (!A || !B) return 0;
  if (B.kw < A.low) return (A.low - B.kw) / A.low;
  if (B.kw > A.high) return (B.kw - A.high) / A.high;
  return 0;
}

export function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}
