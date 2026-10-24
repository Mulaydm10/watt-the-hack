// Fixed challenge assumptions (Technical Guardrails). Every number the UI shows comes from here.
export const PRICE_HP_ELECTRICITY = 0.26; // €/kWh
export const PRICE_GAS = 0.11; // €/kWh
export const PRICE_OIL_PER_LITRE = 1.7; // €/L (≈ 0.17 €/kWh)
export const KWH_PER_LITRE_OIL = 10;
export const KWH_PER_M3_GAS = 10;
export const BOILER_EFFICIENCY = 0.88;
export const HOT_WATER_KWH_PER_PERSON = 1000;
export const FULL_LOAD_HOURS = 2000;

export const JAZ_UNDERFLOOR = 4.0;
export const JAZ_RAD_55 = 3.5;
export const JAZ_RAD_60 = 2.8;

export const INSULATION_HINT_W_PER_M2 = 75;
export const TOO_HIGH_W_PER_M2 = 120;
/** Method B below this (W/m²) with no explanation is treated as an implausible bill. */
export const IMPLAUSIBLY_LOW_W_PER_M2 = 25;
/** When the bill is distrusted, size at the low end of the area band plus this margin. */
export const LOW_END_MARGIN_W_PER_M2 = 10;
/** Bill (kWh/m²) and energy certificate disagree beyond this share → contradiction (cross-check only). */
export const CERTIFICATE_TOLERANCE = 0.4;
/** Methods disagree if B lies this far (relative) outside the method-A range. */
export const DISAGREEMENT_TOLERANCE = 0.3;
/** Radiator houses above this specific load probably need > 55 °C flow temperature. */
export const LIKELY_ABOVE_55_W_PER_M2 = 60;
/** Photo AI below this confidence is reported as "unclear". */
export const PHOTO_MIN_CONFIDENCE = 0.7;

/** Confirmed single-pipe: the #1 no-go. Flip to 'yellow' before the pitch if wanted. */
export const SINGLE_PIPE_VERDICT: 'red' | 'yellow' = 'yellow';

const GUARDRAILS = 'nuuEnergy Technical Guardrails';
const OURS = 'Our calibration rule (dev cases B-01..B-03)';

/** Every constant the engine uses, with its source, for the "Assumptions" panel. */
export const ASSUMPTIONS: { label: string; value: string; source: string }[] = [
  { label: 'Heat-pump electricity', value: `${PRICE_HP_ELECTRICITY * 100} ct/kWh`, source: GUARDRAILS },
  { label: 'Natural gas', value: `${PRICE_GAS * 100} ct/kWh`, source: GUARDRAILS },
  { label: 'Heating oil', value: `${PRICE_OIL_PER_LITRE.toFixed(2)} €/L (≈ 17 ct/kWh)`, source: GUARDRAILS },
  { label: 'Energy content', value: `1 L oil ≈ ${KWH_PER_LITRE_OIL} kWh, 1 m³ gas ≈ ${KWH_PER_M3_GAS} kWh`, source: GUARDRAILS },
  { label: 'Old-boiler efficiency', value: `${BOILER_EFFICIENCY}`, source: GUARDRAILS },
  { label: 'Hot water', value: `${HOT_WATER_KWH_PER_PERSON} kWh per person per year`, source: GUARDRAILS },
  { label: 'Full-load hours', value: `${FULL_LOAD_HOURS} h/year`, source: GUARDRAILS },
  { label: 'JAZ', value: `${JAZ_UNDERFLOOR} underfloor · ${JAZ_RAD_55} radiators ≤ 55 °C · ${JAZ_RAD_60} radiators 55–60 °C`, source: GUARDRAILS },
  { label: 'Heat load by age', value: '120–180 / 80–120 / 40–60 / 15–40 W/m²', source: GUARDRAILS },
  { label: 'Insulation hint above', value: `${INSULATION_HINT_W_PER_M2} W/m²`, source: GUARDRAILS },
  { label: 'Load too high above', value: `${TOO_HIGH_W_PER_M2} W/m²`, source: OURS },
  { label: 'Bill implausibly low below', value: `${IMPLAUSIBLY_LOW_W_PER_M2} W/m²`, source: OURS },
  { label: 'Bill vs energy certificate beyond', value: `${CERTIFICATE_TOLERANCE * 100}%`, source: OURS },
  { label: 'Wall/ceiling heating', value: 'treated like underfloor (JAZ 4.0), technician confirms', source: OURS },
  { label: 'Methods disagree beyond', value: `${DISAGREEMENT_TOLERANCE * 100}%`, source: OURS },
  { label: 'Radiators likely > 55 °C above', value: `${LIKELY_ABOVE_55_W_PER_M2} W/m²`, source: OURS },
  { label: 'Photo AI minimum confidence', value: `${PHOTO_MIN_CONFIDENCE * 100}%`, source: OURS },
  { label: 'Confirmed single-pipe', value: SINGLE_PIPE_VERDICT === 'yellow' ? 'yellow + strong warning' : 'red', source: OURS },
];

/** W/m² bands by building age (Guardrails 1a). */
export const BANDS = {
  pre1979: { low: 120, high: 180, label: 'Unrenovated, built before 1979' },
  y80s90s: { low: 80, high: 120, label: 'Built 1980s–1990s' },
  y2002: { low: 40, high: 60, label: 'Renovated or built 2002+' },
  lowEnergy: { low: 15, high: 40, label: 'Low-energy house / new build' },
} as const;
