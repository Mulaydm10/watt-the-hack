import { describe, expect, it } from 'vitest';
import dev from '../data/buildings_dev.json';
import evalSet from '../data/buildings_eval.json';
import { assess } from './assess';
import { methodA, methodB } from './heatLoad';
import type { Building } from './types';

const devB = dev as Building[];
const evalB = evalSet as Building[];
const byId = (id: string) => [...devB, ...evalB].find((b) => b.building_id === id)!;

describe('dev cases reproduce nuuEnergy references', () => {
  for (const b of devB) {
    it(`${b.building_id}: best estimate within ±25%, reference inside range, verdict ${b.expected_verdict}`, () => {
      const a = assess(b);
      const ref = b.reference_heating_load_kw!;
      expect(a.heatLoad.bestKw).not.toBeNull();
      expect(Math.abs(a.heatLoad.bestKw! - ref) / ref).toBeLessThanOrEqual(0.25);
      expect(a.heatLoad.range!.low).toBeLessThanOrEqual(ref);
      expect(a.heatLoad.range!.high).toBeGreaterThanOrEqual(ref);
      expect(a.verdict).toBe(b.expected_verdict);
    });
  }
});

describe('guardrail formulas', () => {
  it('B-04 method B = 9.5 kW, method A = 12.8–19.2 kW', () => {
    const b = byId('B-04');
    expect(methodB(b)!.kw).toBe(9.5);
    expect(methodA(b)).toMatchObject({ low: 12.8, high: 19.2 });
  });
  it('B-04 costs: heat pump ≈ €2,043 at JAZ 2.8 vs oil €4,250', () => {
    const a = assess(byId('B-04'));
    expect(a.radiators.jaz).toBe(2.8);
    expect(a.costs!.heatPumpEur).toBeCloseTo(2043, -1);
    expect(a.costs!.currentEur).toBe(4250);
  });
  it('B-05 method B = 10.4 kW (83 W/m²), method A = 5.0–7.5 kW', () => {
    const b = byId('B-05');
    expect(methodB(b)).toMatchObject({ kw: 10.4, wPerM2: 83 });
    expect(methodA(b)).toMatchObject({ low: 5, high: 7.5 });
  });
});

describe('eval buildings', () => {
  it('B-04: confirmed single-pipe is an obstacle shown as yellow + strong warning', () => {
    const a = assess(byId('B-04'));
    expect(a.verdict).toBe('yellow');
    expect(a.verdictReasons.join(' ')).toMatch(/Strong warning: Single-pipe/);
    expect(a.flags.obstacles[0].title).toMatch(/Single-pipe/);
  });
  it('B-05: yellow with contradictions (methods 2× apart, room count)', () => {
    const a = assess(byId('B-05'));
    expect(a.verdict).toBe('yellow');
    expect(a.flags.contradictions.length).toBeGreaterThanOrEqual(2);
    expect(a.flags.obstacles).toHaveLength(0);
  });
});

describe('uncertainty handling', () => {
  it('unknowns alone never produce red', () => {
    const empty: Building = {
      construction_year: 1965, floor_area_m2: 140, renovation_status: null, heat_distribution: 'radiators',
      annual_consumption_kwh: null, energy_carrier: null, pipe_system: 'unknown', flow_temperature_c: null,
      persons_in_household: null, hot_water_via_heating: null, rooms: null,
    };
    expect(assess(empty).verdict).toBe('yellow');
  });
  it('photo AI never overrides confirmed data', () => {
    const a = assess(byId('B-04'), { label: 'two-pipe', confidence: 0.95, evidence: [], source: 'ai' });
    expect(a.pipeSystem.value).toBe('single-pipe');
  });
  it('low-confidence photo stays unknown', () => {
    const a = assess(byId('B-05'), { label: 'single-pipe', confidence: 0.5, evidence: [], source: 'ai' });
    expect(a.pipeSystem.value).toBe('unknown');
  });
  it('a known obstacle that is not single-pipe still gives red', () => {
    const b = { ...byId('B-03'), building_notes: 'No space for an outdoor unit.' };
    expect(assess(b).verdict).toBe('red');
  });
  it('meter cabinet is on every checklist', () => {
    for (const b of [...devB, ...evalB]) expect(assess(b).flags.technicianChecks[0].title).toMatch(/Meter cabinet/);
  });
});
