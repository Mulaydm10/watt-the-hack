import { describe, expect, it } from 'vitest';
import dev from '../data/buildings_dev.json';
import evalSet from '../data/buildings_eval.json';
import { assess } from '../engine/assess';
import type { Building } from '../engine/types';
import { DEFAULT_CONFIG } from './config';
import { commitmentLevel, visitDecision, visitMinutes } from './visitDecision';
import { NO_COMMITMENT, NO_PRECHECK, type Commitment, type Lead, type PreCheck } from './types';

const all = [...(dev as Building[]), ...(evalSet as Building[])];
const byId = (id: string) => all.find((b) => b.building_id === id)!;
const FULL_PRE: PreCheck = { meterCabinet: 'modern', outdoorSpot: { space1x1: 'yes', neighbourOk: 'yes' }, boilerRoomPhoto: true, radiatorPhoto: true };
const COMMITTED: Commitment = { ownership: 'owner', boiler: '10to20', timeline: 'within6m', decisionMakers: 'yes', subsidiesLooked: 'yes', sharePhotos: 'yes' };
const lead = (b: Building, commitment = NO_COMMITMENT, preCheck = NO_PRECHECK): Lead =>
  ({ id: b.building_id ?? 'x', building: b, commitment, preCheck, consent: true, source: 'demo', createdAt: '' });

describe('visit decision tiers', () => {
  it('A: B-02 green, committed owner, pre-check done → send expert now', () => {
    const d = visitDecision(lead(byId('B-02'), COMMITTED, FULL_PRE));
    expect(d.tier).toBe('A');
    expect(d.reasons.length).toBeGreaterThan(0);
  });
  it('B: B-04 single-pipe warning → video call first', () => {
    const d = visitDecision(lead(byId('B-04'), COMMITTED, FULL_PRE));
    expect(d.tier).toBe('B');
    expect(d.reasons.join(' ')).toMatch(/Single-pipe/);
  });
  it('C: B-05 contradictions → ask for info first', () => {
    const d = visitDecision(lead(byId('B-05'), COMMITTED, FULL_PRE));
    expect(d.tier).toBe('C');
    expect(d.reasons.join(' ')).toMatch(/contradictions/i);
  });
  it('C: tenant → include the owner first', () => {
    expect(visitDecision(lead(byId('B-02'), { ...COMMITTED, ownership: 'tenant' }, FULL_PRE)).tier).toBe('C');
  });
  it('D: just curious → nurture, reasons given', () => {
    const d = visitDecision(lead(byId('B-02'), { ...COMMITTED, timeline: 'curious' }, FULL_PRE));
    expect(d.tier).toBe('D');
    expect(d.reasons.length).toBeGreaterThan(0);
  });
  it('D: a red obstacle → not now', () => {
    const b = { ...byId('B-03'), building_notes: 'No space for an outdoor unit.' };
    expect(visitDecision(lead(b, COMMITTED, FULL_PRE)).tier).toBe('D');
  });
  it('unknown commitment answers alone never give D', () => {
    for (const b of all) expect(visitDecision(lead(b)).tier).not.toBe('D');
  });
  it('low pre-check keeps a good lead at B, saying why', () => {
    const d = visitDecision(lead(byId('B-02'), COMMITTED, NO_PRECHECK));
    expect(d.tier).toBe('B');
    expect(d.reasons.join(' ')).toMatch(/pre-check/);
  });
});

describe('sales never changes the technical verdict', () => {
  const answers: Commitment[] = [NO_COMMITMENT, COMMITTED, { ...COMMITTED, ownership: 'tenant' }, { ...COMMITTED, timeline: 'curious', boiler: 'broken' }];
  for (const b of all) {
    it(`${b.building_id}`, () => {
      const before = JSON.stringify(assess(b));
      for (const c of answers) for (const p of [NO_PRECHECK, FULL_PRE]) visitDecision(lead(b, c, p));
      expect(JSON.stringify(assess(b))).toBe(before);
    });
  }
});

describe('expected value maths (default config)', () => {
  it('B-02 tier A: 35% +5 owner +5 6m +5 pre-check +5 green = 55% → 0.55 × 3000 − 250 = 1400', () => {
    const d = visitDecision(lead(byId('B-02'), COMMITTED, FULL_PRE));
    expect(d.saleProbability).toBeCloseTo(0.55);
    expect(d.expectedValueEur).toBe(1400);
    expect(d.worthIt).toBe(true);
  });
  it('probability is capped between 5% and 90%', () => {
    const d = visitDecision(lead(byId('B-02'), { ...COMMITTED, timeline: 'curious', ownership: 'tenant' }, NO_PRECHECK));
    expect(d.saleProbability).toBeGreaterThanOrEqual(DEFAULT_CONFIG.minProbability);
  });
  it('raising the visit cost changes the decision value live', () => {
    const l = lead(byId('B-04'), COMMITTED, FULL_PRE);
    expect(visitDecision(l, { ...DEFAULT_CONFIG, visitCostEur: 5000 }).worthIt).toBe(false);
  });
  it('visit gets shorter with more pre-check', () => {
    expect(visitMinutes(100)).toBeLessThan(visitMinutes(0));
  });
  it('commitment: no answers = unknown, not low', () => {
    expect(commitmentLevel(NO_COMMITMENT).level).toBe('unknown');
  });
});
