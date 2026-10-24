import type { Carrier } from '../engine/types';
import { askJson, fileToImage, image, text } from './llm';

export type BillReading = {
  annual_consumption_kwh: number | null;
  energy_carrier: Carrier | null;
  cost_eur: number | null;
  period: string | null;
};

const SYSTEM = `You read German energy bills (Jahresabrechnung). Extract the yearly heating-fuel consumption in kWh
(convert: 1 m³ gas ≈ 10 kWh, 1 litre heating oil ≈ 10 kWh), the energy carrier, the total cost in € and the billing period.
If a value is not on the bill, use null. Never guess numbers.
Reply with ONLY JSON: {"annual_consumption_kwh":number|null,"energy_carrier":"gas"|"oil"|"district"|"electric"|null,"cost_eur":number|null,"period":string|null}`;

/** Bonus: prefill the form from a bill photo or PDF. The user confirms every value. */
export async function readBill(file: File): Promise<BillReading> {
  return askJson<BillReading>(SYSTEM, [image(await fileToImage(file)), text('Extract the values from this bill.')]);
}
