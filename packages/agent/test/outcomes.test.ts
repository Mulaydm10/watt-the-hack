import { describe, expect, it } from 'vitest';
import { assess } from '@hpr/core/engine/assess';
import dev from '@hpr/core/data/buildings_dev.json';
import type { Building } from '@hpr/core/engine/types';
import { addWorkingDays, callbackPhrase, DEFAULT_OUTCOME_CONFIG, mergeOutcomeConfig, outcomeText } from '../src/outcomes';

const a = assess((dev as Building[])[1]); // B-02 green
const FRIDAY = new Date('2026-10-23T10:00:00Z');

describe('dynamic outcome promises', () => {
  it('working days skip the weekend and holidays', () => {
    expect(addWorkingDays(FRIDAY, 2).toISOString().slice(0, 10)).toBe('2026-10-27');           // Fri + 2 → Tue
    expect(addWorkingDays(FRIDAY, 2, ['2026-10-26']).toISOString().slice(0, 10)).toBe('2026-10-28');
  });
  it('callback phrase has the date and the preferred time, in both languages', () => {
    expect(callbackPhrase('en', 2, FRIDAY, [], 'morning')).toBe('by Tuesday 27 October, in the morning');
    expect(callbackPhrase('de', 2, FRIDAY, [], 'afternoon')).toBe('bis Dienstag, 27. Oktober, nachmittags');
  });
  it('green A promises a dated callback', () => {
    expect(outcomeText('green_A', 'en', { a, d: null, now: FRIDAY, preferredTime: 'morning' })).toMatch(/call you by Tuesday 27 October, in the morning/);
  });
  it('outcomes without a callback promise none', () => {
    const t = outcomeText('yellow_contradictions', 'en', { a, d: null, now: FRIDAY });
    expect(t).not.toMatch(/by \w+day/);
  });
  it('config changes the promise without code: more days, a callback for red, a custom text', () => {
    const cfg = mergeOutcomeConfig({ rules: { ...DEFAULT_OUTCOME_CONFIG.rules, green_A: { callbackWorkingDays: 5 }, red: { callbackWorkingDays: 1 }, green_B: { callbackWorkingDays: 2, override: { en: 'Custom: we call {callback}. Ref {ref}.' } } } });
    expect(outcomeText('green_A', 'en', { a, d: null, now: FRIDAY, cfg })).toMatch(/by Friday 30 October/);
    expect(outcomeText('red', 'en', { a, d: null, now: FRIDAY, cfg })).toMatch(/call you by Monday 26 October/);
    expect(outcomeText('green_B', 'en', { a, d: null, now: FRIDAY, cfg, ref: 'L-1' })).toMatch(/^Custom: we call by Tuesday 27 October\. Ref L-1\./);
  });
});
