import fs from 'node:fs';
import path from 'node:path';
import { CACHE_DIR, CONFIG, DATA_DIR, EDITIONS_DIR, LOGS_DIR, UPDATE_LABEL } from './config.mjs';
import { fetchText, getProxyInfo } from './fetch.mjs';
import { parseFeed } from './rss.mjs';
import { buildEdition, isUsableItem } from './analyze.mjs';
import { localizeEdition } from './translate.mjs';
import { summarizeEdition } from './summarize.mjs';
import { enrichStoryImages } from './article-media.mjs';
import { makeCover } from './image.mjs';
import {
  dateKey, ensureDir, hoursAgo, mapLimit, readJson, sleep, timeKey, writeJsonAtomic,
} from './util.mjs';
import { SOURCES, UNAVAILABLE_SOURCES, SECTIONS } from './sources.mjs';

const STATE_FILE = path.join(DATA_DIR, 'state.json');
const LOCK_FILE = path.join(DATA_DIR, 'pipeline.lock');

function log(...args) {
  console.log('[brief]', ...args);
}

function anchorForDate(date) {
  const today = dateKey();
  if (date === today) return new Date();
  const target = new Date(`${date}T${String(CONFIG.updateHour).padStart(2, '0')}:${String(CONFIG.updateMinute).padStart(2, '0')}:00+08:00`);
  return Number.isNaN(target.getTime()) ? new Date() : target;
}

function readLock() {
  try {
    const raw = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
    const age = Date.now() - new Date(raw.startedAt).getTime();
    return { ...raw, stale: age > 20 * 60 * 1000 };
  } catch {
    return null;
  }
}

export function isGenerating() {
  const lock = readLock();
  return Boolean(lock && !lock.stale);
}

function acquireLock(date) {
  ensureDir(DATA_DIR);
  const current = readLock();
  if (current && !current.stale) {
    throw new Error(`A generation is already running for ${current.date}`);
  }
  writeJsonAtomic(LOCK_FILE, { date, startedAt: new Date().toISOString(), pid: process.pid });
}

function releaseLock() {
  try {
    fs.unlinkSync(LOCK_FILE);
  } catch {
    // ignore
  }
}

async function fetchSource(source) {
  const started = Date.now();
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetchText(source.url, {
        timeoutMs: CONFIG.fetchTimeoutMs,
        headers: {
          Referer: source.home || source.url,
          'Cache-Control': 'no-cache',
        },
      });
      if (res.status < 200 || res.status >= 300) {
        throw new Error(`HTTP ${res.status}`);
      }
      const parsed = parseFeed(res.text, source);
      if (!parsed.items.length) throw new Error(parsed.error || 'No items');
      const latestMs = parsed.items.reduce((max, item) => {
        const t = item.publishedAt ? new Date(item.publishedAt).getTime() : 0;
        return t > max ? t : max;
      }, 0);
      const latest = latestMs ? new Date(latestMs).toISOString() : null;
      const ageDays = latest ? (Date.now() - latestMs) / 864e5 : 999;
      if (ageDays > 7) {
        return {
          source,
          items: [],
          health: {
            id: source.id, name: source.name, short: source.short, section: source.section,
            status: 'stale', items: parsed.items.length, latest, ms: Date.now() - started,
            error: `Latest item is ${ageDays.toFixed(1)} days old`,
          },
        };
      }
      const items = parsed.items.map((item) => ({ ...item, source }));
      return {
        source,
        items,
        health: {
          id: source.id, name: source.name, short: source.short, section: source.section,
          status: 'ok', items: items.length, latest, ms: Date.now() - started, error: null,
          format: parsed.format,
        },
      };
    } catch (error) {
      lastError = error;
      if (attempt === 0) await sleep(700);
    }
  }
  return {
    source,
    items: [],
    health: {
      id: source.id, name: source.name, short: source.short, section: source.section,
      status: 'error', items: 0, latest: null, ms: Date.now() - started, error: lastError?.message || 'Unknown error',
    },
  };
}

function sourceMix(health) {
  const ok = health.filter((h) => h.status === 'ok');
  const bySection = {};
  for (const section of Object.keys(SECTIONS)) {
    bySection[section] = ok.filter((h) => h.section === section).length;
  }
  return {
    ok: ok.length,
    stale: health.filter((h) => h.status === 'stale').length,
    error: health.filter((h) => h.status === 'error').length,
    bySection,
  };
}

export async function generateEdition({ date = dateKey(), force = false } = {}) {
  ensureDir(EDITIONS_DIR);
  ensureDir(LOGS_DIR);
  const outFile = path.join(EDITIONS_DIR, `${date}.json`);
  if (!force && fs.existsSync(outFile)) {
    const existing = readJson(outFile);
    if (existing?.stories?.length) {
      log(`edition ${date} already exists; skipping`);
      return existing;
    }
  }
  acquireLock(date);
  const startedAt = new Date();
  const proxyInfo = getProxyInfo();
  log(`generating ${date}; ${SOURCES.length} feeds; proxy=${proxyInfo.proxy || 'direct'} (${proxyInfo.source})`);

  try {
    const results = await mapLimit(SOURCES, CONFIG.fetchConcurrency, fetchSource);
    const health = results.map((r) => r.status === 'fulfilled' ? r.value.health : {
      id: 'unknown', name: 'unknown', status: 'error', items: 0, latest: null, ms: 0,
      error: r.reason?.message || 'Fetch failed',
    });
    const allItems = results
      .filter((r) => r.status === 'fulfilled')
      .flatMap((r) => r.value.items);
    const ok = health.filter((h) => h.status === 'ok');
    const latest = health.reduce((max, h) => {
      const t = h.latest ? new Date(h.latest).getTime() : 0;
      return t > max ? t : max;
    }, 0);
    log(`fetch complete: ${ok.length}/${SOURCES.length} feeds ok, ${allItems.length} items`);
    try {
      ensureDir(CACHE_DIR);
      writeJsonAtomic(path.join(CACHE_DIR, 'last-fetch.json'), {
        fetchedAt: new Date().toISOString(),
        health,
        items: allItems,
      });
    } catch (error) {
      log('raw cache write failed:', error.message);
    }

    if (ok.length < CONFIG.minSources) {
      throw new Error(`Only ${ok.length} usable feeds (minimum ${CONFIG.minSources}); refusing to publish an unverified edition`);
    }

    const anchor = anchorForDate(date);
    const feedStats = {
      configured: SOURCES.length,
      ok: ok.length,
      fetched: allItems.length,
      latest: latest ? new Date(latest).toISOString() : null,
    };
    const edition = buildEdition({
      items: allItems,
      feedStats,
      date,
      now: anchor.getTime(),
      maxStories: CONFIG.maxStories,
      windowHours: CONFIG.windowHours,
    });

    if (!edition.stories?.length) throw new Error('No stories survived filtering and clustering');

    // Original article images: use RSS media first, then Open Graph metadata
    // from the article page for the most important stories still missing one.
    try {
      await enrichStoryImages(edition);
    } catch (error) {
      log('article image enrichment failed:', error.message);
      edition.imageLookup = { attempted: 0, found: 0, failed: 0, error: error.message };
    }

    // Cover art: local diffusion first, deterministic SVG as the fallback.
    const topics = [
      ...new Set(edition.stories.slice(0, 8).flatMap((s) => s.tags || [])),
    ].slice(0, 5);
    let cover;
    try {
      cover = await makeCover({ date, topics, heroTitle: edition.hero?.title_en || '' });
    } catch (error) {
      log('cover generation failed:', error.message);
      cover = { path: `/media/covers/${date}.svg`, provider: 'procedural' };
    }

    edition.image = cover.path;
    edition.imageProvider = cover.provider;
    edition.updateTime = UPDATE_LABEL;
    edition.timeZone = CONFIG.timeZone;
    edition.windowHours = CONFIG.windowHours;
    edition.fetchedAt = new Date().toISOString();
    edition.status = 'live';
    edition.mode = date === dateKey() ? 'live' : 'archive';
    edition.proxy = proxyInfo.proxy ? { enabled: true, source: proxyInfo.source } : { enabled: false, source: 'direct' };
    edition.sourceHealth = health;
    edition.sourceMix = sourceMix(health);
    edition.unavailableSources = UNAVAILABLE_SOURCES;
    edition.method = {
      windowHours: CONFIG.windowHours,
      clustering: '标题词向量 + 实体/数字重叠，按事件聚类',
      verification: '仅将不同 newsroom 的独立报道计入交叉印证；官方与国家媒体单独标注。',
      translation: '未生成 AI 摘要的条目使用机器翻译，专有名词以原文为准。',
      summary: '优先调用 OpenAI 兼容 / Ollama 摘要 API，只向模型提供 RSS 标题与短摘要；失败时回退到 RSS 摘要翻译。',
    };

    // LLM synthesis first: it needs the original English headlines + source
    // snippets. Translation then fills any story the model did not cover.
    await summarizeEdition(edition);
    await localizeEdition(edition);

    // Keep the brief labels in sync with localized story titles.
    edition.brief = (edition.brief || []).map((brief) => {
      const story = edition.stories.find((s) => s.id === brief.id);
      return { ...brief, title: story?.title_zh || brief.title, title_en: story?.title_en || brief.title };
    });

    edition.stories = edition.stories.map((story) => {
      const sources = story.sources.map((source) => ({ ...source }));
      return {
        ...story,
        sectionLabel: SECTIONS[story.section]?.label || story.sectionLabel,
        sources,
      };
    });
    // Refresh references after the map above (hero/topStories point to old objects).
    const byId = new Map(edition.stories.map((s) => [s.id, s]));
    edition.hero = byId.get(edition.heroId) || edition.stories[0];
    edition.topStories = (edition.topIds || []).map((id) => byId.get(id)).filter(Boolean);
    edition.brief = (edition.brief || []).map((brief) => {
      const story = byId.get(brief.id);
      return { ...brief, title: story?.title_zh || brief.title, title_en: story?.title_en || brief.title };
    });

    writeJsonAtomic(outFile, edition);
    const state = readJson(STATE_FILE, {});
    writeJsonAtomic(STATE_FILE, {
      ...state,
      lastSuccess: edition.generatedAt,
      lastAttempt: new Date().toISOString(),
      lastDate: date,
      lastError: null,
      lastStats: edition.stats,
      proxy: edition.proxy,
    });
    writeJsonAtomic(path.join(LOGS_DIR, `pipeline-${date}.json`), {
      date,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      feeds: health,
      stats: edition.stats,
      image: { path: edition.image, provider: edition.imageProvider },
      articleImages: edition.imageLookup,
      translation: edition.translation,
      aiSummary: edition.aiSummary,
    });
    log(`edition ${date} ready: ${edition.stories.length} stories, ${edition.stats.verified} cross-checked, cover=${edition.imageProvider}, article-images=${edition.imageLookup?.found || 0}/${edition.imageLookup?.attempted || 0}, summary=${edition.aiSummary?.status || 'unknown'} (${edition.aiSummary?.summarized || 0}/${edition.aiSummary?.total || 0})`);
    return edition;
  } catch (error) {
    const state = readJson(STATE_FILE, {});
    writeJsonAtomic(STATE_FILE, {
      ...state,
      lastAttempt: new Date().toISOString(),
      lastError: error.message,
    });
    log('generation failed:', error.message);
    throw error;
  } finally {
    releaseLock();
  }
}

export function getState() {
  return readJson(STATE_FILE, {});
}

export function listEditions() {
  return fs.readdirSync(EDITIONS_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
    .reverse()
    .map((file) => {
      const date = file.replace('.json', '');
      const edition = readJson(path.join(EDITIONS_DIR, file));
      return {
        date,
        title: edition?.hero?.title_zh || edition?.hero?.title_en || '每日简报',
        generatedAt: edition?.generatedAt || null,
        stats: edition?.stats || null,
        image: edition?.image || null,
        status: edition?.status || 'archive',
      };
    });
}

export function getEdition(date) {
  const file = path.join(EDITIONS_DIR, `${date}.json`);
  return readJson(file, null);
}

export function getLatestEdition() {
  const editions = listEditions();
  if (!editions.length) return null;
  return getEdition(editions[0].date);
}

export function nextUpdateInfo(now = new Date()) {
  const today = dateKey(now);
  const [y, m, d] = today.split('-').map(Number);
  const targetToday = new Date(`${today}T${String(CONFIG.updateHour).padStart(2, '0')}:${String(CONFIG.updateMinute).padStart(2, '0')}:00+08:00`);
  let target = targetToday;
  if (now.getTime() >= targetToday.getTime()) {
    target = new Date(Date.UTC(y, m - 1, d + 1, CONFIG.updateHour - 8, CONFIG.updateMinute, 0));
  }
  return {
    date: dateKey(target),
    at: target.toISOString(),
    label: `${dateKey(target) === today ? '今日' : '明日'} ${UPDATE_LABEL}`,
    seconds: Math.max(0, Math.round((target.getTime() - now.getTime()) / 1000)),
  };
}

export function editionAgeHours(date) {
  const edition = getEdition(date);
  if (!edition?.generatedAt) return 999;
  return hoursAgo(edition.generatedAt);
}

export function publishedToday() {
  return fs.existsSync(path.join(EDITIONS_DIR, `${dateKey()}.json`));
}

export function nowTimeLabel() {
  return timeKey();
}
