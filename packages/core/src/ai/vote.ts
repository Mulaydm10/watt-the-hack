// Small helpers for photo classifiers that ask the model several times independently.
// A split vote falls back to "unclear", and disagreement lowers the confidence.

export type Voted<T> = { value: T; count: number };

/** Majority value; without a strict majority the fallback wins (count = size of the biggest group). */
export function majority<T extends string>(values: T[], fallback: T): Voted<T> {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top) return { value: fallback, count: 0 };
  return top[1] > values.length / 2 ? { value: top[0], count: top[1] } : { value: fallback, count: top[1] };
}

export const meanConfidence = (looks: { confidence: number }[]) =>
  looks.length ? looks.reduce((s, l) => s + l.confidence, 0) / looks.length : 0;

export const round2 = (x: number) => Math.round(x * 100) / 100;

/** Model-reported confidence clamped to 0..1; anything that is not a number counts as 0. */
export const clampConfidence = (c: unknown) => (typeof c === 'number' && Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : 0);

/** Keep a model-reported value only if it is one of the allowed values. */
export const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

/** Up to `max` short, non-empty strings. */
export const shortList = (v: unknown, max = 3): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim()).slice(0, max) : [];
