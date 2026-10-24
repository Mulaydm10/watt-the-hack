import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assess } from '@hpr/core/engine/assess';
import dev from '@hpr/core/data/buildings_dev.json';
import evalSet from '@hpr/core/data/buildings_eval.json';
import type { Building } from '@hpr/core/engine/types';
import { emptyProfile, newSession, nextQuestions, runTool, setSlot, toBuilding, deriveState, type Session, type ToolCtx } from '../src';

const dataset = [...(dev as Building[]), ...(evalSet as Building[])];
const ref = (id: string) => assess(dataset.find((b) => b.building_id === id)!);
const reportsDir = mkdtempSync(join(tmpdir(), 'hpr-reports-'));
const ctxFor = (s: Session): ToolCtx => ({ session: s, config: { reportsDir, publicBaseUrl: 'http://localhost:8787' } });

/** Simulates what Astra would do: one tool call per caller answer. */
async function converse(answers: { postcode: string; slots: Record<string, unknown>; units?: Record<string, string>; consent?: boolean; sales?: Record<string, unknown>; contact?: Record<string, unknown> }) {
  const s = newSession('test-' + Math.random().toString(36).slice(2, 8), 'voice', 'en');
  const c = ctxFor(s);
  await runTool(c, 'start_assessment', {});
  await runTool(c, 'set_language', { lang: 'en' });
  await runTool(c, 'lookup_location', { postcode: answers.postcode });
  // Ask exactly what the engine asks for next, answer from the script, until nothing is left.
  for (let i = 0; i < 40; i++) {
    const st = (await runTool(c, 'get_state', {})) as { state: string; next_question: { slot: string } | null };
    if (!['MUST_HAVE', 'DEEPEN'].includes(st.state) || !st.next_question) break;
    const slot = st.next_question.slot;
    const value = slot in answers.slots ? answers.slots[slot] : 'unknown';
    await runTool(c, 'update_profile', { answers: [{ slot, value, unit: answers.units?.[slot] }] });
  }
  await runTool(c, 'confirm_details', { confirmed: true });
  const result = (await runTool(c, 'assess_building', {})) as { verdict: string; heat_load: { best_kw: number } };
  await runTool(c, 'estimate_costs', {});
  await runTool(c, 'deliver_result', {});
  if (answers.sales) await runTool(c, 'update_profile', { answers: Object.entries(answers.sales).map(([slot, value]) => ({ slot, value })) });
  await runTool(c, 'mark_sales_questions_done', {});
  await runTool(c, 'record_consent', { share: answers.consent ?? true, contact: Boolean(answers.contact), photos: false });
  if (answers.contact) await runTool(c, 'update_profile', { answers: Object.entries(answers.contact).map(([slot, value]) => ({ slot, value })) });
  const fin = (await runTool(c, 'finish_session', {})) as { outcome: string; closing_statement: string; report: { lead_id: string; files: string[] } | null };
  return { s, result, fin, asked: s.toolLog.filter((t) => t.tool === 'update_profile').map((t) => (t.args as { answers: { slot: string }[] }).answers[0].slot) };
}

const B02 = { postcode: '82131', slots: { house_type: 'detached', construction_year: 2005, floor_area_m2: 180, energy_carrier: 'gas', consumption: 15500, heat_distribution: 'underfloor', persons_in_household: 3, hot_water_via_heating: 'yes', boiler_age: '10to20', renovation_status: 'unknown', other_heat_sources: ['wood stove', 'solar thermal'], unused_areas: 'no', pv_battery: 'no' } };
const B04 = { postcode: '85221', slots: { house_type: 'semi', construction_year: '1987', floor_area_m2: 160, energy_carrier: 'oil', consumption: '2500 litres', heat_distribution: 'radiators', persons_in_household: 3, hot_water_via_heating: 'yes', boiler_age: 'unknown', renovation_status: 'unknown', pipe_system: 'single-pipe', other_heat_sources: 'none', unused_areas: 'no', uneven_heating: 'no', removals: 'none', pv_battery: 'no', noise_concerns: 'no' }, units: { consumption: 'litres' } };
const B05 = { postcode: '85354', slots: { house_type: 'detached', construction_year: 2006, floor_area_m2: 125, energy_carrier: 'gas', consumption: '27000 kWh', heat_distribution: 'mixed', persons_in_household: 3, hot_water_via_heating: true, boiler_age: '10to20', renovation_status: 'unrenovated', other_heat_sources: ['solar thermal'], rooms: 14, unused_areas: 'no', pv_battery: 'no' } };

describe('profile validation', () => {
  const p = emptyProfile();
  it('consumption units convert and read back', () => {
    const r = setSlot(p, 'consumption', { value: '2.500', unit: 'litres' });
    expect(r.ok && r.value).toMatchObject({ kwh: 25000, amount: 2500, unit: 'litres' });
    expect(r.ok && r.readBack.en).toMatch(/2,500 litres of oil a year, that's about 25,000 kWh/);
  });
  it('decades become estimates', () => {
    const r = setSlot(p, 'construction_year', { value: 'the 70s' });
    expect(r.ok && r.value).toBe(1975);
    expect(p.slots.construction_year.provenance).toBe('user_estimate');
  });
  it('"I don\'t know" is stored as unknown, never as a bad value', () => {
    setSlot(p, 'renovation_status', { value: "I don't know" });
    expect(toBuilding(p).renovation_status).toBeNull();
  });
  it('rejects implausible input with a hint', () => {
    expect(setSlot(p, 'floor_area_m2', { value: 3 }).ok).toBe(false);
    expect(setSlot(p, 'postcode', { value: '123' }).ok).toBe(false);
  });
  it('enum accepts German labels', () => {
    expect(setSlot(p, 'heat_distribution', { value: 'Fußbodenheizung' }).ok && p.slots.heat_distribution.value).toBe('underfloor');
  });
});

describe('next questions: ask only what matters', () => {
  it('ASK questions come first, in order', () => {
    expect(nextQuestions(emptyProfile()).questions.map((q) => q.slot)).toEqual(['lang', 'postcode', 'house_type']);
  });
  it('underfloor heating skips pipe and radiator questions', async () => {
    const { asked } = await converse(B02);
    expect(asked).not.toContain('pipe_system');
    expect(asked).not.toContain('uneven_heating');
  });
  it('the wood stove question is asked because it moves the heat load', async () => {
    const { asked } = await converse(B02);
    expect(asked).toContain('other_heat_sources');
  });
});

describe('scripted conversations reproduce the web-app results', () => {
  it('B-02 → green, same heat load as the dataset, report delivered', async () => {
    const { result, fin } = await converse({ ...B02, sales: { ownership: 'owner', timeline: 'within6m', decision_makers: 'yes' }, contact: { contact_name: 'Test', contact_phone: '0151 000000', contact_time: 'morning' } });
    expect(result.verdict).toBe(ref('B-02').verdict);
    expect(result.heat_load.best_kw).toBe(ref('B-02').heatLoad.bestKw);
    expect(fin.report?.files).toHaveLength(2);
    expect(fin.closing_statement).toMatch(/free and without obligation/);
  });
  it('B-04 → yellow single-pipe, obstacle outcome, 9.5 kW', async () => {
    const { result, fin } = await converse(B04);
    expect(result.verdict).toBe('yellow');
    expect(result.heat_load.best_kw).toBe(9.5);
    expect(fin.outcome).toBe('obstacle');
  });
  it('B-05 → yellow with contradictions, "check your bill" outcome', async () => {
    const { result, fin } = await converse(B05);
    expect(result.verdict).toBe('yellow');
    expect(result.heat_load.best_kw).toBe(10.4);
    expect(fin.outcome).toBe('yellow_contradictions');
  });
  it('no consent → no report, polite close', async () => {
    const { fin } = await converse({ ...B02, consent: false });
    expect(fin.report).toBeNull();
    expect(fin.outcome).toBe('no_consent');
  });
  it('outside the service area → out_of_area outcome', async () => {
    const { fin, s } = await converse({ ...B02, postcode: '50667' });
    expect(s.profile.location?.status).toBe('out');
    expect(fin.outcome).toBe('out_of_area');
  });
});

describe('report contents', () => {
  it('has the decision, areas and facts with provenance, and never age or income', async () => {
    const { fin } = await converse({ ...B02, sales: { ownership: 'owner', timeline: 'asap' } });
    const json = JSON.parse(readFileSync(fin.report!.files[0], 'utf8'));
    expect(json.visit_decision.tier).toMatch(/[ABCD]/);
    expect(json.assessment.areas).toHaveLength(4);
    expect(json.facts.construction_year.provenance).toBe('user_said');
    expect(JSON.stringify(json)).not.toMatch(/"(age|income|income_band|date_of_birth)"/);
  });
});

describe('state machine', () => {
  it('walks GREETING → LOCATION → MUST_HAVE', async () => {
    const s = newSession('sm', 'chat', 'en');
    expect(deriveState(s)).toBe('GREETING');
    await runTool(ctxFor(s), 'start_assessment', {});
    expect(deriveState(s)).toBe('LOCATION');
    await runTool(ctxFor(s), 'set_language', { lang: 'en' });
    await runTool(ctxFor(s), 'lookup_location', { postcode: '82131' });
    expect(deriveState(s)).toBe('MUST_HAVE');
  });
  it('handoff to a human wins over everything', async () => {
    const s = newSession('h', 'voice', 'de');
    await runTool(ctxFor(s), 'handoff_to_human', { reason: 'wants a person' });
    expect(deriveState(s)).toBe('HUMAN_HANDOFF');
  });
});
