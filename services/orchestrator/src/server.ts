// HTTP API for any front end (spec §9 / app spec §10). Plain node:http, JSON in/out.
//   npx tsx services/orchestrator/src/server.ts   → http://localhost:8787
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assess } from '@hpr/core/engine/assess';
import { resultAreas } from '@hpr/core/engine/areas';
import { newSession, progress, deriveState, runTool, SLOTS, toBuilding, type SessionStore, type ToolConfig } from '@hpr/agent';
import { DATA_DIR, initRuntime } from '../../shared/runtime';
import { handleTurn, startConversation } from './agent';
import { defaultModel, type ModelClient } from './model';

type Handler = (req: IncomingMessage, res: ServerResponse, params: string[], url: URL) => Promise<void>;

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(body));
};
async function readBody(req: IncomingMessage, max = 15 * 1024 * 1024): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) { size += c.length; if (size > max) throw new Error('body too large'); chunks.push(c as Buffer); }
  return Buffer.concat(chunks);
}
const readJson = async (req: IncomingMessage) => { const b = await readBody(req, 1024 * 1024); return b.length ? JSON.parse(b.toString('utf8')) : {}; };

const UPLOAD_PAGE = (id: string) => `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fotos hochladen</title>
<style>body{font-family:system-ui,sans-serif;font-size:19px;max-width:560px;margin:24px auto;padding:0 16px;line-height:1.5}label{display:block;margin:18px 0 6px;font-weight:600}select,input,button{font-size:19px;width:100%;padding:12px;margin-bottom:8px}button{background:#059669;color:#fff;border:0;border-radius:10px}#s{margin-top:12px}</style></head>
<body><h1>Fotos für Ihre Wärmepumpen-Prüfung</h1><p>Jedes Foto macht den Termin kürzer. / Each photo makes the visit shorter.</p>
<label for="k">Was zeigt das Foto? / What does it show?</label><select id="k"><option value="meter_cabinet">Zählerschrank / meter cabinet</option><option value="radiator">Heizkörper + Rohre / radiator + pipes</option><option value="outdoor">Platz für Außengerät / outdoor spot</option><option value="boiler_room">Heizungsraum / heating room</option><option value="access">Zugangsweg / access route</option><option value="bill">Jahresabrechnung / yearly bill</option><option value="certificate">Energieausweis / energy certificate</option></select>
<input id="f" type="file" accept="image/*,application/pdf" capture="environment"><button onclick="up()">Hochladen / Upload</button><p id="s"></p>
<script>async function up(){const f=document.getElementById('f').files[0];if(!f)return;const s=document.getElementById('s');s.textContent='…';const r=await fetch('/sessions/${id}/photos?kind='+document.getElementById('k').value,{method:'POST',headers:{'content-type':f.type||'application/octet-stream'},body:f});s.textContent=r.ok?'Danke! Thank you.':'Fehler / error '+r.status;}</script></body></html>`;

export function buildServer(store: SessionStore, config: ToolConfig, model: ModelClient) {
  const routes: [string, RegExp, Handler][] = [
    ['POST', /^\/sessions$/, async (req, res) => {
      const body = await readJson(req);
      const s = newSession(randomUUID(), body.channel === 'voice' ? 'voice' : 'chat', body.lang === 'en' ? 'en' : 'de');
      const first = startConversation(s);
      store.save(s);
      json(res, 201, { session_id: s.id, messages: [first], state: deriveState(s), progress: progress(s) });
    }],
    ['POST', /^\/sessions\/resume$/, async (req, res) => {
      const { resume_code } = await readJson(req);
      const s = store.byResumeCode(String(resume_code ?? '').toUpperCase());
      if (!s) return json(res, 404, { error: 'unknown resume code' });
      s.flags.paused = false;
      store.save(s);
      json(res, 200, { session_id: s.id, state: deriveState(s), progress: progress(s) });
    }],
    ['POST', /^\/sessions\/([\w-]+)\/messages$/, async (req, res, [id]) => {
      const s = store.get(id);
      if (!s) return json(res, 404, { error: 'unknown session' });
      const { text } = await readJson(req);
      if (typeof text !== 'string' || !text.trim()) return json(res, 400, { error: 'text required' });
      const r = await handleTurn(s, text.slice(0, 2000), model, config);
      store.save(s);
      const nq = (await runTool({ session: s, config }, 'get_state', {})) as { next_question: { options?: { value: string; label: string }[] } | null };
      store.save(s);
      json(res, 200, { messages: [r.reply], state: r.state, progress: r.progress, suggested_answers: [...(nq.next_question?.options?.map((o) => o.label) ?? []), s.lang === 'de' ? 'Weiß nicht' : "I don't know"], guard: r.guard });
    }],
    ['POST', /^\/sessions\/([\w-]+)\/photos$/, async (req, res, [id], url) => {
      const s = store.get(id);
      if (!s) return json(res, 404, { error: 'unknown session' });
      const kind = url.searchParams.get('kind') ?? 'other';
      const ctype = String(req.headers['content-type'] ?? '');
      if (!/^(image\/(jpeg|png|webp|heic)|application\/pdf)/.test(ctype)) return json(res, 415, { error: 'jpeg, png, webp, heic or pdf only' });
      const buf = await readBody(req);
      const photoId = randomUUID().slice(0, 8);
      const ext = ctype.includes('pdf') ? 'pdf' : ctype.includes('png') ? 'png' : 'jpg';
      const path = join(DATA_DIR, 'uploads', `${id}-${photoId}.${ext}`);
      writeFileSync(path, buf);
      s.profile.photos.push({ id: photoId, kind, path, at: new Date().toISOString() });
      store.save(s);
      json(res, 201, { photo_id: photoId, status: 'received' });
      // Analyse in the background on a copy; the conversation never waits. Only the photo results are merged
      // back into the latest saved session, so answers given meanwhile are never overwritten.
      const work = structuredClone(s);
      runTool({ session: work, config }, 'analyse_photo', { photo_id: photoId }).then(() => {
        const fresh = store.get(id);
        if (!fresh) return;
        const done = work.profile.photos.find((x) => x.id === photoId);
        const target = fresh.profile.photos.find((x) => x.id === photoId);
        if (done && target) target.finding = done.finding;
        if (kind === 'radiator' && work.profile.pipePhoto) fresh.profile.pipePhoto = work.profile.pipePhoto;
        if (kind === 'meter_cabinet' && work.profile.meterCabinet) fresh.profile.meterCabinet = work.profile.meterCabinet;
        fresh.toolLog.push(...work.toolLog.slice(-1));
        store.save(fresh);
      }).catch(() => undefined);
    }],
    ['GET', /^\/sessions\/([\w-]+)\/photos\/([\w-]+)$/, async (_req, res, [id, pid]) => {
      const p = store.get(id)?.profile.photos.find((x) => x.id === pid);
      if (!p) return json(res, 404, { error: 'not found' });
      json(res, 200, { photo_id: p.id, kind: p.kind, status: p.finding ? 'analysed' : 'pending', finding: p.finding ?? null });
    }],
    ['GET', /^\/sessions\/([\w-]+)\/result$/, async (_req, res, [id]) => {
      const s = store.get(id);
      if (!s) return json(res, 404, { error: 'unknown session' });
      const b = toBuilding(s.profile, s.id);
      const a = assess(b, s.profile.pipePhoto);
      const costs = await runTool({ session: s, config }, 'estimate_costs', {});
      const path = await runTool({ session: s, config }, 'path_to_green', {});
      json(res, 200, { verdict: a.verdict, confidence: a.confidence, headline: a.headline, reasons: a.verdictReasons, areas: resultAreas(b, a), heat_load: a.heatLoad, flags: a.flags, costs, path_to_green: path, outcome: s.outcomeText ?? null });
    }],
    ['GET', /^\/sessions\/([\w-]+)$/, async (_req, res, [id]) => {
      const s = store.get(id);
      if (!s) return json(res, 404, { error: 'unknown session' });
      json(res, 200, { session_id: s.id, state: deriveState(s), progress: progress(s), lang: s.lang, channel: s.channel, slots: s.profile.slots, location: s.profile.location, photos: s.profile.photos.map((p) => ({ id: p.id, kind: p.kind, finding: p.finding ?? null })), messages: s.messages.filter((m) => m.role === 'user' || (m.role === 'assistant' && typeof m.content === 'string' && m.content)), lead_id: s.leadId ?? null });
    }],
    ['POST', /^\/sessions\/([\w-]+)\/pause$/, async (_req, res, [id]) => {
      const s = store.get(id);
      if (!s) return json(res, 404, { error: 'unknown session' });
      const r = await runTool({ session: s, config }, 'pause_session', {});
      store.save(s);
      json(res, 200, r);
    }],
    ['GET', /^\/slots$/, async (_req, res, _p, url) => {
      const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'de';
      json(res, 200, SLOTS.map((s) => ({ id: s.id, group: s.group, mode: s.mode, type: s.type, question: s.question[lang], why: s.why[lang], options: s.options?.map((o) => ({ value: o.value, label: o[lang] })), min: s.min, max: s.max })));
    }],
    ['GET', /^\/leads\/([\w-]+)\/report$/, async (_req, res, [lead]) => {
      const f = join(config.reportsDir, `${lead}.json`);
      if (!existsSync(f)) return json(res, 404, { error: 'unknown lead' });
      json(res, 200, JSON.parse(readFileSync(f, 'utf8')));
    }],
    ['GET', /^\/upload\/([\w-]+)$/, async (_req, res, [id]) => {
      if (!store.get(id)) { res.writeHead(404).end('Link expired'); return; }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(UPLOAD_PAGE(id));
    }],
    ['GET', /^\/health$/, async (_req, res) => json(res, 200, { ok: true })],
  ];

  return createServer(async (req, res) => {
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,PUT,PATCH', 'access-control-allow-headers': 'content-type' }).end(); return; }
    const url = new URL(req.url ?? '/', 'http://x');
    for (const [method, re, h] of routes) {
      const m = url.pathname.match(re);
      if (m && req.method === method) {
        try { await h(req, res, m.slice(1), url); } catch (e) { json(res, 500, { error: (e as Error).message }); }
        return;
      }
    }
    json(res, 404, { error: 'not found' });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { store, toolConfig } = initRuntime();
  const port = Number(process.env.PORT ?? 8787);
  buildServer(store, toolConfig, defaultModel()).listen(port, '0.0.0.0', () => console.error(`orchestrator on http://localhost:${port}`));
}
