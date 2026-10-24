import { mkdtempSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MemoryStore, newSession, type ChatMessage, type Session } from '@hpr/agent';
import { handleTurn } from '../src/agent';
import type { ModelClient } from '../src/model';
import { buildServer } from '../src/server';

const config = { reportsDir: '.', publicBaseUrl: 'http://localhost' };

/** Fake model: records the system prompt of every call and answers with a fixed sentence. */
function fakeModel(reply: string | Error) {
  const prompts: string[] = [];
  const model: ModelClient = {
    complete: async (messages: ChatMessage[]) => {
      prompts.push(String(messages[0].content));
      if (reply instanceof Error) throw reply;
      return { role: 'assistant', content: reply };
    },
  };
  return { model, prompts };
}

function sessionWithOutdoorFinding(): Session {
  const s = newSession('news-' + Math.random().toString(36).slice(2, 8), 'chat', 'en');
  s.profile.photos.push({
    id: 'p1', kind: 'outdoor', path: '/tmp/p1.jpg', at: new Date().toISOString(),
    finding: { space_1x1: 'yes', near_neighbour: 'yes', house_type: 'semi', access: 'ok', obstacles: [], evidence: [], confidence: 0.85, agreement: 1, looks: 3, source: 'ai' },
  });
  return s;
}

describe('photo results that arrive in the background', () => {
  it('are offered to the model once, in plain words, then marked as mentioned', async () => {
    const s = sessionWithOutdoorFinding();
    const { model, prompts } = fakeModel('Thanks for the photo of the garden.');
    await handleTurn(s, 'I sent a photo', model, config);
    expect(prompts[0]).toMatch(/NEW PHOTO RESULTS/);
    expect(prompts[0]).toMatch(/noise check/);
    expect(prompts[0]).not.toMatch(/% confident/);
    expect(s.profile.photos[0].mentioned).toBe(true);

    await handleTurn(s, 'ok', model, config);
    expect(prompts.at(-1)).not.toMatch(/NEW PHOTO RESULTS/);
  });

  it('stay pending when the model fails and a fallback reply is sent', async () => {
    const s = sessionWithOutdoorFinding();
    const { model } = fakeModel(new Error('timeout'));
    const r = await handleTurn(s, 'hello', model, config);
    expect(r.guard.fallback).toBe(true);
    expect(s.profile.photos[0].mentioned).toBeFalsy();
  });

  it('a bill or certificate result asks for read-back and confirmation', async () => {
    const s = newSession('news-doc', 'chat', 'en');
    s.profile.photos.push({ id: 'c1', kind: 'certificate', path: '/tmp/c1.pdf', at: new Date().toISOString(), finding: { kwh_m2a: 143, kind: 'demand', issued: null, valid_until: null, evidence: [] } });
    const { model, prompts } = fakeModel('Thanks, I have your certificate.');
    await handleTurn(s, 'done', model, config);
    expect(prompts[0]).toMatch(/only after a clear yes/);
  });
});

describe('dashboard photo route', () => {
  const dir = mkdtempSync(join(tmpdir(), 'orch-photo-'));
  const store = new MemoryStore();
  const server = buildServer(store, { reportsDir: join(dir, 'reports'), publicBaseUrl: 'http://localhost' }, fakeModel('ok').model);
  let base = '';
  const before = process.env.SALES_TOKEN;
  beforeAll(async () => {
    process.env.SALES_TOKEN = 'test-token';
    const path = join(dir, 'p1.jpg');
    writeFileSync(path, new Uint8Array([255, 216, 255, 1]));
    const s = newSession('route-1', 'chat', 'en');
    s.leadId = 'L-TEST-0001';
    s.profile.photos.push({ id: 'p1', kind: 'outdoor', path, at: new Date().toISOString() });
    store.save(s);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://localhost:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => { server.close(); if (before == null) delete process.env.SALES_TOKEN; else process.env.SALES_TOKEN = before; });

  it('needs the sales token, returns the file with it, and 404s for unknown photos', async () => {
    expect((await fetch(`${base}/leads/L-TEST-0001/photos/p1`)).status).toBe(401);
    const auth = { headers: { authorization: 'Bearer test-token' } };
    const ok = await fetch(`${base}/leads/L-TEST-0001/photos/p1`, auth);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('image/jpeg');
    expect(new Uint8Array(await ok.arrayBuffer())).toEqual(new Uint8Array([255, 216, 255, 1]));
    expect((await fetch(`${base}/leads/L-TEST-0001/photos/nope`, auth)).status).toBe(404);
    expect((await fetch(`${base}/leads/L-OTHER/photos/p1`, auth)).status).toBe(404);
  });
});
