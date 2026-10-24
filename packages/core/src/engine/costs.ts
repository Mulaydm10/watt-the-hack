import { BOILER_EFFICIENCY, KWH_PER_LITRE_OIL, PRICE_GAS, PRICE_HP_ELECTRICITY, PRICE_OIL_PER_LITRE } from './constants';
import { fmt } from './heatLoad';
import type { Building, Costs, Radiators } from './types';

/** Yearly running cost: heat pump vs the current fuel, with every assumption listed. */
export function costs(b: Building, r: Radiators): Costs | null {
  const kwh = b.annual_consumption_kwh;
  if (!kwh) return null;
  const useful = kwh * BOILER_EFFICIENCY;
  const hp = (useful / r.jaz) * PRICE_HP_ELECTRICITY;
  const hpWorst = (useful / r.jazWorst) * PRICE_HP_ELECTRICITY;
  const assumptions = [
    `Useful heat = ${fmt(kwh)} kWh × ${BOILER_EFFICIENCY} (old boiler efficiency) = ${fmt(useful)} kWh`,
    `Heat pump = useful heat ÷ JAZ ${r.jaz}${r.jazWorst !== r.jaz ? ` (worst case ${r.jazWorst})` : ''} × ${PRICE_HP_ELECTRICITY * 100} ct/kWh`,
  ];
  let current: number | null = null;
  let label = '';
  const lpg = /lpg|flüssiggas|liquefied/i.test(b.energy_carrier_detail ?? '');
  switch (b.energy_carrier) {
    case 'gas':
      current = kwh * PRICE_GAS;
      label = lpg ? 'LPG (priced as natural gas)' : 'Natural gas';
      assumptions.push(`Gas: ${fmt(kwh)} kWh × ${PRICE_GAS * 100} ct/kWh`);
      if (lpg) assumptions.push('Price assumption: natural-gas price used for LPG; LPG is usually dearer, so real savings are likely higher.');
      break;
    case 'oil': {
      const litres = kwh / KWH_PER_LITRE_OIL;
      current = litres * PRICE_OIL_PER_LITRE;
      label = 'Heating oil';
      assumptions.push(`Oil: ${fmt(litres)} L × ${PRICE_OIL_PER_LITRE.toFixed(2)} €/L (1 L ≈ ${KWH_PER_LITRE_OIL} kWh)`);
      break;
    }
    default:
      label = b.energy_carrier ? `${b.energy_carrier} (no fixed challenge price)` : 'Unknown carrier';
      assumptions.push('No fixed price for this energy carrier, so no current-cost comparison is made.');
  }
  assumptions.push('Excludes heat-pump purchase, installation and a possible meter-cabinet upgrade.');
  return { usefulHeatKwh: Math.round(useful), heatPumpEur: Math.round(hp), heatPumpEurWorst: Math.round(hpWorst), currentEur: current != null ? Math.round(current) : null, currentLabel: label, assumptions };
}
