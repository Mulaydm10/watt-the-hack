import { mkdtempSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MemoryStore, newSession } from '@hpr/agent';
import { guardReply, numbersIn } from '../src/guard';
import { handleTurn, startConversation } from '../src/agent';
import { buildServer } from '../src/server';
import { RuleModel } from './ruleModel';

const config = { reportsDir: mkdtempSync(join(tmpdir(), 'orch-')), publicBaseUrl: 'http://localhost' };

describe('guard', () => {
  const s = newSession('g', 'chat', 'en');
  s.toolLog.push({ at: '', tool: 'estimate_costs', args: {}, result: { heat_pump_eur_per_year: 2043, current: 4250 }, ms: 0 });
  s.toolLog.push({ at: '', tool: 'assess_building', args: {}, result: { verdict: 'yellow' }, ms: 0 });
  s.messages.push({ role: 'user', content: 'We use 2,500 litres of oil' });
  it('reads German and English number formats', () => {
    expect(numbersIn('2.043 €')).toContain(2043);
    expect(numbersIn('9,5 kW')).toContain(9.5);
  });
  it('allows numbers from tools and the caller', () => {
    expect(guardReply(s, 'About 2,043 euros instead of 4.250 euros; you said 2500 litres.').ok).toBe(true);
  });
  it('blocks invented numbers', () => {
    expect(guardReply(s, 'You will save 3,100 euros.').violations[0]).toMatch(/3,100/);
  });
  it('blocks a verdict that differs from the assessment', () => {
    expect(guardReply(s, 'Good news, your home is green!').ok).toBe(false);
    expect(guardReply(s, 'Your result is yellow.').ok).toBe(true);
  });
  it('blocks pressure and sensitive asks, but allows the "we never ask" line', () => {
    expect(guardReply(s, 'Only today: sign now!').ok).toBe(false);
    expect(guardReply(s, 'Please tell me your IBAN.').ok).toBe(false);
    expect(guardReply(s, 'nuuEnergy will never ask for bank details or passwords.').ok).toBe(true);
  });
});

/** Run a whole conversation through handleTurn with the rule model. */
async function talk(lines: string[], lang: 'en' | 'de' = 'en') {
  const s = newSession('t-' + Math.random().toString(36).slice(2, 7), 'voice', lang);
  const model = new RuleModel();
  const replies = [startConversation(s)];
  for (const line of lines) {
    const r = await handleTurn(s, line, model, config);
    replies.push(r.reply);
    expect(r.guard.fallback).toBe(false);
  }
  return { s, replies };
}

// Order follows the engine's own next-question logic (see the trace in the PR): ASK block, then only the decisive /
// applicable ADAPT questions (pipe system, other heat sources, PV, oil tank/chimney, planned changes, noise).
const B04_LINES = ['yes', 'en', '85221', 'semi', '1987', '160', 'oil', '2500 litres', 'radiators', '3', 'yes', "don't know", "don't know",
  'single-pipe', 'no', 'no', 'no', 'none', 'no', 'yes', 'ok', 'owner', 'within6m', 'yes', 'skip', 'yes'];

describe('orchestrator loop (rule model, no LLM)', () => {
  it('greets with the free / no-obligation / no-bank-details promise', async () => {
    const { replies } = await talk([]);
    // Voice opens bilingually so the caller can answer in either language.
    expect(replies[0]).toMatch(/kostenlos und unverbindlich.*nie nach Bankdaten.*Shall we start/s);
    const chat = newSession('c', 'chat', 'en');
    expect(startConversation(chat)).toMatch(/free and without obligation.*never ask you for bank details/s);
  });
  it('B-04 by voice: one question per turn, yellow result, report sent', async () => {
    const { s, replies } = await talk(B04_LINES);
    expect(replies.some((r) => /Your result is yellow/.test(r))).toBe(true);
    expect(s.flags.finished).toBe(true);
    expect(s.leadId).toMatch(/^L-/);
    expect(replies.at(-1)).toMatch(/closer look|free and without obligation/);
  });
  it('bad model reply is caught by the guard and rewritten (retry) or replaced (fallback)', async () => {
    const s = newSession('bad', 'chat', 'en');
    const model = new RuleModel();
    startConversation(s);
    model.badRepliesLeft = 1;
    const r = await handleTurn(s, 'yes', model, config);
    expect(r.guard.retried).toBe(true);
    expect(r.reply).not.toMatch(/9999/);
  });
});

describe('HTTP API', () => {
  const store = new MemoryStore();
  const server = buildServer(store, config, new RuleModel());
  let base = '';
  beforeAll(async () => { await new Promise<void>((r) => server.listen(0, r)); base = `http://localhost:${(server.address() as AddressInfo).port}`; });
  afterAll(() => server.close());
  const post = (p: string, body: unknown) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());

  it('session → messages → result → slots', async () => {
    const start = await post('/sessions', { channel: 'chat', lang: 'en' });
    expect(start.messages[0]).toMatch(/nuuEnergy/);
    for (const line of B04_LINES.slice(0, 14)) await post(`/sessions/${start.session_id}/messages`, { text: line });
    const st = await fetch(`${base}/sessions/${start.session_id}`).then((r) => r.json());
    expect(st.slots.construction_year.value).toBe(1987);
    const result = await fetch(`${base}/sessions/${start.session_id}/result`).then((r) => r.json());
    expect(result.areas).toHaveLength(4);
    const slots = await fetch(`${base}/slots?lang=de`).then((r) => r.json());
    expect(slots.find((x: { id: string }) => x.id === 'postcode').question).toMatch(/Postleitzahl/);
  });
  it('upload page and photo upload', async () => {
    const start = await post('/sessions', { lang: 'de' });
    const page = await fetch(`${base}/upload/${start.session_id}`).then((r) => r.text());
    expect(page).toMatch(/Zählerschrank/);
    const up = await fetch(`${base}/sessions/${start.session_id}/photos?kind=meter_cabinet`, { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: new Uint8Array([255, 216, 255]) });
    expect(up.status).toBe(201);
    const bad = await fetch(`${base}/sessions/${start.session_id}/photos?kind=x`, { method: 'POST', headers: { 'content-type': 'text/html' }, body: 'x' });
    expect(bad.status).toBe(415);
  });
  it('pause and resume', async () => {
    const start = await post('/sessions', { lang: 'en' });
    const p = await post(`/sessions/${start.session_id}/pause`, {});
    const r = await post('/sessions/resume', { resume_code: p.resume_code });
    expect(r.session_id).toBe(start.session_id);
  });
});

describe('ElevenLabs custom-LLM bridge', () => {
  const store = new MemoryStore();
  const server = buildServer(store, config, new RuleModel());
  let base = '';
  beforeAll(async () => { await new Promise<void>((r) => server.listen(0, r)); base = `http://localhost:${(server.address() as AddressInfo).port}`; });
  afterAll(() => server.close());
  const turn = (text: string, stream = true) => fetch(`${base}/v1/chat/completions`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ stream, messages: [{ role: 'system', content: 'conversation_id: conv_123\nlanguage: en' }, { role: 'user', content: text }] }),
  });

  it('streams an OpenAI-style SSE reply and keeps one session per ElevenLabs conversation', async () => {
    const r = await turn('yes');
    expect(r.headers.get('content-type')).toMatch(/event-stream/);
    const body = await r.text();
    expect(body).toMatch(/chat\.completion\.chunk/);
    expect(body.trim().endsWith('data: [DONE]')).toBe(true);
    const said = body.split('\n').filter((l) => l.startsWith('data: {')).map((l) => JSON.parse(l.slice(6)).choices[0].delta.content ?? '').join('');
    expect(said).toMatch(/English or German/);
    await turn('en');
    const s = store.get('el-conv_123')!;
    expect(s.channel).toBe('voice');
    expect(s.profile.slots.lang.value).toBe('en');
  });
  it('non-streaming mode returns a normal completion', async () => {
    const j = await (await turn('85221', false)).json();
    expect(j.choices[0].message.content).toMatch(/kind of home/);
  });
});

describe('dynamic language', () => {
  it('detects German and English, ignores weak signals', async () => {
    const { detectLanguage } = await import('../src/language');
    expect(detectLanguage('Ja, ich habe eine Ölheizung im Haus')).toBe('de');
    expect(detectLanguage('Yes, we have oil heating in the house')).toBe('en');
    expect(detectLanguage('ok')).toBeNull();
    expect(detectLanguage('85221')).toBeNull();
    expect(detectLanguage('Können wir auf Deutsch weitermachen?')).toBe('de');
  });
  it('switches the session mid-call and back', async () => {
    const s = newSession('lang', 'voice', 'en');
    const model = new RuleModel();
    const greet = startConversation(s);
    expect(greet).toMatch(/europäische Sprache.*another European language/s);
    await handleTurn(s, 'Ja, gerne, wir können anfangen', model, config);
    expect(s.lang).toBe('de');
    const r = await handleTurn(s, 'Sorry, can we speak English please, I know it better', model, config);
    expect(s.lang).toBe('en');
    expect(r.reply).toMatch(/[A-Za-z]/);
  });
});

describe('European languages', () => {
  it('detects fr, it, es, nl, pl, pt', async () => {
    const { detectLanguage } = await import('../src/language');
    expect(detectLanguage('Oui, nous avons une maison avec chauffage au fioul')).toBe('fr');
    expect(detectLanguage('Sì, abbiamo una casa con riscaldamento a gasolio')).toBe('it');
    expect(detectLanguage('Sí, tenemos una casa con calefacción de gasóleo')).toBe('es');
    expect(detectLanguage('Ja, we hebben een huis met verwarming op olie')).toBe('nl');
    expect(detectLanguage('Tak, mamy dom z ogrzewaniem olejowym')).toBe('pl');
    expect(detectLanguage('Sim, temos uma casa com aquecimento a gasóleo')).toBe('pt');
  });
  it('switches to French, keeps English fixed texts underneath, and the guard knows "vert"', async () => {
    const s = newSession('fr', 'voice', 'de');
    startConversation(s);
    await handleTurn(s, 'Oui, merci, nous pouvons commencer, je parle français', new RuleModel(), config);
    expect(s.speak).toBe('fr');
    expect(s.lang).toBe('en');
    s.toolLog.push({ at: '', tool: 'assess_building', args: {}, result: { verdict: 'yellow' }, ms: 0 });
    expect(guardReply(s, 'Votre résultat est vert.').ok).toBe(false);
    expect(guardReply(s, 'Votre résultat est jaune.').ok).toBe(true);
  });
});

describe('ElevenLabs bridge: session matching and language switch', () => {
  const store = new MemoryStore();
  const server = buildServer(store, config, new RuleModel());
  let base = '';
  beforeAll(async () => { await new Promise<void>((r) => server.listen(0, r)); base = `http://localhost:${(server.address() as AddressInfo).port}`; });
  afterAll(() => server.close());
  const SYS = { role: 'system', content: 'Agent character description: conversation_id: {{system__conversation_id}}\nlanguage: auto' };
  const LANG_TOOL = { type: 'function', function: { name: 'language_detection', parameters: { type: 'object', properties: { reason: { type: 'string' }, language: { type: 'string' } } } } };
  const call = (messages: unknown[]) => fetch(`${base}/v1/chat/completions`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ stream: true, messages, tools: [LANG_TOOL] }),
  }).then((r) => r.text());
  const toolCalls = (sse: string) => sse.split('\n').filter((l) => l.startsWith('data: {')).flatMap((l) => JSON.parse(l.slice(6)).choices[0].delta.tool_calls ?? []);

  it('keeps one session when the conversation id is not substituted (matches by history)', async () => {
    const greet = { role: 'assistant', content: 'Guten Tag…' };
    const u1 = { role: 'user', content: 'Bonjour, oui, nous pouvons commencer, je parle français' };
    const sse1 = await call([SYS, greet, u1]);
    const calls = toolCalls(sse1);
    expect(calls[0]?.function?.name).toBe('language_detection');
    expect(JSON.parse(calls[0].function.arguments).language).toBe('fr');
    // ElevenLabs runs the tool and comes back with the tool result: we must not re-run the turn.
    const follow = await call([SYS, greet, u1, { role: 'assistant', content: null, tool_calls: [calls[0]] }, { role: 'tool', tool_call_id: calls[0].id, content: 'ok' }]);
    expect(follow).toMatch(/\[DONE\]/);
    await call([SYS, greet, u1, { role: 'assistant', content: 'Quel est le code postal ?' }, { role: 'user', content: '85221' }]);
    const sessions = store.list().filter((s) => s.id.startsWith('el-'));
    expect(sessions).toHaveLength(1);
    expect(sessions[0].profile.location?.postcode).toBe('85221');
    expect(sessions[0].speak).toBe('fr');
  });
});
