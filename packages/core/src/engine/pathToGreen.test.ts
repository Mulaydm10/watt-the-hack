import { describe, expect, it } from 'vitest';
import dev from '../data/buildings_dev.json';
import evalSet from '../data/buildings_eval.json';
import { assess } from './assess';
import { pathToGreen } from './pathToGreen';
import type { Building } from './types';

const all = [...(dev as Building[]), ...(evalSet as Building[])];
const byId = (id: string) => all.find((b) => b.building_id === id)!;

describe('path to green', () => {
  it('never changes the actual assessment', () => {
    for (const b of all) {
      const before = JSON.stringify(assess(b));
      pathToGreen(b);
      expect(JSON.stringify(assess(b))).toBe(before);
    }
  });
  it('B-01 reaches green + high confidence through checks only', () => {
    const p = pathToGreen(byId('B-01'));
    expect(p.reachesGreenHigh).toBe(true);
    expect(p.steps.every((s) => s.effort === 'check')).toBe(true);
  });
  it('B-04 reaches green + high only after the single-pipe loop is fixed', () => {
    const p = pathToGreen(byId('B-04'));
    expect(p.reachesGreenHigh).toBe(true);
    expect(p.steps[p.steps.length - 1].effort).toBe('bigger work');
  });
  it('B-03 and B-05 honestly stay yellow: heat load above 75 W/m² needs insulation', () => {
    for (const id of ['B-03', 'B-05']) {
      const p = pathToGreen(byId(id));
      expect(p.reachesGreenHigh).toBe(false);
      expect(p.blockers.join(' ')).toMatch(/insulation/);
    }
  });
  it('every step is a real assessment re-run, so the verdict comes from the rules', () => {
    const p = pathToGreen(byId('B-05'));
    p.steps.forEach((s) => expect(['green', 'yellow', 'red']).toContain(s.verdict));
  });
});
