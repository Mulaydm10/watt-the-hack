import { INSULATION_HINT_W_PER_M2, TOO_HIGH_W_PER_M2 } from './constants';
import { isSurfaceHeating, type Assessment, type Building } from './types';

export type AreaKey = 'demand' | 'fit' | 'feasibility' | 'confidence';
export type AreaStatus = 'good' | 'check' | 'issue';
export type ResultArea = { key: AreaKey; title: string; status: AreaStatus; reason: string; nextCheck: string };

/** Remote pre-check facts the engine itself does not hold (from the sales/agent layer). */
export type FeasibilityHints = {
  meterCabinet?: 'modern' | 'old-or-full' | 'unclear' | null;
  outdoorTightPlacement?: boolean;
};

/**
 * Groups one assessment into the four areas the teammate analysis asks for. Each area gets a status,
 * the reason and the next check. Derived only from the assessment and the building facts: no new rules.
 */
export function resultAreas(b: Building, a: Assessment, hints: FeasibilityHints = {}): ResultArea[] {
  return [demand(a), fit(b, a), feasibility(b, a, hints), confidence(b, a)];
}

function demand(a: Assessment): ResultArea {
  const h = a.heatLoad;
  const base = { key: 'demand' as const, title: 'Heat demand' };
  const roomByRoom = 'A technician calculates the exact heat load room by room (DIN EN 12831).';
  if (h.bestKw == null) {
    return { ...base, status: 'check', reason: 'Not enough information to estimate how much heat the home needs.', nextCheck: 'Add the yearly energy use from the bill, the heated area and the year built.' };
  }
  const usage = a.flags.contradictions.find((c) => /consumption|bill|certificate/i.test(c.title));
  if (h.bestWPerM2 != null && h.bestWPerM2 > TOO_HIGH_W_PER_M2 && h.methodB) {
    return { ...base, status: 'issue', reason: `The home needs a lot of heat for its size (about ${h.bestKw} kW, ${h.bestWPerM2} W/m²), so a heat pump would run expensively without insulation work.`, nextCheck: 'Check insulation options first, then the room-by-room heat load.' };
  }
  if (usage) {
    return { ...base, status: 'check', reason: `Estimated about ${h.bestKw} kW, but the energy figures don't fit together: ${usage.title.toLowerCase()}.`, nextCheck: 'Check the yearly bill and heated area; then a room-by-room heat-load calculation.' };
  }
  if (h.bestWPerM2 != null && h.bestWPerM2 > INSULATION_HINT_W_PER_M2) {
    return { ...base, status: 'check', reason: `About ${h.bestKw} kW (${h.bestWPerM2} W/m²): on the high side, so better windows or insulation would lower running costs.`, nextCheck: roomByRoom };
  }
  return { ...base, status: 'good', reason: `About ${h.bestKw} kW (${h.bestWPerM2} W/m²): a moderate heat demand for this home.`, nextCheck: roomByRoom };
}

function fit(b: Building, a: Assessment): ResultArea {
  const base = { key: 'fit' as const, title: 'Heating-system fit' };
  const r = a.radiators;
  if (isSurfaceHeating(b.heat_distribution)) {
    return { ...base, status: 'good', reason: `${b.heat_distribution === 'underfloor' ? 'Underfloor' : b.heat_distribution === 'wall' ? 'Wall' : 'Ceiling'} heating works at low water temperatures, which suits a heat pump well.`, nextCheck: 'A technician confirms the design temperature of the heating circuits.' };
  }
  if (a.pipeSystem.value === 'single-pipe') {
    return { ...base, status: 'check', reason: 'You have a single-pipe system: the last radiators get cooler water, so it needs a closer technical review. This is not an automatic no.', nextCheck: 'A technician checks whether the end radiators can be enlarged or the loop converted.' };
  }
  if (b.flow_temperature_c != null && b.flow_temperature_c > 60) {
    return { ...base, status: 'issue', reason: `The heating currently runs at ${b.flow_temperature_c} °C; a heat pump would need larger radiators to work efficiently.`, nextCheck: 'A technician checks which radiators need replacing.' };
  }
  if (b.uneven_heating) {
    return { ...base, status: 'check', reason: 'Some rooms don\'t heat evenly, which can point to undersized radiators or an unbalanced system.', nextCheck: 'A technician checks radiator sizes and hydraulic balancing room by room.' };
  }
  if (b.flow_temperature_c == null) {
    return { ...base, status: 'check', reason: `Your home may need a closer heating-system review because you have radiators and the flow temperature is unknown (${r.flowTemp.replace(/ \(.*\)/, '')} expected).`, nextCheck: 'A technician should check the room-by-room heat demand and radiator sizes, and test 55 °C on a cold day.' };
  }
  return { ...base, status: 'good', reason: `Your radiators run at ${b.flow_temperature_c} °C, within the efficient range for a heat pump.`, nextCheck: 'A technician confirms radiator sizes room by room.' };
}

function feasibility(b: Building, a: Assessment, hints: FeasibilityHints): ResultArea {
  const base = { key: 'feasibility' as const, title: 'Installation feasibility' };
  const always = 'Meter cabinet and outdoor-unit spot are always checked on site.';
  const noSpot = a.flags.obstacles.find((o) => /outdoor unit/i.test(o.title));
  if (noSpot) return { ...base, status: 'issue', reason: 'There seems to be no space for the outdoor unit.', nextCheck: 'A technician looks for alternative placements on site.' };
  const issues: string[] = [];
  if (b.approval_needed) issues.push('approval from the landlord, owners\' association or co-owners is needed');
  else if (b.house_type === 'apartment' || (b.units_in_building ?? 1) > 1) issues.push('in a shared building, others may need to agree to changes to the heating');
  if (hints.meterCabinet === 'old-or-full') issues.push('the meter cabinet looks old or full, so an electrical upgrade is likely (adds cost)');
  if (hints.outdoorTightPlacement || b.house_type === 'semi' || b.house_type === 'terraced') issues.push('the outdoor unit placement is tight, so noise rules need checking');
  if (issues.length) return { ...base, status: 'check', reason: `Worth checking early: ${issues.join('; ')}.`, nextCheck: always };
  return { ...base, status: 'good', reason: hints.meterCabinet === 'modern' ? 'No known installation problem; the meter cabinet looks modern.' : 'No known installation problem so far.', nextCheck: always };
}

function confidence(b: Building, a: Assessment): ResultArea {
  const base = { key: 'confidence' as const, title: 'Information confidence' };
  const key: [string, unknown][] = [
    ['yearly energy use', b.annual_consumption_kwh], ['heated area', b.floor_area_m2], ['year built', b.construction_year],
    ['heating type', b.heat_distribution], ['renovation', b.renovation_status], ['people', b.persons_in_household],
    ['hot water via heating', b.hot_water_via_heating],
  ];
  if (!isSurfaceHeating(b.heat_distribution)) key.push(['pipe system', a.pipeSystem.value === 'unknown' ? null : a.pipeSystem.value], ['flow temperature', b.flow_temperature_c]);
  const missing = key.filter(([, v]) => v == null).map(([k]) => k);
  const known = key.length - missing.length;
  const status: AreaStatus = a.confidence === 'high' ? 'good' : 'check';
  const contradictions = a.flags.contradictions.length ? ` ${a.flags.contradictions.length} answer(s) contradict each other.` : '';
  return {
    ...base,
    status,
    reason: `${known} of ${key.length} key facts known (${a.confidence} confidence).${missing.length ? ` Still open: ${missing.join(', ')}.` : ''}${contradictions}`,
    nextCheck: missing.length || contradictions ? 'Photos, the yearly bill or the on-site visit fill these gaps.' : 'Nothing important missing; the on-site visit confirms the details.',
  };
}
