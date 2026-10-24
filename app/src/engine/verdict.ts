import { INSULATION_HINT_W_PER_M2, SINGLE_PIPE_VERDICT } from './constants';
import { methodGap } from './heatLoad';
import type { Confidence, Flags, HeatLoad, PipeSystem, Radiators, Verdict } from './types';

/**
 * Deterministic traffic light:
 *   obstacle confirmed                            → red
 *   critical unknowns / contradictions / > 55 °C  → yellow
 *   otherwise                                     → green
 * Unknowns alone never produce red.
 */
export function verdict(h: HeatLoad, r: Radiators, f: Flags, pipe: PipeSystem): { verdict: Verdict; confidence: Confidence; reasons: string[]; headline: string } {
  const reasons: string[] = [];
  let v: Verdict;

  const hardObstacles = f.obstacles.filter((o) => !(pipe === 'single-pipe' && o.title.startsWith('Single-pipe') && SINGLE_PIPE_VERDICT === 'yellow'));
  const criticalUnknowns = f.unknowns.filter((u) => u.critical);
  const criticalContradictions = f.contradictions.filter((c) => c.critical);

  if (hardObstacles.length) {
    v = 'red';
    hardObstacles.forEach((o) => reasons.push(`Obstacle: ${o.title}.`));
  } else {
    if (f.obstacles.length) f.obstacles.forEach((o) => reasons.push(`Strong warning: ${o.title}.`));
    criticalContradictions.forEach((c) => reasons.push(`Data contradiction: ${c.title}.`));
    criticalUnknowns.forEach((u) => reasons.push(`Can't tell yet: ${u.title}.`));
    if (r.likelyAbove55) reasons.push(`Radiators probably need ${r.flowTemp.replace(/ \(.*\)/, '').replace(/^likely /, '')}, so the heat pump runs less efficiently (JAZ ${r.jaz}).`);
    if (h.bestWPerM2 != null && h.bestWPerM2 > INSULATION_HINT_W_PER_M2) reasons.push(`Heat load of ${h.bestWPerM2} W/m² is on the high side.`);
    if (h.bestKw == null) reasons.push('Not enough data to estimate the heat load.');
    v = f.obstacles.length || reasons.length ? 'yellow' : 'green';
    if (f.obstacles.length) reasons.push('A technician must check this before a heat pump is planned; it may still work after changes.');
    if (v === 'green') {
      reasons.push(`Estimated heat load ${h.bestKw} kW (${h.bestWPerM2} W/m²) is moderate.`);
      reasons.push(r.jaz >= 4 ? 'Underfloor heating suits a heat pump well.' : 'Radiators can likely run at ≤ 55 °C.');
    }
  }

  // Confidence: how much was missing, contradictory, or disagreeing between methods.
  const penalty = f.unknowns.length + 2 * f.contradictions.length + (methodGap(h) > 0.3 ? 1 : 0) + (h.methodA && h.methodB ? 0 : 2);
  const confidence: Confidence = penalty <= 2 ? 'high' : penalty <= 4 ? 'medium' : 'low';

  const headline = {
    green: 'A heat pump looks likely suitable for this home.',
    yellow: f.obstacles.length
      ? 'Potentially suitable, but there is a known obstacle a technician must check first.'
      : 'A heat pump is potentially suitable, but important checks remain.',
    red: 'Not a clean yes: there is a known obstacle a technician must look at first.',
  }[v];
  return { verdict: v, confidence, reasons, headline };
}
