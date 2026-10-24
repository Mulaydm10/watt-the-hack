// Location: per the teammate analysis it only decides the service area and the subsidy region.
// It never changes technical suitability.
import { serviceArea, SUBSIDY } from '@hpr/core/sales/offer';
import type { LocationInfo } from './profile';

export function lookupLocation(postcode: string): LocationInfo {
  const pc = postcode.replace(/\D/g, '').slice(0, 5);
  const area = `${pc.slice(0, 2)}xxx`;
  const sa = serviceArea(`(${pc})`);
  const topUp = sa.region === 'Munich area' ? `Munich FKG up to +${SUBSIDY.munichUpToPct}% (to ${SUBSIDY.munichFillsTo}% in total)`
    : sa.region === 'Hamburg area' ? `Hamburg IFB +${SUBSIDY.hamburgPct}% (max €${SUBSIDY.hamburgMaxEur.toLocaleString('en-US')})` : undefined;
  return { postcode: pc, area, status: sa.status, region: sa.region, subsidyTopUp: topUp };
}
