// Live checks on real, labelled files (photos or PDFs). Skipped unless LIVE_AI=1 and LABELLED are set; costs a few cents.
// LABELLED is a ;-separated list of kind:path=expected, for example:
//   LIVE_AI=1 LABELLED="bill:./swm-sample.pdf=12345;meter_cabinet:./m1.jpg=old-or-full;outdoor:./o1.jpg=space:yes" \
//     npx vitest run src/ai/live.labelled.eval.test.ts
// - bill: expected kWh per year; certificate: expected kWh per m² and year. Both must match within 2%.
// - meter_cabinet: modern | old-or-full.  outdoor: space:yes|no or neighbour:yes|no.
// A confident wrong answer fails. "unclear" is logged as honest, not failed.
// Labels must come from a person who checked the file, never from the model.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classifyMeterCabinet } from './classifyMeterCabinet';
import { classifyOutdoorPhotos } from './classifyOutdoorPhoto';
import { readBill } from './readBill';
import { readCertificate } from './readCertificate';

const LIVE = process.env.LIVE_AI === '1' && Boolean(process.env.LABELLED);

const items = (process.env.LABELLED ?? '').split(';').map((s) => s.trim()).filter(Boolean).map((s) => {
  const m = s.match(/^(\w+):(.+)=([^=]+)$/);
  if (!m) throw new Error(`Bad LABELLED entry: ${s}`);
  return { kind: m[1], path: m[2], expected: m[3] };
});

const fileOf = (p: string) =>
  new File([readFileSync(p)], p.split(/[\\/]/).pop() ?? 'file', { type: /\.pdf$/i.test(p) ? 'application/pdf' : /\.png$/i.test(p) ? 'image/png' : 'image/jpeg' });
const within2pct = (got: number | null, want: number) => got != null && Math.abs(got - want) / want <= 0.02;

describe('live: labelled photos and documents', () => {
  if (!LIVE) {
    it.skip('set LIVE_AI=1 and LABELLED to run', () => undefined);
    return;
  }
  for (const item of items) {
    it(`${item.kind}: ${item.path}`, async () => {
      const f = fileOf(item.path);
      if (item.kind === 'bill') {
        const r = await readBill(f);
        console.log(item.path, r);
        expect(within2pct(r.annual_consumption_kwh, Number(item.expected))).toBe(true);
      } else if (item.kind === 'certificate') {
        const r = await readCertificate(f);
        console.log(item.path, r);
        expect(within2pct(r.kwh_m2a, Number(item.expected))).toBe(true);
      } else if (item.kind === 'meter_cabinet') {
        const r = await classifyMeterCabinet(f);
        console.log(item.path, r);
        if (r.finding !== 'unclear') expect(r.finding).toBe(item.expected);
      } else if (item.kind === 'outdoor') {
        const [field, want] = item.expected.split(':');
        const r = await classifyOutdoorPhotos([f]);
        console.log(item.path, r);
        const got = field === 'neighbour' ? r.near_neighbour : r.space_1x1;
        if (got !== 'unclear') expect(got).toBe(want);
      } else {
        throw new Error(`Unknown kind ${item.kind}`);
      }
    }, 120_000);
  }
});
