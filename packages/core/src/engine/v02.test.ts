import { describe, expect, it } from 'vitest';
import dev from '../data/buildings_dev.json';
import evalSet from '../data/buildings_eval.json';
import { visitDecision } from '../sales/visitDecision';
import { NO_COMMITMENT, NO_PRECHECK, type Commitment, type Lead } from '../sales/types';
import { resultAreas } from './areas';
import { assess } from './assess';
import type { Building } from './types';

const all = [...(dev as Building[]), ...(evalSet as Building[])];
const byId = (id: string) => all.find((b) => b.building_id === id)!;
const lead = (b: Building, commitment: Commitment = NO_COMMITMENT): Lead =>
  ({ id: 'x', building: b, commitment, preCheck: NO_PRECHECK, consent: true, source: 'demo', createdAt: '' });
const COMMITTED: Commitment = { ownership: 'owner', boiler: 'over20', timeline: 'within6m', decisionMakers: 'yes', subsidiesLooked: 'yes', sharePhotos: 'yes' };

describe('v0.2 rules (teammate parameters)', () => {
  it('existing results unchanged for B-01..B-05', () => {
    expect(all.map((b) => [assess(b).verdict, assess(b).heatLoad.bestKw])).toEqual([
      ['green', 9.8], ['green', 9.9], ['yellow', 16.6], ['yellow', 9.5], ['yellow', 10.4],
    ]);
  });
  it('wall/ceiling heating is treated like underfloor (JAZ 4, no radiator questions)', () => {
    for (const d of ['wall', 'ceiling'] as const) {
      const a = assess({ ...byId('B-02'), heat_distribution: d });
      expect(a.radiators.jaz).toBe(4);
      expect(a.flags.unknowns.some((u) => /pipe|Radiator/.test(u.title))).toBe(false);
      expect(a.flags.technicianChecks.some((t) => /Surface-heating/.test(t.title))).toBe(true);
    }
  });
  it('energy certificate far from the bill is a contradiction, estimate unchanged', () => {
    const b = { ...byId('B-02'), certificate_kwh_m2a: 30 };
    const a = assess(b);
    expect(a.flags.contradictions.some((c) => /certificate/.test(c.title))).toBe(true);
    expect(a.heatLoad.bestKw).toBe(assess(byId('B-02')).heatLoad.bestKw);
    expect(assess({ ...byId('B-02'), certificate_kwh_m2a: 85 }).flags.contradictions).toHaveLength(0);
  });
  it('uneven heating → critical unknown (yellow), never red', () => {
    const a = assess({ ...byId('B-01'), uneven_heating: true });
    expect(a.verdict).toBe('yellow');
    expect(a.flags.unknowns.some((u) => /heat evenly/.test(u.title))).toBe(true);
  });
  it('hot water made elsewhere → no hot-water deduction', () => {
    expect(assess({ ...byId('B-04'), hot_water_via_heating: false }).heatLoad.methodB!.kw).toBe(11);
  });
  it('biomass / other fuel → no current-cost comparison', () => {
    for (const c of ['biomass', 'other'] as const) expect(assess({ ...byId('B-02'), energy_carrier: c }).costs!.currentEur).toBeNull();
  });
  it('construction year alone never rejects a home', () => {
    for (const y of [1900, 1950, 1970]) expect(assess({ construction_year: y, floor_area_m2: 150, heat_distribution: 'radiators' } as Building).verdict).not.toBe('red');
  });
  it('apartment / approval needed → sales tier C, technical verdict unchanged', () => {
    for (const p of [{ house_type: 'apartment' as const }, { approval_needed: true }, { units_in_building: 6 }]) {
      const b = { ...byId('B-02'), ...p };
      expect(assess(b).verdict).toBe('green');
      expect(visitDecision(lead(b, COMMITTED)).tier).toBe('C');
    }
  });
  it('authorized representative counts as a decision-maker', () => {
    const d = visitDecision(lead(byId('B-02'), { ...COMMITTED, ownership: 'representative' }));
    expect(d.commitmentSignals.join(' ')).toMatch(/representative/);
  });
});

describe('result areas (heat demand, system fit, feasibility, confidence)', () => {
  const areas = (b: Building) => Object.fromEntries(resultAreas(b, assess(b)).map((x) => [x.key, x]));
  it('every house gets 4 areas, each with reason and next check', () => {
    for (const b of all) {
      const r = resultAreas(b, assess(b));
      expect(r.map((x) => x.key)).toEqual(['demand', 'fit', 'feasibility', 'confidence']);
      r.forEach((x) => { expect(x.reason.length).toBeGreaterThan(10); expect(x.nextCheck.length).toBeGreaterThan(10); });
    }
  });
  it('B-02: demand good, fit good (underfloor)', () => {
    const a = areas(byId('B-02'));
    expect(a.demand.status).toBe('good');
    expect(a.fit.status).toBe('good');
  });
  it('B-04: single-pipe is a closer check, not an automatic no', () => {
    const a = areas(byId('B-04'));
    expect(a.fit.status).toBe('check');
    expect(a.fit.reason).toMatch(/not an automatic no/);
  });
  it('B-05: demand needs a check (energy figures contradict), confidence not good', () => {
    const a = areas(byId('B-05'));
    expect(a.demand.status).toBe('check');
    expect(a.confidence.status).toBe('check');
  });
  it('B-01 style radiators + unknown flow → the teammate example message', () => {
    expect(areas(byId('B-01')).fit.reason).toMatch(/radiators and the flow temperature is unknown/);
  });
  it('old/full meter cabinet and terraced house flag feasibility', () => {
    const b = { ...byId('B-02'), house_type: 'terraced' as const };
    const f = resultAreas(b, assess(b), { meterCabinet: 'old-or-full' })[2];
    expect(f.status).toBe('check');
    expect(f.reason).toMatch(/meter cabinet/);
  });
});
