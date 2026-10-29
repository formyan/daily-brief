import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/* ------------------------------------------------------------------ *
 * Text helpers — all feed text is untrusted and must be escaped in UI.
 * ------------------------------------------------------------------ */

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', middot: '·', bull: '•',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»',
  copy: '©', reg: '®', trade: '™', deg: '°', euro: '€', pound: '£', yen: '¥',
  times: '×', divide: '÷', frac12: '½', frac14: '¼', frac34: '¾',
  eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç', uuml: 'ü', ouml: 'ö',
  auml: 'ä', szlig: 'ß', ntilde: 'ñ', aacute: 'á', iacute: 'í', oacute: 'ó',
  uacute: 'ú', alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', pi: 'π',
  zwj: '', zwnj: '', shy: '', ensp: ' ', emsp: ' ', thinsp: ' ',
};

export function decodeEntities(input = '') {
  let s = String(input);
  // Decode twice because some feeds double-escape summaries.
  for (let pass = 0; pass < 2; pass += 1) {
    s = s
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
        const n = Number.parseInt(hex, 16);
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
      })
      .replace(/&#(\d+);/g, (_, dec) => {
        const n = Number.parseInt(dec, 10);
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
      })
      .replace(/&([a-z][a-z0-9]+);/gi, (m, name) => (
        Object.hasOwn(NAMED_ENTITIES, name.toLowerCase()) ? NAMED_ENTITIES[name.toLowerCase()] : m
      ));
  }
  return s;
}

export function stripTags(input = '') {
  return decodeEntities(String(input))
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]*>/g, ' ');
}

export function cleanText(input = '', max = 600) {
  let s = stripTags(input)
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s|·•>\-–—]+/, '')
    .trim();
  // Common feed furniture that adds no meaning.
  s = s
    .replace(/^(Image source|Image caption|Photograph|Photo|Video|Read more|Related:|Advertisement)[:\s-]+/i, '')
    .replace(/\s*(Read more|Continue reading|Sign up for our newsletter)[\s\S]*$/i, '')
    .trim();
  if (s.length > max) {
    const cut = s.slice(0, max);
    const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('。'), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
    s = (stop > max * 0.55 ? cut.slice(0, stop + 1) : `${cut.replace(/\s+\S*$/, '')}…`).trim();
  }
  return s;
}

export function truncate(input = '', max = 120) {
  const s = String(input).trim();
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1)).replace(/\s+\S*$/, '')}…`;
}

export function escapeHtml(input = '') {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ------------------------------------------------------------------ *
 * Identifiers, dates, files
 * ------------------------------------------------------------------ */

export function sha1(input) {
  return crypto.createHash('sha1').update(String(input)).digest('hex');
}

export function shortHash(input, length = 8) {
  return sha1(input).slice(0, length);
}

export function slugify(input = '') {
  return String(input)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function parseDate(input) {
  if (!input) return null;
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;
  const s = String(input).trim();
  let d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    // "2026-10-25 11:09:19" without a zone — interpret as UTC+8 for Chinese feeds.
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (m) {
      const [, y, mo, da, h = '0', mi = '0', se = '0'] = m;
      d = new Date(Date.UTC(+y, +mo - 1, +da, +h - 8, +mi, +se));
    }
  }
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export function toIso(input) {
  const d = parseDate(input);
  return d ? d.toISOString() : null;
}

const CN_TZ = 'Asia/Shanghai';

export function dateKey(date = new Date()) {
  // en-CA gives YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CN_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

export function timeKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: CN_TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
}

export function cnDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: CN_TZ, year: 'numeric', month: 'long', day: 'numeric',
    weekday: 'long',
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value || '';
  return { year: get('year'), month: get('month'), day: get('day'), weekday: get('weekday') };
}

export function formatCnDate(date = new Date()) {
  const p = cnDateParts(date);
  return `${p.year}年${p.month}${p.day}日 · ${p.weekday}`;
}

export function formatShortCnDate(dateKeyString) {
  if (!dateKeyString) return '';
  const [y, m, d] = dateKeyString.split('-');
  return `${+m}月${+d}日`;
}

export function hoursAgo(iso, now = Date.now()) {
  if (!iso) return 999;
  return (now - new Date(iso).getTime()) / 36e5;
}

export function readingTime(text = '') {
  const chars = String(text).replace(/\s/g, '').length;
  return Math.max(1, Math.round(chars / 420));
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function writeJsonAtomic(file, value) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, file);
}

export function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export function listJsonFiles(dir) {
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().reverse();
  } catch {
    return [];
  }
}

export async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = { status: 'fulfilled', value: await worker(items[index], index) };
      } catch (error) {
        results[index] = { status: 'rejected', reason: error };
      }
    }
  });
  await Promise.all(runners);
  return results;
}

export function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

export function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function safeHttpUrl(input, base) {
  try {
    const url = new URL(String(input || ''), base || undefined);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.href;
  } catch {
    return '';
  }
}

/* ------------------------------------------------------------------ *
 * Language utilities for clustering (English feeds)
 * ------------------------------------------------------------------ */

const STOPWORDS = new Set(`
a about above after again against ago all also am amid an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just last more most my myself new no nor not now of off on once one only or other our ours ourselves out over own said same says she should so some such than that the their theirs them themselves then there these they this those through to too two under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves
report reports update updates breaking live news latest week day today yesterday tomorrow year month
us uk eu un
`.split(/\s+/).filter(Boolean));

export function normalizeTitle(input = '') {
  return decodeEntities(String(input))
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const SYNONYMS = new Map([
  ['poll', 'vote'], ['polls', 'vote'], ['polling', 'vote'], ['voting', 'vote'],
  ['votes', 'vote'], ['voters', 'vote'], ['voter', 'vote'],
  ['protest', 'protest'], ['protests', 'protest'], ['protester', 'protest'], ['protesters', 'protest'],
  ['talks', 'talk'], ['negotiations', 'negotiation'], ['negotiating', 'negotiation'],
  ['killed', 'kill'], ['killing', 'kill'], ['deaths', 'death'], ['dead', 'death'],
  ['strikes', 'strike'], ['attacks', 'attack'], ['attacked', 'attack'],
  ['ceasefire', 'truce'], ['armistice', 'truce'],
  ['elections', 'election'], ['election', 'election'],
  ['campaigns', 'campaign'], ['campaigning', 'campaign'],
]);

export function tokenize(input = '') {
  const text = normalizeTitle(input);
  const tokens = text.split(' ').filter((t) => t && !STOPWORDS.has(t) && (t.length >= 3 || /^\d+$/.test(t)));
  return [...new Set(tokens.map((token) => SYNONYMS.get(token) || stem(token)))];
}

function stem(word) {
  if (word.length <= 4) return word;
  return word
    .replace(/(ations|ation|ements|ement|ities|ity)$/i, '')
    .replace(/(ing|ers|er|ies|ied|ed|es|s)$/i, (m) => (m === 's' && /ss$/i.test(word) ? '' : ''));
}

export function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

export function dice(a, b) {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection += 1;
  return (2 * intersection) / (a.size + b.size);
}

const ENTITY_STOP = new Set(`
The A An This That These Those It Its He She They We You I
Monday Tuesday Wednesday Thursday Friday Saturday Sunday
January February March April May June July August September October November December
Mr Mrs Ms Dr Prof President Prime Minister Government Officials Report Reports Update
New Latest Breaking Live News World International Global Today Week Year
But And Or For With From After Before Over Under More Most First Last
Polls Poll Voting Vote Voters Election Elections Campaign Campaigns Rally Rallies
Open Opens Closed Closes Begins Starts Ends Continues Resumes
Leader Leaders Party Parties Coalition Opposition Cabinet Parliament Congress Senate
Military Army Navy Troops Forces Police Officers Court Judge Trial Case Cases
War Attack Strike Crisis Talks Deal Agreement Plan Bill Law Death Killed Injured
People Thousands Hundreds Millions Billions Scores Dozens
Meanwhile However Also Still Just Even Now Then Here There What Why How Who
One Two Three Four Five Six Seven Eight Nine Ten
`.split(/\s+/).filter(Boolean));

const KNOWN_ENTITIES = [
  'United States', 'United Kingdom', 'European Union', 'United Nations', 'Saudi Arabia',
  'South China Sea', 'North Korea', 'South Korea', 'New Zealand', 'South Africa',
  'Middle East', 'Latin America', 'Asia Pacific', 'White House', 'Downing Street',
  'Kremlin', 'Pentagon', 'State Department', 'Treasury', 'Federal Reserve',
  'European Central Bank', 'World Bank', 'International Monetary Fund',
  'World Health Organization', 'NATO', 'G7', 'G20', 'BRICS', 'ASEAN', 'OPEC',
  'Donald Trump', 'Vladimir Putin', 'Xi Jinping', 'Volodymyr Zelensky',
  'Benjamin Netanyahu', 'Emmanuel Macron', 'Keir Starmer', 'Pope Francis',
  'OpenAI', 'Anthropic', 'Google', 'Microsoft', 'Apple', 'Nvidia', 'Meta', 'Amazon',
  'Tesla', 'SpaceX', 'TikTok', 'ByteDance', 'Huawei', 'TSMC', 'Samsung',
  'BBC', 'CNN', 'Reuters', 'Bloomberg', 'Financial Times',
];

export function extractEntities(input = '') {
  const text = cleanText(input, 800);
  const found = new Map();
  for (const known of KNOWN_ENTITIES) {
    if (new RegExp(`\\b${known.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) {
      found.set(known, (found.get(known) || 0) + 2);
    }
  }
  const matches = text.match(/\b([A-Z][a-zA-Z'’-]{2,}(?:\s+[A-Z][a-zA-Z'’-]{2,}){0,3})\b/g) || [];
  for (const raw of matches) {
    const phrase = raw.trim().replace(/[’']s$/, '');
    const words = phrase.split(/\s+/);
    if (ENTITY_STOP.has(phrase) || ENTITY_STOP.has(words[0])) continue;
    if (words.length === 1 && phrase.length < 4) continue;
    found.set(phrase, (found.get(phrase) || 0) + 1);
  }
  return [...found.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, 12)
    .map(([name]) => name);
}

export function extractNumbers(input = '') {
  return [...new Set(String(input).match(/\b\d+(?:[.,]\d+)?(?:\s?(?:%|bn|billion|million|trillion|people|killed|injured|years|months))?/gi) || [])]
    .map((x) => x.trim())
    .filter((x) => x.length > 1)
    .slice(0, 8);
}

/* ------------------------------------------------------------------ *
 * Tiny .env loader (no dependency)
 * ------------------------------------------------------------------ */

export function loadEnv(root) {
  const file = path.join(root, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!Object.hasOwn(process.env, key)) process.env[key] = value;
  }
}

export function hostFromRequest(req) {
  return String(req.headers.host || '').split(':')[0];
}
