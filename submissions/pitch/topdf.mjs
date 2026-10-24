// Print deck.html to a 1920x1080-per-page PDF with headless Chrome (DevTools protocol), plus preview PNGs.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const dir = process.argv[2];
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=9334', '--user-data-dir=/tmp/hpr-pdf-chrome', '--window-size=1920,1080', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(2500);
const tab = (await (await fetch('http://127.0.0.1:9334/json')).json()).find((t) => t.type === 'page');
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = {};
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (pending[m.id]) { pending[m.id](m.result); delete pending[m.id]; } });
const send = (method, params = {}) => new Promise((r) => { pending[++id] = r; ws.send(JSON.stringify({ id, method, params })); });
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: pathToFileURL(`${dir}/deck.html`).href });
await sleep(6000); // fonts + images
await send('Runtime.evaluate', { expression: 'document.fonts.ready.then(() => true)', awaitPromise: true });
const pdf = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 });
writeFileSync(`${dir}/HeatPumpReady-pitch.pdf`, Buffer.from(pdf.data, 'base64'));
mkdirSync(`${dir}/preview`, { recursive: true });
const n = (await send('Runtime.evaluate', { expression: 'document.querySelectorAll("section").length', returnByValue: true })).result.value;
for (let i = 0; i < n; i++) {
  await send('Runtime.evaluate', { expression: `window.scrollTo(0, ${i * 1080})` });
  await sleep(300);
  const s = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: i * 1080, width: 1920, height: 1080, scale: 0.4 }, captureBeyondViewport: true });
  writeFileSync(`${dir}/preview/${String(i + 1).padStart(2, '0')}.png`, Buffer.from(s.data, 'base64'));
}
console.log(`pdf + ${n} previews written`);
ws.close(); chrome.kill();
