/**
 * Development-only screenshot helper using an already-running Chrome with
 * --remote-debugging-port=9222. It emulates a true mobile viewport (Chrome's
 * --window-size has a desktop minimum width).
 *
 *   node scripts/cdp-shot.mjs http://127.0.0.1:4173/ docs/mobile.png 390 844
 */
import fs from 'node:fs';

const [url = 'http://127.0.0.1:4173/', out = 'docs/mobile.png', w = '390', h = '844'] = process.argv.slice(2);
const width = Number(w);
const height = Number(h);

const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const page = targets.find((t) => t.type === 'page');
if (!page) throw new Error('No page target; start Chrome with --remote-debugging-port=9222');

const ws = new WebSocket(page.webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();
const events = new Map();

ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
    return;
  }
  if (msg.method && events.has(msg.method)) {
    for (const fn of events.get(msg.method)) fn(msg.params);
  }
});

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

function once(method, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const list = events.get(method) || [];
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${method}`)), timeout);
    const fn = (params) => {
      clearTimeout(timer);
      events.set(method, (events.get(method) || []).filter((x) => x !== fn));
      resolve(params);
    };
    list.push(fn);
    events.set(method, list);
  });
}

await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width, height, deviceScaleFactor: 1, mobile: true,
  screenWidth: width, screenHeight: height,
});
await send('Emulation.setUserAgentOverride', {
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0 Mobile Safari/537.36',
  platform: 'Linux armv8l',
});
const loaded = once('Page.loadEventFired');
await send('Page.navigate', { url });
await Promise.race([loaded, new Promise((r) => { setTimeout(r, 8000); })]);
await new Promise((r) => { setTimeout(r, 4500); });
const metrics = await send('Runtime.evaluate', {
  expression: 'JSON.stringify({innerWidth, innerHeight, scrollWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth, dpr: devicePixelRatio})',
  returnByValue: true,
});
console.log('metrics', metrics.result.value);
const shot = await send('Page.captureScreenshot', {
  format: 'png',
  captureBeyondViewport: process.env.FULL === '1',
  fromSurface: true,
});
fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
console.log('wrote', out);
ws.close();
