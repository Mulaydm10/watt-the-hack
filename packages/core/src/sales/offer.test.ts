import { describe, expect, it } from 'vitest';
import { priceBand, serviceArea, sizeToUnits, subsidyEstimate } from './offer';
import { tightPlacement } from './types';

const base = { ownerOccupied: true, oldBoiler20Plus: false, income: 'not-said' as const, minorChild: false };

describe('nuuEnergy offer rules', () => {
  it('service area from postcode (approximate list)', () => {
    expect(serviceArea('Munich area (82xxx)')).toMatchObject({ status: 'in', region: 'Munich area' });
    expect(serviceArea('Munich area (85xxx)')).toMatchObject({ status: 'in', region: 'Munich area' });
    expect(serviceArea('Hamburg area (21xxx)')).toMatchObject({ status: 'in', region: 'Hamburg area' });
    expect(serviceArea('Passau 94032')).toMatchObject({ status: 'in', region: 'Lower Bavaria' });
    expect(serviceArea('Cologne (50xxx)').status).toBe('out');
    expect(serviceArea('').status).toBe('unknown');
  });
  it('nearest unit covering the load, never bigger to be safe', () => {
    expect(sizeToUnits(9.5).units).toEqual([10]);
    expect(sizeToUnits(6.8, 8).units).toEqual([7, 10]);
    expect(sizeToUnits(4).units).toEqual([5]);
    expect(sizeToUnits(9.5).note).toMatch(/Exact size only after the on-site heat-load calculation/);
    expect(sizeToUnits(25).note).toMatch(/cascade|insulation/);
  });
  it('price bands', () => {
    expect(priceBand(7)).toMatchObject({ low: 29000, high: 34000 });
    expect(priceBand(10)).toMatchObject({ low: 35000, high: 45000 });
  });
  it('subsidy: base 30, +16 old boiler, staged income, capped 70, max €28k', () => {
    expect(subsidyEstimate(base).pct).toBe(30);
    expect(subsidyEstimate({ ...base, oldBoiler20Plus: true }).pct).toBe(46);
    expect(subsidyEstimate({ ...base, income: '30to40' }).pct).toBe(60);
    expect(subsidyEstimate({ ...base, income: '40to50', minorChild: true }).pct).toBe(60);
    const max = subsidyEstimate({ ...base, oldBoiler20Plus: true, income: 'le30' });
    expect(max.pct).toBe(70);
    expect(max.maxEur).toBe(19600);
  });
  it('city programmes: Munich fills up to 60%, Hamburg alternative', () => {
    expect(subsidyEstimate({ ...base, region: 'Munich area' }).lines.join(' ')).toMatch(/up to \+15% more/);
    expect(subsidyEstimate({ ...base, oldBoiler20Plus: true, region: 'Munich area' }).lines.join(' ')).toMatch(/up to \+14% more/);
    expect(subsidyEstimate({ ...base, region: 'Hamburg area' }).lines.join(' ')).toMatch(/IFB.*€9,000/);
  });
  it('not owner-occupied: involve the owner, no base subsidy', () => {
    expect(subsidyEstimate({ ...base, ownerOccupied: false }).pct).toBe(0);
  });
  it('tight placement for terraced/semi or a doubtful distance', () => {
    expect(tightPlacement({ space1x1: 'yes', neighbourOk: 'yes', houseType: 'terraced' })).toBe(true);
    expect(tightPlacement({ space1x1: 'yes', neighbourOk: 'yes', houseType: 'detached' })).toBe(false);
  });
});
