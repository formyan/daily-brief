import fs from 'node:fs';
import path from 'node:path';
import { CACHE_DIR, CONFIG } from './config.mjs';
import { fetchText } from './fetch.mjs';
import { mapLimit, readJson, sha1, sleep, writeJsonAtomic } from './util.mjs';

const CACHE_FILE = path.join(CACHE_DIR, 'translations.json');
let cache = null;
let dirty = false;
let saveTimer = null;

function loadCache() {
  if (cache) return cache;
  cache = readJson(CACHE_FILE, {}) || {};
  return cache;
}

function scheduleSave() {
  dirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (!dirty) return;
    try {
      writeJsonAtomic(CACHE_FILE, cache);
      dirty = false;
    } catch (error) {
      console.warn('[translate] cache save failed:', error.message);
    }
  }, 2000);
  saveTimer.unref?.();
}

const CJK = /[\u3400-\u9fff]/;

export function hasChinese(text = '') {
  return CJK.test(String(text));
}

function latinRatio(text = '') {
  const s = String(text).replace(/[\s\d\p{P}]/gu, '');
  if (!s) return 0;
  const latin = s.match(/[A-Za-z]/g)?.length || 0;
  return latin / s.length;
}

function extractTranslated(json) {
  try {
    const data = JSON.parse(json);
    const segments = data?.[0];
    if (!Array.isArray(segments)) return '';
    return segments.map((part) => (Array.isArray(part) ? part[0] : '')).join('').trim();
  } catch {
    return '';
  }
}

function parseClients5(json, expected) {
  try {
    const data = JSON.parse(json);
    if (!Array.isArray(data)) return null;
    const parts = data.map((item) => (Array.isArray(item) ? item[0] : item)).map((item) => String(item || '').trim());
    if (parts.length !== expected || parts.some((item) => !item)) return null;
    return parts;
  } catch {
    return null;
  }
}

/**
 * The dict-chrome-ex endpoint accepts repeated `q` params and returns one
 * translation per q. It is substantially more tolerant of small daily batches
 * than the gtx single endpoint.
 */
async function requestBatch(texts) {
  const url = new URL('https://clients5.google.com/translate_a/t');
  url.searchParams.set('client', 'dict-chrome-ex');
  url.searchParams.set('sl', 'auto');
  url.searchParams.set('tl', 'zh-CN');
  for (const text of texts) url.searchParams.append('q', String(text).slice(0, 1800));
  const res = await fetchText(url.href, {
    timeoutMs: 20000,
    headers: { Accept: 'application/json,text/plain,*/*' },
  });
  if (res.status !== 200) throw new Error(`translate HTTP ${res.status}`);
  const parts = parseClients5(res.text, texts.length);
  if (!parts) throw new Error('translate returned an unexpected shape');
  return parts;
}

async function requestTranslation(text) {
  const parts = await requestBatch([String(text).slice(0, 1800)]);
  if (!parts[0]) throw new Error('translate returned empty');
  return parts[0];
}

/**
 * Translate several short strings with one request. This keeps a daily run to
 * a handful of calls, which matters because the public endpoint rate-limits.
 */
export async function translateMany(texts, { retries = 1 } = {}) {
  const results = new Map();
  const uncached = [];
  const c = loadCache();
  for (const text of texts) {
    const input = String(text || '').trim();
    if (!input || hasChinese(input) || latinRatio(input) < 0.2) {
      results.set(text, input);
      continue;
    }
    const key = `zh:${sha1(input)}`;
    if (c[key]) {
      results.set(text, c[key]);
      continue;
    }
    uncached.push({ text, key, input });
  }
  if (!uncached.length) return results;

  // Chunk by source length, not item count, so one long summary cannot blow
  // past the endpoint limit.
  const chunks = [];
  let current = [];
  let chars = 0;
  for (const item of uncached) {
    if (current.length && (chars + item.input.length > 3200 || current.length >= 10)) {
      chunks.push(current);
      current = [];
      chars = 0;
    }
    current.push(item);
    chars += item.input.length + 8;
  }
  if (current.length) chunks.push(current);

  for (const chunk of chunks) {
    let batchOk = false;
    for (let attempt = 0; attempt <= retries && !batchOk; attempt += 1) {
      try {
        const parts = await requestBatch(chunk.map((item) => item.input));
        chunk.forEach((item, index) => {
          c[item.key] = parts[index];
          results.set(item.text, parts[index]);
          batchOk = true;
        });
      } catch (error) {
        if (attempt >= retries) {
          console.warn('[translate] batch failed:', error.message);
        } else {
          await sleep(900 * (attempt + 1));
        }
      }
    }
    if (!batchOk) {
      // Do not hammer the endpoint: leave this chunk in its source language.
      for (const item of chunk) results.set(item.text, item.input);
    }
  }
  scheduleSave();
  return results;
}

export async function translateText(text, { retries = 2 } = {}) {
  const input = String(text || '').trim();
  if (!input || hasChinese(input) || latinRatio(input) < 0.2) return { text: input, translated: false, cached: false };
  const c = loadCache();
  const key = `zh:${sha1(input)}`;
  if (c[key]) return { text: c[key], translated: true, cached: true };
  if (!CONFIG.translate) return { text: input, translated: false, cached: false };

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const out = await requestTranslation(input);
      if (out) {
        c[key] = out;
        scheduleSave();
        return { text: out, translated: true, cached: false };
      }
    } catch (error) {
      if (attempt >= retries) {
        return { text: input, translated: false, cached: false, error: error.message };
      }
      await sleep(500 * (attempt + 1));
    }
  }
  return { text: input, translated: false, cached: false };
}

/**
 * Add Chinese titles and summaries to an edition in-place (and return it).
 * Only a bounded number of strings are translated to keep a daily run quick.
 */
let translationProbe = null;

async function translationWorks() {
  if (translationProbe !== null) return translationProbe;
  if (!CONFIG.translate) {
    translationProbe = false;
    return false;
  }
  const result = await translateText('The world this morning.', { retries: 0 });
  translationProbe = Boolean(result.translated);
  if (!translationProbe) console.warn('[translate] service unavailable; keeping source language');
  return translationProbe;
}

export async function localizeEdition(edition) {
  if (!edition?.stories?.length) return edition;
  const available = await translationWorks();
  if (!available) {
    for (const story of edition.stories) {
      if (story.summaryProvider !== 'llm') {
        story.title_zh = story.title_en;
        story.summary_zh = story.summary_en;
        story.summaryProvider = 'rss';
      }
      for (const source of story.sources) source.title_zh = source.title;
    }
    edition.translation = {
      provider: 'unavailable',
      translated: 0,
      failed: edition.stories.length,
      total: edition.stories.length,
      note: '翻译服务暂不可用，保留原文标题与摘要。',
    };
    return edition;
  }
  const jobs = [];
  const seen = new Set();
  const push = (owner, field, text, meta = {}) => {
    if (owner?.[field] && hasChinese(owner[field])) return;
    if (!text || hasChinese(text) || latinRatio(text) < 0.2) {
      if (owner && field) owner[field] = text || owner[field] || '';
      return;
    }
    const key = `${field}:${text}`;
    if (seen.has(key)) return;
    seen.add(key);
    jobs.push({ owner, field, text, ...meta });
  };

  for (const story of edition.stories) {
    push(story, 'title_zh', story.title_en, { kind: 'title' });
    push(story, 'summary_zh', story.summary_en, { kind: 'summary' });
  }
  // Source headlines are useful for comparing framing, but only translate a
  // bounded sample so a broken translation service cannot stall the edition.
  for (const story of edition.stories.slice(0, 6)) {
    if (story.sources.length < 2) continue;
    for (const source of story.sources.slice(0, 4)) {
      push(source, 'title_zh', source.title, { kind: 'source' });
    }
  }

  const limited = jobs.slice(0, CONFIG.translationLimit);
  let translated = 0;
  let failed = 0;
  const uniqueTexts = [...new Set(limited.map((job) => job.text))];
  const translatedMap = await translateMany(uniqueTexts, { retries: 1 });
  for (const job of limited) {
    const out = translatedMap.get(job.text);
    if (out && out !== job.text) {
      job.owner[job.field] = out;
      translated += 1;
    } else {
      job.owner[job.field] = job.text;
      failed += 1;
    }
  }

  // Anything over the translation budget still gets a readable fallback.
  for (const story of edition.stories) {
    if (!story.title_zh) story.title_zh = story.title_en;
    if (!story.summary_zh) story.summary_zh = story.summary_en;
    if (!story.summaryProvider) {
      story.summaryProvider = story.summary_zh !== story.summary_en ? 'translated' : 'rss';
    }
    for (const source of story.sources) {
      if (!source.title_zh) source.title_zh = source.title;
    }
  }

  if (edition.hero) {
    edition.hero.title_zh = edition.stories.find((s) => s.id === edition.hero.id)?.title_zh || edition.hero.title_en;
    edition.hero.summary_zh = edition.stories.find((s) => s.id === edition.hero.id)?.summary_zh || edition.hero.summary_en;
  }
  edition.translation = {
    provider: CONFIG.translate ? 'Google Translate (unofficial endpoint)' : 'disabled',
    translated,
    failed,
    total: limited.length,
    note: translated ? '未生成 AI 摘要的条目使用机器翻译，专有名词请以原文为准。' : '翻译服务不可用，保留原文标题与摘要。',
  };
  return edition;
}

export function translationCachePath() {
  return CACHE_FILE;
}
