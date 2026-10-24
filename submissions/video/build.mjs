// Records every scene with headless Chrome (CDP screencast), mixes voice + music, and renders demo.mp4.
// Usage: node build.mjs [sceneName ...]   (no args = all scenes, then final render)
import { spawn, execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const DIR = process.cwd();
const FF = '/opt/homebrew/bin/ffmpeg', FP = '/opt/homebrew/bin/ffprobe';
const dur = (f) => +execFileSync(FP, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env = Object.fromEntries(readFileSync('../../services/.env', 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.split('=')[0], l.slice(l.indexOf('=') + 1).trim()]));

// ---- call scene plan (seconds inside the scene) ----
const cl = JSON.parse(readFileSync('lines.json')).call;
const cd = cl.map((_, i) => dur(`audio/call${String(i).padStart(2, '0')}.mp3`));
const chipsAt = { 1: '1987', 3: '160 m²', 5: 'Oil · 25,000 kWh', 7: 'Radiators · single-pipe?' };
const plan = [], callAudio = [];
let t = 0.6;
cl.forEach(([who, text], i) => {
  if (i === 4) { plan.push({ t, who: 'cap', text: '8 languages · one question at a time', dur: 4.8 }); callAudio.push(['audio/v04.mp3', t]); t += dur('audio/v04.mp3') + 0.4; }
  if (i === 8) { plan.push({ t, who: 'cap', text: 'Not sure? That’s fine.', dur: 3.9 }); callAudio.push(['audio/v05.mp3', t]); t += dur('audio/v05.mp3') + 0.4; }
  if (i === 9) plan.push({ t, who: 'result' });
  plan.push({ t, who, text, dur: cd[i], chip: chipsAt[i] });
  callAudio.push([`audio/call${String(i).padStart(2, '0')}.mp3`, t]);
  t += cd[i] + 0.4;
});
const CALL_LEN = Math.ceil(t + 1);

// ---- scenes: name, length, how to show it, voice-over cues (seconds inside the scene) ----
const card = (s, extra = '') => pathToFileURL(`${DIR}/cards.html`).href + `?s=${s}${extra}`;
const SCENES = [
  { name: 'hook', len: 15.5, url: card('hook'), vo: [['v01', 0.6], ['v02', 6.3], ['v03', 12.6]] },
  { name: 'call', len: CALL_LEN, url: card('call', `&plan=${encodeURIComponent(JSON.stringify(plan))}`), audio: callAudio },
  { name: 'result', len: 14, app: 'result', vo: [['v06', 0.6], ['v07', 8.6]] },
  { name: 'photo', len: 5, url: card('photo'), vo: [['v08', 0.5]] },
  { name: 'bill', len: 4.5, url: card('bill'), vo: [['v09', 0.4]] },
  { name: 'guard', len: 5, url: card('guard'), vo: [['v10', 0.6]] },
  { name: 'live', len: 22, app: 'live', vo: [['v11', 0.6], ['v12', 5], ['v13', 11]] },
  { name: 'privacy', len: 5.5, url: card('privacy'), vo: [['v14', 0.4]] },
  { name: 'stats', len: 6, url: card('stats'), vo: [['v15', 0.4]] },
  { name: 'liveintro', len: 4, url: card('liveintro'), vo: [['v16', 0.2]] },
  { name: 'clip', len: +dur('userclip.mp4').toFixed(2), url: card('clip'), clip: true, audio: [['userclip.m4a', 0]] },
  { name: 'close', len: 8, url: card('close'), vo: [['v17', 1]] },
];

// ---- headless Chrome over CDP ----
async function chrome() {
  rmSync('/tmp/hpr-video-chrome', { recursive: true, force: true });
  const p = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=9335', '--user-data-dir=/tmp/hpr-video-chrome', '--window-size=1920,1080', '--hide-scrollbars', '--force-device-scale-factor=1', 'about:blank'], { stdio: 'ignore' });
  await sleep(2500);
  const tab = (await (await fetch('http://127.0.0.1:9335/json')).json()).find((x) => x.type === 'page');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pending = {}, handlers = {};
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending[m.id]) { pending[m.id](m.result); delete pending[m.id]; } else if (m.method && handlers[m.method]) handlers[m.method](m.params); });
  const send = (method, params = {}) => new Promise((r) => { pending[++id] = r; ws.send(JSON.stringify({ id, method, params })); });
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  return { send, on: (m, f) => (handlers[m] = f), close: () => { ws.close(); p.kill(); } };
}
const js = (c, expression) => c.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });

async function record(c, scene) {
  const fdir = `frames/${scene.name}`; rmSync(fdir, { recursive: true, force: true }); mkdirSync(fdir, { recursive: true });
  // Load first (fonts, tiles), then restart animations from zero by reloading once warm.
  if (scene.url) { await c.send('Page.navigate', { url: scene.url }); await sleep(2500); }
  if (scene.app === 'result') {
    await c.send('Page.navigate', { url: 'http://localhost:5173/#/' }); await sleep(3500);
  }
  if (scene.app === 'live') {
    await c.send('Page.navigate', { url: 'http://localhost:5173/#/' }); await sleep(1500);
    await js(c, `localStorage.setItem('hpr.salesToken', ${JSON.stringify(env.SALES_TOKEN)})`);
    await c.send('Page.navigate', { url: 'http://localhost:5173/#/live' }); await sleep(5000);
  }
  const frames = [];
  c.on('Page.screencastFrame', (p) => { frames.push({ ts: p.metadata.timestamp, data: p.data }); c.send('Page.screencastFrameAck', { sessionId: p.sessionId }); });
  if (scene.url) { await c.send('Page.reload', { ignoreCache: false }); }
  await c.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  const t0 = Date.now(); const at = (s) => sleep(Math.max(0, t0 + s * 1000 - Date.now()));
  if (scene.app === 'result') {
    await at(1.2);
    await js(c, `(() => { const b = [...document.querySelectorAll('button')].find((x) => /B-04/.test(x.textContent) && !x.getAttribute('aria-label')); b && b.click(); return !!b; })()`);
    await at(8); await js(c, `window.scrollTo({ top: 520, behavior: 'smooth' })`);
  }
  if (scene.app === 'live') {
    await at(3.5); await js(c, `(() => { const li = [...document.querySelectorAll('li')].find((x) => /Dachau/.test(x.textContent)) || document.querySelectorAll('li')[0]; li && li.click(); return !!li; })()`);
    await at(15); await js(c, `(() => { const d = [...document.querySelectorAll('div')].filter((x) => x.scrollHeight > x.clientHeight + 200 && getComputedStyle(x).overflowY !== 'visible').pop(); d && d.scrollTo({ top: 700, behavior: 'smooth' }); })()`);
  }
  await at(scene.len + 0.3);
  await c.send('Page.stopScreencast'); await sleep(300);
  // Frames → constant 30 fps clip of exactly scene.len seconds.
  let list = '';
  frames.forEach((f, i) => { const n = `${fdir}/${String(i).padStart(5, '0')}.jpg`; writeFileSync(n, Buffer.from(f.data, 'base64')); const d = i + 1 < frames.length ? frames[i + 1].ts - f.ts : 0.5; list += `file '${DIR}/${n}'\nduration ${Math.max(0.001, d).toFixed(4)}\n`; });
  writeFileSync(`${fdir}/list.txt`, list);
  execFileSync(FF, ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', `${fdir}/list.txt`, '-vf', 'tpad=stop_mode=clone:stop_duration=30,fps=30,scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x1C1510,format=yuv420p', '-t', String(scene.len), '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', `clips/${scene.name}.mp4`]);
  console.log(scene.name, frames.length, 'frames →', dur(`clips/${scene.name}.mp4`).toFixed(2), 's');
}

mkdirSync('clips', { recursive: true });
const only = process.argv.slice(2);
const c = await chrome();
for (const s of SCENES) if (!only.length || only.includes(s.name)) await record(c, s);
c.close();

// ---- final render: video concat + audio mix ----
let start = 0; const cues = [];
for (const s of SCENES) {
  for (const [v, o] of s.vo ?? []) cues.push([`audio/${v}.mp3`, start + o]);
  for (const [f, o] of s.audio ?? []) cues.push([f, start + o]);
  s.start = start; start += s.len;
}
const TOTAL = start;
writeFileSync('clips/list.txt', SCENES.map((s) => `file '${DIR}/${s.clip ? 'userclip' : `clips/${s.name}`}.mp4'`).join('\n'));
execFileSync(FF, ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', 'clips/list.txt', '-c', 'copy', 'clips/video.mp4']);
const clip = SCENES.find((s) => s.clip);
const inputs = cues.flatMap(([f]) => ['-i', f]);
const voice = cues.map(([, o], i) => `[${i + 1}:a]adelay=${Math.round(o * 1000)}|${Math.round(o * 1000)}[d${i}]`).join(';');
const mixIn = cues.map((_, i) => `[d${i}]`).join('');
// Music: full under the hook, ducked under voices, dipped for the user's clip, faded out at the end.
const music = `[0:a]volume='if(between(t,${clip.start},${clip.start + clip.len}),0.06,if(lt(t,0.5),0.5,0.17))':eval=frame,afade=t=out:st=${TOTAL - 4}:d=4,atrim=0:${TOTAL}[m]`;
const filter = `${music};${voice};${mixIn}amix=inputs=${cues.length}:normalize=0[v];[v]volume=1.15[vv];[m][vv]amix=inputs=2:normalize=0,alimiter=limit=0.95[a]`;
execFileSync(FF, ['-y', '-v', 'error', '-i', 'audio/music.mp3', ...inputs, '-filter_complex', filter, '-map', '[a]', '-t', String(TOTAL), '-c:a', 'aac', '-b:a', '192k', 'clips/audio.m4a']);
execFileSync(FF, ['-y', '-v', 'error', '-i', 'clips/video.mp4', '-i', 'clips/audio.m4a', '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'copy', '-shortest', '-movflags', '+faststart', 'HeatPumpReady-demo.mp4']);
writeFileSync('timeline.json', JSON.stringify(SCENES.map(({ name, start, len }) => ({ name, start, len })), null, 1));
console.log(`demo: ${dur('HeatPumpReady-demo.mp4').toFixed(1)} s; clip slot ${clip.start}s–${clip.start + clip.len}s`);
