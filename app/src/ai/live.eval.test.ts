// Live AI evaluation against the real provider. Skipped unless LIVE_AI=1 (costs a few cents).
//   LIVE_AI=1 npx vitest run src/ai/live.eval.test.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import dev from '../data/buildings_dev.json';
import evalSet from '../data/buildings_eval.json';
import { assess } from '../engine/assess';
import type { Building } from '../engine/types';

const LIVE = process.env.LIVE_AI === '1';
const PUBLIC = join(__dirname, '../../public');

// The browser loads few-shot examples from /examples/...; serve them from disk in node.
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith('/examples/')) return new Response(readFileSync(join(PUBLIC, url)), { headers: { 'content-type': 'image/jpeg' } });
  return realFetch(input, init);
}) as typeof fetch;

const PHOTOS = [
  { file: '1_single-pipe_classic-loop.jpg', truth: 'single-pipe' },
  { file: '2_single-pipe_hidden-in-valve-block.jpeg', truth: 'single-pipe' },
  { file: '3_two-pipe_classic.jpeg', truth: 'two-pipe' },
  { file: '4_two-pipe_modern-valve-block.jpeg', truth: 'two-pipe' },
  { file: '5_cant-tell.jpeg', truth: 'unclear' },
];

describe.skipIf(!LIVE)('live AI', () => {
  it('photo classifier, leave-one-out on the 5 installer-confirmed photos', async () => {
    const { classifyPipePhotos } = await import('./classifyPipePhoto');
    const rows: string[] = [];
    let correct = 0;
    let wrongConfident = 0;
    for (const p of PHOTOS) {
      const file = new File([readFileSync(join(PUBLIC, 'examples', p.file))], p.file, { type: 'image/jpeg' });
      const t0 = Date.now();
      const r = await classifyPipePhotos([file], null, p.file);
      const ms = Date.now() - t0;
      const ok = r.label === p.truth;
      if (ok) correct++;
      if (!ok && r.label !== 'unclear') wrongConfident++;
      rows.push(`${ok ? 'OK  ' : 'MISS'} ${p.file.padEnd(42)} truth=${p.truth.padEnd(11)} got=${r.label.padEnd(11)} conf=${r.confidence.toFixed(2)} type=${r.radiator_type ?? '-'} ${ms}ms | ${r.evidence.slice(0, 2).join('; ')}`);
    }
    console.log(`\nPHOTO CLASSIFIER (leave-one-out): ${correct}/5 correct, ${wrongConfident} confidently wrong\n${rows.join('\n')}`);
    expect(rows).toHaveLength(5);
  }, 180_000);

  it('plain-language rephrase on all 5 houses (guard: no new numbers, same verdict)', async () => {
    const { explainPlainly } = await import('./explain');
    const out: string[] = [];
    let passed = 0;
    for (const b of [...(dev as Building[]), ...(evalSet as Building[])]) {
      const a = assess(b);
      const t0 = Date.now();
      try {
        const txt = await explainPlainly(a);
        passed++;
        out.push(`PASS ${b.building_id} (${a.verdict}) ${Date.now() - t0}ms\n     ${txt}`);
      } catch (e) {
        out.push(`REJECTED ${b.building_id} (${a.verdict}) ${Date.now() - t0}ms: ${(e as Error).message}`);
      }
    }
    console.log(`\nREPHRASE: ${passed}/5 passed the guard\n${out.join('\n')}`);
    expect(out).toHaveLength(5);
  }, 180_000);
});
