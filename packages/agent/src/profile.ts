// Profile = everything the caller told us, slot by slot, with provenance. Converts to the engine's Building,
// the sales layer's Commitment and PreCheck. Validation and read-back text live here so every channel
// (voice, chat, form) behaves the same.
import type { Building, PhotoFindings } from '@hpr/core/engine/types';
import { NO_COMMITMENT, NO_PRECHECK, type Commitment, type PreCheck } from '@hpr/core/sales/types';
import { SLOT_BY_ID, type Lang, type Slot } from './slots';

export type Provenance = 'user_said' | 'user_estimate' | 'user_unknown' | 'bill_ai' | 'certificate' | 'photo_ai' | 'location_lookup';
export type SlotValue = { value: unknown; unit?: string; provenance: Provenance; at: string; raw?: string };
export type ConsumptionValue = { kwh: number; amount: number; unit: 'kwh' | 'litres' | 'm3' };
/** `mentioned`: the assistant has already told the caller about this finding (it says each one once). */
export type PhotoRecord = { id: string; kind: string; path: string; at: string; finding?: unknown; mentioned?: boolean;
  /** analysed = finding ready · stored = kept for the technician, no automatic analysis · failed = analysis error (photo kept). */
  analysis?: 'analysed' | 'stored' | 'failed'; error?: string };
export type LocationInfo = { postcode: string; area: string; status: 'in' | 'out' | 'unknown'; region?: string; subsidyTopUp?: string };

export type Profile = {
  slots: Record<string, SlotValue>;
  location?: LocationInfo;
  photos: PhotoRecord[];
  pipePhoto?: PhotoFindings;
  meterCabinet?: PreCheck['meterCabinet'];
  outdoor?: { space1x1: 'yes' | 'no' | 'unsure'; neighbourOk: 'yes' | 'no' | 'unsure'; distance_m?: number };
};

export const emptyProfile = (): Profile => ({ slots: {}, photos: [] });

const UNKNOWN = /^(unknown|unsure|not sure|don'?t know|i don'?t know|weiß nicht|keine ahnung|n\/a|-)$/i;
const isUnknown = (v: unknown) => v == null || v === 'unknown' || (typeof v === 'string' && UNKNOWN.test(v.trim()));

const toNumber = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  // "25.000" / "25,000" thousands, "9,5" decimal comma
  const s = v.trim().replace(/\s/g, '').replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.');
  const n = Number(s.replace(/[^\d.-]/g, ''));
  return s.match(/\d/) && Number.isFinite(n) ? n : null;
};

export type SetResult =
  | { ok: true; slot: string; value: unknown; readBack: Record<Lang, string>; warnings: string[] }
  | { ok: false; slot: string; error: string; hint: Record<Lang, string> };

const fmt = (n: number, lang: Lang) => n.toLocaleString(lang === 'de' ? 'de-DE' : 'en-US');

function matchOption(slot: Slot, v: unknown): string | null {
  if (typeof v === 'boolean' && slot.type === 'boolean') return v ? 'yes' : 'no';
  const s = String(v).trim().toLowerCase();
  const o = slot.options?.find((x) => x.value.toLowerCase() === s || x.en.toLowerCase() === s || x.de.toLowerCase() === s);
  return o?.value ?? null;
}

/** Validate, normalise and store one answer. Returns read-back text the assistant must confirm with the caller. */
export function setSlot(p: Profile, id: string, input: { value: unknown; unit?: string; provenance?: Provenance; estimate?: boolean }): SetResult {
  const slot = SLOT_BY_ID[id];
  if (!slot) return { ok: false, slot: id, error: 'unknown slot', hint: { en: 'Unknown question.', de: 'Unbekannte Frage.' } };
  const at = new Date().toISOString();
  const store = (value: unknown, prov: Provenance, extra: Partial<SlotValue> = {}) => { p.slots[id] = { value, provenance: prov, at, raw: typeof input.value === 'string' ? input.value : undefined, ...extra }; };
  const fail = (en: string, de: string): SetResult => ({ ok: false, slot: id, error: en, hint: { en, de } });

  if (isUnknown(input.value)) {
    store('unknown', 'user_unknown');
    return { ok: true, slot: id, value: 'unknown', readBack: { en: "Noted, that's not known. A technician can check it.", de: 'Notiert, das ist nicht bekannt. Ein Techniker kann es prüfen.' }, warnings: [] };
  }
  const prov: Provenance = input.provenance ?? (input.estimate ? 'user_estimate' : 'user_said');
  const warnings: string[] = [];

  switch (slot.type) {
    case 'postcode': {
      const pc = String(input.value).replace(/\D/g, '');
      if (pc.length !== 5) return fail('A German postcode has five digits.', 'Eine Postleitzahl hat fünf Ziffern.');
      store(pc, prov);
      const digits = pc.split('').join(', ');
      return { ok: true, slot: id, value: pc, readBack: { en: `Postcode ${digits}.`, de: `Postleitzahl ${digits}.` }, warnings };
    }
    case 'year': {
      const s = String(input.value).toLowerCase();
      const decade = s.match(/(\d{2,4})\s*(s|er|'s)\b/);
      let y = toNumber(decade ? decade[1] : input.value);
      let estimate = Boolean(decade) || input.estimate;
      if (y != null && y < 100) y = y + (y > 30 ? 1900 : 2000);
      if (decade && y != null) { y = Math.floor(y / 10) * 10 + 5; estimate = true; }
      if (y == null || y < (slot.min ?? 0) || y > (slot.max ?? 9999)) return fail('That year looks unusual. Roughly when was it built?', 'Das Jahr wirkt ungewöhnlich. Wann ungefähr?');
      store(y, estimate ? 'user_estimate' : prov);
      return { ok: true, slot: id, value: y, readBack: estimate ? { en: `Around ${y}.`, de: `Etwa ${y}.` } : { en: `Built in ${y}.`, de: `Baujahr ${y}.` }, warnings };
    }
    case 'number': {
      const n = toNumber(input.value);
      if (n == null || n < (slot.min ?? -Infinity) || n > (slot.max ?? Infinity)) return fail('That number looks unusual. Could you say it again?', 'Die Zahl wirkt ungewöhnlich. Noch einmal bitte?');
      if (id === 'floor_area_m2' && n > 600) warnings.push('Very large heated area; confirm it is the heated living area.');
      store(n, prov);
      const unit = id === 'floor_area_m2' ? ' m²' : id === 'flow_temperature_c' ? ' °C' : id === 'certificate_kwh_m2a' ? ' kWh/m²' : '';
      return { ok: true, slot: id, value: n, readBack: { en: `${fmt(n, 'en')}${unit}.`, de: `${fmt(n, 'de')}${unit}.` }, warnings };
    }
    case 'enum': {
      const o = matchOption(slot, input.value);
      if (!o) return fail(`Please choose one of: ${slot.options?.map((x) => x.en).join(', ')}.`, `Bitte eine Option wählen: ${slot.options?.map((x) => x.de).join(', ')}.`);
      store(o, prov);
      const opt = slot.options!.find((x) => x.value === o)!;
      return { ok: true, slot: id, value: o, readBack: { en: `${opt.en}.`, de: `${opt.de}.` }, warnings };
    }
    case 'boolean': {
      const s = String(input.value).trim().toLowerCase();
      const b = input.value === true || ['yes', 'y', 'ja', 'true', '1'].includes(s) ? true : input.value === false || ['no', 'n', 'nein', 'false', '0'].includes(s) ? false : null;
      if (b == null) return fail('Please answer yes or no, or say you are not sure.', 'Bitte mit Ja oder Nein antworten, oder „weiß nicht".');
      store(b, prov);
      return { ok: true, slot: id, value: b, readBack: { en: b ? 'Yes.' : 'No.', de: b ? 'Ja.' : 'Nein.' }, warnings };
    }
    case 'multi': {
      const arr = (Array.isArray(input.value) ? input.value : String(input.value).split(/[,;]| and | und /)).map((x) => String(x).trim()).filter(Boolean);
      const vals = arr.map((x) => matchOption(slot, x) ?? x.toLowerCase()).filter((x) => x !== 'none');
      store(vals, prov);
      return { ok: true, slot: id, value: vals, readBack: { en: vals.length ? `${vals.join(', ')}.` : 'Nothing.', de: vals.length ? `${vals.join(', ')}.` : 'Nichts.' }, warnings };
    }
    case 'consumption': {
      const amount = toNumber(input.value);
      const raw = `${input.unit ?? ''} ${typeof input.value === 'string' ? input.value : ''}`.toLowerCase();
      const unit: ConsumptionValue['unit'] = /l(iter|itre)?s?\b|liter/.test(raw) ? 'litres' : /m3|m³|kubik|cubic/.test(raw) ? 'm3' : 'kwh';
      if (amount == null || amount <= 0) return fail('How much per year, and in which unit?', 'Wie viel pro Jahr, und in welcher Einheit?');
      const kwh = unit === 'kwh' ? amount : amount * 10;
      if (kwh < 500 || kwh > 1_000_000) return fail('That amount looks unusual for a year. Could you check the bill?', 'Die Menge wirkt ungewöhnlich für ein Jahr. Bitte auf der Rechnung prüfen.');
      const value: ConsumptionValue = { kwh, amount, unit };
      store(value, prov, { unit });
      const u = { kwh: ['kWh', 'kWh'], litres: ['litres of oil', 'Liter Öl'], m3: ['cubic metres of gas', 'Kubikmeter Gas'] }[unit];
      const conv = unit === 'kwh' ? ['', ''] : [`, that's about ${fmt(kwh, 'en')} kWh`, `, das sind etwa ${fmt(kwh, 'de')} kWh`];
      return { ok: true, slot: id, value, readBack: { en: `${fmt(amount, 'en')} ${u[0]} a year${conv[0]}.`, de: `${fmt(amount, 'de')} ${u[1]} im Jahr${conv[1]}.` }, warnings };
    }
    case 'text':
    default: {
      const s = String(input.value).trim().slice(0, 500);
      store(s, prov);
      return { ok: true, slot: id, value: s, readBack: { en: 'Noted.', de: 'Notiert.' }, warnings };
    }
  }
}

const val = (p: Profile, id: string) => { const v = p.slots[id]?.value; return v === 'unknown' ? null : v; };

function notes(p: Profile): string {
  const parts: string[] = [];
  const other = (val(p, 'other_heat_sources') as string[] | null) ?? [];
  if (other.includes('wood stove')) parts.push('A wood stove is used.');
  if (other.includes('solar thermal')) parts.push('Solar thermal system for hot water present.');
  if (val(p, 'unused_areas') === true) parts.push('Part of the house is not heated.');
  const measures = (val(p, 'renovation_measures') as string[] | null) ?? [];
  if (measures.length) parts.push(`Renovated: ${measures.join(', ')}.`);
  if (val(p, 'pv_battery') === true) parts.push('PV system or battery present.');
  const rem = (val(p, 'removals') as string[] | null) ?? [];
  if (rem.length) parts.push(`To remove: ${rem.join(', ')}.`);
  const planned = val(p, 'planned_changes');
  if (planned) parts.push(`Planned changes: ${planned}.`);
  const noise = val(p, 'noise_concerns');
  if (noise) parts.push(`Noise/placement concerns: ${noise}.`);
  return parts.join(' ');
}

/** Engine input. Unknown answers become null ("not documented"), never a bad value. */
export function toBuilding(p: Profile, id = 'session'): Building {
  const carrier = val(p, 'energy_carrier') as string | null;
  const cons = val(p, 'consumption') as ConsumptionValue | null;
  const hw = val(p, 'hot_water_via_heating') as boolean | null;
  const hwSystem = val(p, 'hot_water_system');
  const pipe = val(p, 'pipe_system') as Building['pipe_system'] | null;
  const detail = [
    carrier === 'lpg' ? 'liquefied petroleum gas (LPG)' : null,
    cons && cons.unit === 'litres' ? `heating oil, approx. ${cons.amount.toLocaleString('en-US')} litres per year` : null,
  ].filter(Boolean).join('; ');
  return {
    building_id: id,
    construction_year: val(p, 'construction_year') as number | null,
    floor_area_m2: val(p, 'floor_area_m2') as number | null,
    renovation_status: val(p, 'renovation_status') as Building['renovation_status'],
    heat_distribution: val(p, 'heat_distribution') as Building['heat_distribution'],
    annual_consumption_kwh: cons?.kwh ?? null,
    energy_carrier: (carrier === 'lpg' ? 'gas' : carrier) as Building['energy_carrier'],
    energy_carrier_detail: detail || undefined,
    pipe_system: pipe ?? 'unknown',
    flow_temperature_c: val(p, 'flow_temperature_c') as number | null,
    persons_in_household: val(p, 'persons_in_household') as number | null,
    hot_water_via_heating: hwSystem === 'central' ? true : hwSystem ? false : hw,
    rooms: val(p, 'rooms') as number | null,
    building_notes: notes(p),
    location: p.location ? `${p.location.region ?? 'Area'} (${p.location.area})` : undefined,
    house_type: val(p, 'house_type') as Building['house_type'],
    units_in_building: val(p, 'units_in_building') as number | null,
    approval_needed: val(p, 'approval_needed') as boolean | null,
    certificate_kwh_m2a: val(p, 'certificate_kwh_m2a') as number | null,
    uneven_heating: val(p, 'uneven_heating') as boolean | null,
  };
}

export function toCommitment(p: Profile): Commitment {
  return {
    ...NO_COMMITMENT,
    ownership: val(p, 'ownership') as Commitment['ownership'],
    boiler: val(p, 'boiler_age') as Commitment['boiler'],
    timeline: val(p, 'timeline') as Commitment['timeline'],
    decisionMakers: val(p, 'decision_makers') as Commitment['decisionMakers'],
  };
}

export function toPreCheck(p: Profile): PreCheck {
  const has = (kind: string) => p.photos.some((x) => x.kind === kind);
  return {
    ...NO_PRECHECK,
    meterCabinet: p.meterCabinet ?? (has('meter_cabinet') ? 'unclear' : null),
    outdoorSpot: p.outdoor ? { space1x1: p.outdoor.space1x1, neighbourOk: p.outdoor.neighbourOk, houseType: (val(p, 'house_type') === 'apartment' ? 'multi' : val(p, 'house_type') ?? undefined) as never } : null,
    boilerRoomPhoto: has('boiler_room'),
    radiatorPhoto: has('radiator'),
  };
}
