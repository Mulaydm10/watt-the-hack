import { JAZ_RAD_55, JAZ_RAD_60, JAZ_UNDERFLOOR, LIKELY_ABOVE_55_W_PER_M2 } from './constants';
import type { Building, HeatLoad, PipeSystem, Radiators } from './types';

/** Which flow temperature the heat distribution needs, and therefore which JAZ to use. */
export function radiators(b: Building, h: HeatLoad, pipe: PipeSystem): Radiators {
  const dist = b.heat_distribution;
  const flow = b.flow_temperature_c;

  if (dist === 'underfloor') {
    return { jaz: JAZ_UNDERFLOOR, jazWorst: JAZ_UNDERFLOOR, flowTemp: '~35 °C', reason: 'Underfloor heating runs at about 35 °C, ideal for a heat pump.', likelyAbove55: false };
  }
  if (dist === 'wall' || dist === 'ceiling') {
    // Not in the guardrails: treated like underfloor (low-temperature surface heating), technician confirms.
    return { jaz: JAZ_UNDERFLOOR, jazWorst: JAZ_UNDERFLOOR, flowTemp: '~35 °C (assumed)', reason: `${dist === 'wall' ? 'Wall' : 'Ceiling'} heating is low-temperature surface heating, treated like underfloor heating (about 35 °C); a technician confirms the design temperature.`, likelyAbove55: false };
  }
  const prefix = dist === 'mixed' ? 'Mixed system: the radiator circuit sets the flow temperature. ' : '';

  if (pipe === 'single-pipe') {
    return {
      jaz: JAZ_RAD_60, jazWorst: JAZ_RAD_60, flowTemp: '55–60 °C',
      reason: `${prefix}Single-pipe loop: the last radiators get cooler water, so 55–60 °C is assumed unless a technician proves otherwise.`,
      likelyAbove55: true,
    };
  }
  if (flow != null) {
    if (flow <= 55) return { jaz: JAZ_RAD_55, jazWorst: JAZ_RAD_55, flowTemp: `${flow} °C (stated)`, reason: `${prefix}Stated flow temperature is ${flow} °C, within the efficient range.`, likelyAbove55: false };
    return {
      jaz: JAZ_RAD_60, jazWorst: JAZ_RAD_60, flowTemp: `${flow} °C (stated)`,
      reason: `${prefix}Stated flow temperature is ${flow} °C, above 55 °C, so the heat pump runs less efficiently.`,
      likelyAbove55: true,
    };
  }
  // Unknown flow temperature: estimate from the specific heat load, show the JAZ range.
  const w = h.bestWPerM2;
  if (w != null && w <= LIKELY_ABOVE_55_W_PER_M2) {
    return {
      jaz: JAZ_RAD_55, jazWorst: JAZ_RAD_60, flowTemp: 'likely ≤ 55 °C (not measured)',
      reason: `${prefix}Flow temperature not documented. At ${w} W/m² typical radiators can usually cover the load at ≤ 55 °C; worst case 55–60 °C shown as a range.`,
      likelyAbove55: false,
    };
  }
  // Not measured, so show the full range: 3.5 if the radiators turn out big enough, 2.8 if not.
  return {
    jaz: JAZ_RAD_55, jazWorst: JAZ_RAD_60, flowTemp: 'likely 55–60 °C (not measured)',
    reason: `${prefix}Flow temperature not documented. ${w != null ? `At ${w} W/m² ` : 'Without a heat-load figure '}the existing radiators probably need 55–60 °C; JAZ 3.5 is possible if radiators are large enough.`,
    likelyAbove55: true,
  };
}
