import '../src/env.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../src/env.mjs';
import { readJson } from '../src/util.mjs';

const { getProxyInfo, fetchText } = await import('../src/fetch.mjs');
const { parseFeed } = await import('../src/rss.mjs');
const { translateText } = await import('../src/translate.mjs');
const { resolveSummaryProvider } = await import('../src/summarize.mjs');

const checks = [];
const add = (name, ok, detail) => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${name.padEnd(22)} ${detail}`);
};

console.log(`Node ${process.version} · ${process.platform} ${process.arch}`);
const proxy = getProxyInfo();
console.log(`Proxy: ${proxy.proxy || 'direct'} (${proxy.source})\n`);

const feeds = [
  ['BBC World', 'https://feeds.bbci.co.uk/news/world/rss.xml'],
  ['Ars Technica', 'https://feeds.arstechnica.com/arstechnica/index'],
  ['UN News', 'https://news.un.org/feed/subscribe/en/news/all/rss.xml'],
];
let feedsOk = 0;
for (const [name, url] of feeds) {
  try {
    const res = await fetchText(url, { timeoutMs: 15000 });
    const parsed = parseFeed(res.text, { id: name, name, home: url, section: 'world' });
    const ok = res.status === 200 && parsed.items.length > 0;
    if (ok) feedsOk += 1;
    add(`feed: ${name}`, ok, `HTTP ${res.status} · ${parsed.items.length} items · ${res.proxied ? 'proxy' : 'direct'}`);
  } catch (error) {
    add(`feed: ${name}`, false, error.message);
  }
}

try {
  const result = await translateText('The world this morning.', { retries: 0 });
  add('translation', result.translated, result.translated ? result.text : 'unavailable (set TRANSLATE=0 to skip)');
} catch (error) {
  add('translation', false, error.message);
}

try {
  const provider = await resolveSummaryProvider({ refresh: true });
  add(
    'summary API',
    provider.type !== 'none',
    provider.type === 'none'
      ? provider.reason
      : `${provider.type} · ${provider.baseUrl} · ${provider.model || 'default model'}`,
  );
} catch (error) {
  add('summary API', false, error.message);
}

try {
  const res = await fetch('http://127.0.0.1:8188/system_stats', { signal: AbortSignal.timeout(2500) });
  const data = await res.json();
  add('ComfyUI', Boolean(data?.system), data?.system?.comfyui_version || 'no system stats');
} catch {
  add('ComfyUI', false, 'not running (SVG cover fallback will be used)');
}

const editions = path.join(ROOT, 'data', 'editions');
let editionCount = 0;
try {
  editionCount = fs.readdirSync(editions).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).length;
} catch { /* no editions yet */ }
const latest = editionCount
  ? readJson(path.join(editions, fs.readdirSync(editions).filter((f) => f.endsWith('.json')).sort().reverse()[0]))
  : null;
add('editions', editionCount > 0, latest ? `${editionCount} saved · latest ${latest.date} · ${latest.stories?.length || 0} stories` : 'none yet');

console.log('');
if (feedsOk < 2) {
  console.error('Fewer than two feeds are reachable. Set HTTPS_PROXY in .env or check the network.');
  process.exitCode = 1;
} else {
  console.log('Core checks passed.');
}
