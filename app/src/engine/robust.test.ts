import { describe, expect, it } from 'vitest';
import dev from '../data/buildings_dev.json';
import { assess } from './assess';
import { sanitize } from './sanitize';
import type { Assessment, Building } from './types';

const base = (dev as Building[])[0];
const wellFormed = (a: Assessment) => {
  expect(['green', 'yellow', 'red']).toContain(a.verdict);
  expect(a.headline.length).toBeGreaterThan(0);
  expect(a.verdictReasons.length).toBeGreaterThan(0);
  expect(a.flags.technicianChecks[0].title).toMatch(/Meter cabinet/);
  const nums = [a.heatLoad.bestKw, a.costs?.heatPumpEur, a.costs?.currentEur].filter((x) => x != null) as number[];
  nums.forEach((n) => { expect(Number.isFinite(n)).toBe(true); expect(n).toBeGreaterThanOrEqual(0); });
  expect(JSON.stringify(a)).not.toMatch(/NaN|Infinity/);
};

describe('robust against bad input', () => {
  const cases: Record<string, Partial<Record<keyof Building, unknown>>> = {
    'everything missing': {},
    'zero area': { ...base, floor_area_m2: 0 },
    'negative consumption': { ...base, annual_consumption_kwh: -500 },
    'NaN fields': { ...base, construction_year: NaN, persons_in_household: NaN },
    'strings from CSV': { ...base, construction_year: '2001', floor_area_m2: '195', annual_consumption_kwh: '10,000', hot_water_via_heating: 'yes', rooms: '' },
    'hot water larger than bill': { ...base, annual_consumption_kwh: 2000, persons_in_household: 8 },
    'absurd year': { ...base, construction_year: 3020 },
    'unknown enums': { ...base, heat_distribution: 'heat-wall', energy_carrier: 'wood', pipe_system: 'triple', renovation_status: 'some' },
    'district heating': { ...base, energy_carrier: 'district' },
    'electric': { ...base, energy_carrier: 'electric' },
    'huge building': { ...base, floor_area_m2: 4000, annual_consumption_kwh: 900000 },
    'flow temp 70': { ...base, flow_temperature_c: 70 },
    'old house only age': { construction_year: 1955, floor_area_m2: 120, heat_distribution: 'radiators' },
  };
  for (const [name, raw] of Object.entries(cases)) {
    it(name, () => wellFormed(assess(raw as Building)));
  }

  it('sanitize parses CSV-style values', () => {
    const b = sanitize({ annual_consumption_kwh: '10,000', hot_water_via_heating: 'no', floor_area_m2: '-3', pipe_system: 'Two-Pipe' });
    expect(b.annual_consumption_kwh).toBe(10000);
    expect(b.hot_water_via_heating).toBe(false);
    expect(b.floor_area_m2).toBeNull();
    expect(b.pipe_system).toBe('two-pipe');
  });

  it('missing data alone never gives red', () => {
    for (const raw of [{}, { construction_year: 1955 }, { floor_area_m2: 300 }]) {
      expect(assess(raw as Building).verdict).not.toBe('red');
    }
  });

  it('is deterministic', () => {
    expect(JSON.stringify(assess(base))).toBe(JSON.stringify(assess(base)));
  });
});
