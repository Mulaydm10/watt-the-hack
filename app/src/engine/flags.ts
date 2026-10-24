import { DISAGREEMENT_TOLERANCE, IMPLAUSIBLY_LOW_W_PER_M2, INSULATION_HINT_W_PER_M2, TOO_HIGH_W_PER_M2 } from './constants';
import { hasOtherHeatSource, methodGap } from './heatLoad';
import type { Building, Flag, Flags, HeatLoad, PhotoFindings, PipeSystem, Radiators } from './types';

const NO_OUTDOOR_SPOT = /no (space|room|spot|place) for (an |the )?outdoor|no garden|no outdoor/i;
const VALVES_NEED_WORK = /valves? (would )?need replacement|valves? need/i;
const RADIATOR_TYPE_UNKNOWN = /type and age not documented|type not documented/i;

/** Obstacles (known problems), unknowns (can't tell yet), contradictions, technician checks, tips. */
export function flags(b: Building, h: HeatLoad, r: Radiators, pipe: PipeSystem, photo?: PhotoFindings): Flags {
  const obstacles: Flag[] = [];
  const unknowns: Flag[] = [];
  const contradictions: Flag[] = [];
  const checks: Flag[] = [];
  const tips: string[] = [];
  const hasRadiators = b.heat_distribution !== 'underfloor';
  const year = b.construction_year;
  const area = b.floor_area_m2;

  // ---- Obstacles: the official most-common no-go reasons ----
  if (pipe === 'single-pipe') {
    obstacles.push({
      title: 'Single-pipe heating system (Einrohrheizung)',
      detail: 'Radiators are connected in a loop, so the last ones get cooler water. This usually forces 55–60 °C flow temperature and higher running costs. Way forward: a technician checks whether the end radiators can be enlarged or the loop converted; then it may move to yellow.',
    });
  }
  // Only a measured (bill-based) load can confirm this; a table estimate alone is an unknown, not an obstacle.
  if (h.bestWPerM2 != null && h.bestWPerM2 > TOO_HIGH_W_PER_M2 && !h.methodB) {
    unknowns.push({ title: 'Heat load may be high', detail: `The age-based table suggests ~${h.bestWPerM2} W/m². Upload the energy bill to confirm or rule this out.`, critical: true });
  } else if (h.bestWPerM2 != null && h.bestWPerM2 > TOO_HIGH_W_PER_M2) {
    obstacles.push({ title: 'Heating load too high', detail: `About ${h.bestWPerM2} W/m², above ~${TOO_HIGH_W_PER_M2} W/m²: a heat pump would struggle to run efficiently without insulation work first.` });
  }
  if (NO_OUTDOOR_SPOT.test(b.building_notes ?? '')) {
    obstacles.push({ title: 'No viable spot for the outdoor unit', detail: 'The notes say there is no space for the outdoor unit.' });
  }
  if (b.flow_temperature_c != null && b.flow_temperature_c > 60 && hasRadiators) {
    obstacles.push({ title: 'Flow temperature above 60 °C', detail: `The system currently runs at ${b.flow_temperature_c} °C. A heat pump would need radiator upgrades first.` });
  }

  // ---- Unknowns: missing data is never an obstacle ----
  if (pipe === 'unknown' && hasRadiators) {
    const oldBuilding = year != null && year < 1980;
    unknowns.push({
      title: 'Pipe system unknown',
      detail: photo?.label === 'unclear'
        ? 'Heating pipe system unclear from the photos. A technician should check whether this is a single-pipe system, because that can require a higher flow temperature.'
        : `Not documented${oldBuilding ? '; single-pipe systems were common in the 1960s–70s, so this matters here' : ''}. Upload radiator photos or let a technician check.`,
      critical: oldBuilding,
    });
  }
  if (hasRadiators && (!b.radiator_info || RADIATOR_TYPE_UNKNOWN.test(b.radiator_info)) && !(photo?.radiator_type && photo.radiator_type !== 'unknown')) {
    unknowns.push({ title: 'Radiator type and size unknown', detail: 'Without Type 11/22/33 and sizes we cannot check whether the radiators still cover the load at 55 °C (they give about half their rated output).' });
  }
  if (b.flow_temperature_c == null && hasRadiators) {
    unknowns.push({ title: 'Current flow temperature unknown', detail: 'A simple test (turn the boiler down to 55 °C on a cold day) shows whether the rooms stay warm.' });
  }
  if (b.renovation_status == null) unknowns.push({ title: 'Renovation status unknown', detail: 'Insulation work changes the heat load a lot.' });
  if (!b.annual_consumption_kwh) unknowns.push({ title: 'No consumption figure', detail: 'Only the age-based estimate is possible; upload the energy bill for a better answer.', critical: true });
  if (!area || !year) unknowns.push({ title: 'Floor area or building year missing', detail: 'The area-based estimate is not possible.', critical: !b.annual_consumption_kwh });

  // ---- Contradictions ----
  if (h.methodB && h.methodB.wPerM2 < IMPLAUSIBLY_LOW_W_PER_M2 && !hasOtherHeatSource(b)) {
    contradictions.push({
      title: 'Consumption looks too low',
      detail: `The bill implies only ${h.methodB.wPerM2} W/m²${year ? ` for a ${year} building` : ''}. Is it a partial year, a second heat source or a vacancy?`,
      // A modern build makes the area fallback trustworthy, so it does not change the verdict.
      critical: !(year != null && year >= 1995),
    });
  }
  const gap = methodGap(h);
  if (gap > DISAGREEMENT_TOLERANCE && h.methodB && h.methodA && h.methodB.kw > h.methodA.high && !hasOtherHeatSource(b)) {
    contradictions.push({
      title: 'Consumption far above what this building age suggests',
      detail: `The bill implies ${h.methodB.kw} kW, the area method ${h.methodA.low}–${h.methodA.high} kW (${Math.round(gap * 100)}% apart). Check the bill, the heated area and the insulation.`,
      critical: true,
    });
  }
  if (area && b.annual_consumption_kwh && year != null && year >= 2002) {
    const perM2 = Math.round(b.annual_consumption_kwh / area);
    if (perM2 > 150) contradictions.push({ title: 'High consumption for a 2002+ building', detail: `${perM2} kWh/m² per year is typical of an unrenovated older house, not of a ${year} build.`, critical: true });
  }
  if (area && b.rooms && area / b.rooms < 12) {
    contradictions.push({ title: 'Room count implausible for the floor area', detail: `${b.rooms} rooms in ${area} m² is only ${Math.round(area / b.rooms)} m² per room. Is the floor area or the room count wrong?`, critical: true });
  }

  // Data confirmed on site: the numbers are real, so they are no longer contradictions.
  if (b.verified_on_site) contradictions.length = 0;

  // ---- Technician checklist: always, then case-specific ----
  checks.push({ title: 'Meter cabinet / electrical connection', detail: 'Every grid operator has its own rules. It must always be checked and often needs an upgrade, which can raise the total price a lot. Plan for it.', critical: true });
  checks.push({ title: 'Exact heat load', detail: 'Room-by-room heat-load calculation (DIN EN 12831).' });
  checks.push({ title: 'Outdoor-unit location', detail: 'Space, distance to neighbours (noise) and condensate drainage.' });
  if (hasRadiators && (pipe !== 'two-pipe')) checks.push({ title: 'Pipe system', detail: pipe === 'single-pipe' ? 'Can end radiators be enlarged or the loop be converted?' : 'Single-pipe or two-pipe? Look at the pipe runs between radiators and in the boiler room.' });
  if (hasRadiators) checks.push({ title: 'Radiator sizes and flow-temperature test', detail: 'Do the radiators cover each room at 55 °C?' });
  if (VALVES_NEED_WORK.test(b.radiator_info ?? '')) checks.push({ title: 'Valve replacement and hydraulic balancing', detail: b.radiator_info ?? '' });
  if (contradictions.length) checks.push({ title: 'Verify the input data', detail: 'Confirm the yearly consumption, heated area and room count on site.' });

  // ---- What would make this greener ----
  if (h.bestWPerM2 != null && h.bestWPerM2 > INSULATION_HINT_W_PER_M2) tips.push(`At ${h.bestWPerM2} W/m², better windows or insulation would lower the heat load and running costs.`);
  if (pipe === 'single-pipe') tips.push('Enlarge the last radiators in the loop or convert the loop to two-pipe.');
  if (r.likelyAbove55 && hasRadiators) tips.push('Replace the smallest radiators with larger Type 22/33 models so 55 °C is enough.');
  if (pipe === 'unknown' && hasRadiators) tips.push('Upload photos of the radiator connections to narrow down the pipe system.');

  return { obstacles, unknowns, contradictions, technicianChecks: checks, tips };
}
