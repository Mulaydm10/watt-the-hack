import type { Building, Carrier, Distribution, PipeSystem, Renovation } from './types';

// Inputs arrive from forms, CSV and JSON. Anything implausible becomes "unknown" (null), never a bad value.
const num = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === 'string' ? Number(v.replace(/[\s,.](?=\d{3}\b)/g, '')) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max ? n : null;
};
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | null =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v.trim().toLowerCase()) ? (v.trim().toLowerCase() as T) : null;
const bool = (v: unknown): boolean | null => {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (['yes', 'true', 'ja', '1'].includes(s)) return true;
    if (['no', 'false', 'nein', '0'].includes(s)) return false;
  }
  return null;
};
const str = (v: unknown) => (typeof v === 'string' ? v : '');

export function sanitize(raw: Partial<Record<keyof Building, unknown>>): Building {
  return {
    building_id: str(raw.building_id) || undefined,
    construction_year: num(raw.construction_year, 1800, 2030),
    floor_area_m2: num(raw.floor_area_m2, 15, 5000),
    renovation_status: oneOf<NonNullable<Renovation>>(raw.renovation_status, ['unrenovated', 'partially', 'fully']),
    heat_distribution: oneOf<Distribution>(raw.heat_distribution, ['radiators', 'underfloor', 'mixed']),
    annual_consumption_kwh: num(raw.annual_consumption_kwh, 1, 1_000_000),
    energy_carrier: oneOf<Carrier>(raw.energy_carrier, ['gas', 'oil', 'district', 'electric']),
    energy_carrier_detail: str(raw.energy_carrier_detail),
    radiator_info: str(raw.radiator_info),
    pipe_system: oneOf<PipeSystem>(raw.pipe_system, ['two-pipe', 'single-pipe', 'unknown']) ?? 'unknown',
    flow_temperature_c: num(raw.flow_temperature_c, 20, 95),
    persons_in_household: num(raw.persons_in_household, 0, 30),
    hot_water_via_heating: bool(raw.hot_water_via_heating),
    rooms: num(raw.rooms, 1, 200),
    building_notes: str(raw.building_notes),
    location: str(raw.location),
    verified_on_site: raw.verified_on_site === true || undefined,
    reference_heating_load_kw: num(raw.reference_heating_load_kw, 0, 1000) ?? undefined,
    expected_verdict: oneOf(raw.expected_verdict, ['green', 'yellow', 'red'] as const) ?? undefined,
  };
}
