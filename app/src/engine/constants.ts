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
/** Methods disagree if B lies this far (relative) outside the method-A range. */
export const DISAGREEMENT_TOLERANCE = 0.3;
/** Radiator houses above this specific load probably need > 55 °C flow temperature. */
export const LIKELY_ABOVE_55_W_PER_M2 = 60;
/** Photo AI below this confidence is reported as "unclear". */
export const PHOTO_MIN_CONFIDENCE = 0.7;

/** Confirmed single-pipe: the #1 no-go. Flip to 'yellow' before the pitch if wanted. */
export const SINGLE_PIPE_VERDICT: 'red' | 'yellow' = 'red';

/** W/m² bands by building age (Guardrails 1a). */
export const BANDS = {
  pre1979: { low: 120, high: 180, label: 'Unrenovated, built before 1979' },
  y80s90s: { low: 80, high: 120, label: 'Built 1980s–1990s' },
  y2002: { low: 40, high: 60, label: 'Renovated or built 2002+' },
  lowEnergy: { low: 15, high: 40, label: 'Low-energy house / new build' },
} as const;
