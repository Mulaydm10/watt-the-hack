import { assess } from './assess';
import { INSULATION_HINT_W_PER_M2, TOO_HIGH_W_PER_M2 } from './constants';
import type { Assessment, Building, Confidence, PhotoFindings, Verdict } from './types';

export type PathStep = {
  check: string;
  outcome: string;
  effort: 'check' | 'small work' | 'bigger work';
  verdict: Verdict;
  confidence: Confidence;
};

export type PathToGreen = {
  steps: PathStep[];
  reachesGreenHigh: boolean;
  blockers: string[];
};

type Candidate = {
  applies: (b: Building, a: Assessment) => boolean;
  check: string;
  outcome: string;
  effort: PathStep['effort'];
  patch: (b: Building) => Partial<Building>;
};

// Ordered cheapest first. Each step assumes the GOOD outcome of a technician check;
// the engine then re-runs unchanged, so the verdict still comes only from the rules.
const CANDIDATES: Candidate[] = [
  {
    applies: (_b, a) => a.flags.contradictions.length > 0,
    check: 'Confirm the bill, heated area and room count on site',
    outcome: 'data confirmed as stated',
    effort: 'check',
    patch: () => ({ verified_on_site: true }),
  },
  {
    applies: (b, a) => a.pipeSystem.value === 'unknown' && b.heat_distribution !== 'underfloor',
    check: 'Technician checks the pipe system',
    outcome: 'two-pipe system',
    effort: 'check',
    patch: () => ({ pipe_system: 'two-pipe' }),
  },
  {
    applies: (b) => b.flow_temperature_c == null && b.heat_distribution !== 'underfloor',
    check: 'Flow-temperature test: boiler at 55 °C on a cold day',
    outcome: 'all rooms stay warm at 55 °C',
    effort: 'check',
    patch: () => ({ flow_temperature_c: 55 }),
  },
  {
    applies: (b, a) => b.heat_distribution !== 'underfloor' && a.flags.unknowns.some((u) => u.title.startsWith('Radiator type')),
    check: 'Document radiator types and sizes',
    outcome: 'radiators sized for 55 °C',
    effort: 'check',
    patch: () => ({ radiator_info: 'Radiators checked on site: sized to cover each room at 55 °C.' }),
  },
  {
    applies: (b) => b.renovation_status == null,
    check: 'Record the renovation status',
    outcome: 'documented as stated by the owner',
    effort: 'check',
    // Recorded as unrenovated: the conservative case, so the result never gets better by assumption.
    patch: () => ({ renovation_status: 'unrenovated' }),
  },
  {
    applies: (_b, a) => a.pipeSystem.value === 'single-pipe',
    check: 'Enlarge the end radiators or convert the loop to two-pipe',
    outcome: 'end radiators covered at 55 °C',
    effort: 'bigger work',
    patch: () => ({ pipe_system: 'two-pipe', flow_temperature_c: 55 }),
  },
];

export function pathToGreen(start: Building, photo?: PhotoFindings): PathToGreen {
  let b: Building = { ...start };
  let a = assess(b, photo);
  const steps: PathStep[] = [];
  const done = () => a.verdict === 'green' && a.confidence === 'high';

  for (const c of CANDIDATES) {
    if (done()) break;
    if (!c.applies(b, a)) continue;
    b = { ...b, ...c.patch(b) };
    a = assess(b, photo);
    steps.push({ check: c.check, outcome: c.outcome, effort: c.effort, verdict: a.verdict, confidence: a.confidence });
  }

  // What still stands in the way after every check came back positive.
  const blockers: string[] = [];
  if (!done()) {
    const w = a.heatLoad.bestWPerM2;
    if (w != null && w > TOO_HIGH_W_PER_M2) blockers.push(`Heat load ~${w} W/m² is too high: insulation is needed before a heat pump.`);
    else if (w != null && w > INSULATION_HINT_W_PER_M2) blockers.push(`Heat load ~${w} W/m² is above ${INSULATION_HINT_W_PER_M2} W/m²: better windows or insulation would make this a clear green.`);
    a.flags.obstacles.forEach((o) => blockers.push(`${o.title}: a technician must find a solution on site.`));
    if (a.heatLoad.bestKw == null) blockers.push('No heat-load estimate: add the yearly consumption, floor area and building year.');
    if (!blockers.length) blockers.push(...a.verdictReasons);
  }
  return { steps, reachesGreenHigh: done(), blockers };
}
