import { describe, expect, it } from 'vitest';
import { priceBand, serviceArea, sizeToUnits, subsidyEstimate } from './offer';

describe('nuuEnergy offer rules', () => {
  it('service area from postcode', () => {
    expect(serviceArea('Munich area (82xxx)')).toMatchObject({ status: 'in', region: 'Munich area' });
    expect(serviceArea('Hamburg area (21xxx)')).toMatchObject({ status: 'in', region: 'Hamburg area' });
    expect(serviceArea('Passau 94032')).toMatchObject({ status: 'in', region: 'Lower Bavaria' });
    expect(serviceArea('Cologne (50xxx)').status).toBe('out');
    expect(serviceArea('').status).toBe('unknown');
  });
  it('sizes to the smallest real unit that covers the load', () => {
    expect(sizeToUnits(9.5).units).toEqual([10]);
    expect(sizeToUnits(6.8, 8).units).toEqual([7, 10]);
    expect(sizeToUnits(4).units).toEqual([5]);
    expect(sizeToUnits(25).note).toMatch(/cascade|insulation/);
  });
  it('price bands', () => {
    expect(priceBand(7)).toMatchObject({ low: 29000, high: 34000 });
    expect(priceBand(10)).toMatchObject({ low: 35000, high: 45000 });
  });
  it('subsidy: 30 + 16 + 40 capped at 70%, on max €28k', () => {
    expect(subsidyEstimate({ oldBoiler20Plus: false, incomeBonus: false }).pct).toBe(30);
    expect(subsidyEstimate({ oldBoiler20Plus: true, incomeBonus: false }).pct).toBe(46);
    const all = subsidyEstimate({ oldBoiler20Plus: true, incomeBonus: true, region: 'Munich area' });
    expect(all.pct).toBe(70);
    expect(all.maxEur).toBe(19600);
    expect(all.lines.join(' ')).toMatch(/\+15%/);
  });
});
