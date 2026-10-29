import path from 'node:path';
import { CACHE_DIR, CONFIG } from './config.mjs';
import { fetchText } from './fetch.mjs';
import {
  cleanText, ensureDir, mapLimit, readJson, safeHttpUrl, truncate, writeJsonAtomic,
} from './util.mjs';

const CACHE_FILE = path.join(CACHE_DIR, 'article-images.json');
const CACHE_TTL_MS = 7 * 864e5;

let cache = null;

function loadCache() {
  if (!cache) cache = readJson(CACHE_FILE, {}) || {};
  return cache;
}

function saveCache() {
  try {
    ensureDir(CACHE_DIR);
    writeJsonAtomic(CACHE_FILE, cache);
  } catch {
    // Cache is an optimisation; never fail an edition because of it.
  }
}

function attrsOf(raw = '') {
  const attrs = {};
  for (const match of raw.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*["']([^"']*)["']/g)) {
    attrs[match[1].toLowerCase()] = decodeEntities(match[2]);
  }
  return attrs;
}

function decodeEntities(value = '') {
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function normalizeImage(raw, base) {
  const value = decodeEntities(raw).trim();
  if (!value || /^data:/i.test(value)) return '';
  const url = safeHttpUrl(value, base);
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:') parsed.protocol = 'https:';
    const haystack = `${parsed.hostname}${parsed.pathname}`.toLowerCase();
    if (/(pixel|tracker|tracking|spacer|1x1|doubleclick|feedburner|placeholder|default[-_]?image|site[-_]?logo)/.test(haystack)) {
      return '';
    }
    return parsed.href;
  } catch {
    return '';
  }
}

/**
 * Extract the lead image declared by the article itself. Only Open Graph,
 * Twitter card, image_src and schema.org image metadata are trusted; we do not
 * guess from arbitrary page images.
 */
export function parseArticleImage(html, baseUrl) {
  if (!html || typeof html !== 'string') return null;
  const candidates = [];
  let declaredAlt = '';
  for (const match of html.matchAll(/<meta\b([^>]*)>/gi)) {
    const attrs = attrsOf(match[1]);
    const key = (attrs.property || attrs.name || attrs.itemprop || '').toLowerCase();
    if (!key) continue;
    if ((key === 'og:image:alt' || key === 'twitter:image:alt') && attrs.content) {
      declaredAlt = cleanText(attrs.content, 180);
      continue;
    }
    let priority = 0;
    if (key === 'og:image:secure_url') priority = 6;
    else if (key === 'og:image') priority = 5;
    else if (key === 'twitter:image') priority = 4;
    else if (key === 'twitter:image:src') priority = 3;
    else if (key === 'image' || key === 'thumbnailurl') priority = 2;
    if (!priority || !attrs.content) continue;
    const url = normalizeImage(attrs.content, baseUrl);
    if (url) candidates.push({ url, priority, alt: declaredAlt });
  }
  for (const match of html.matchAll(/<link\b([^>]*)>/gi)) {
    const attrs = attrsOf(match[1]);
    if (!/image_src/i.test(attrs.rel || '') || !attrs.href) continue;
    const url = normalizeImage(attrs.href, baseUrl);
    if (url) candidates.push({ url, priority: 1, alt: '' });
  }

  if (!candidates.length) return null;
  const best = candidates.sort((a, b) => b.priority - a.priority)[0];
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return {
    url: best.url,
    alt: cleanText(declaredAlt || titleMatch?.[1] || '', 180),
  };
}

export async function lookupArticleImage(articleUrl) {
  const c = loadCache();
  const cached = c[articleUrl];
  if (cached && Date.now() - new Date(cached.checkedAt).getTime() < CACHE_TTL_MS) {
    return cached.image ? { ...cached.image, cached: true } : null;
  }
  try {
    const res = await fetchText(articleUrl, {
      timeoutMs: CONFIG.imageLookupTimeoutMs,
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'Cache-Control': 'no-cache',
      },
    });
    if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`);
    const image = parseArticleImage(res.text, articleUrl);
    c[articleUrl] = { checkedAt: new Date().toISOString(), image };
    saveCache();
    return image ? { ...image, cached: false } : null;
  } catch (error) {
    // Cache negative results for a day so one blocked site cannot slow every run.
    c[articleUrl] = {
      checkedAt: new Date().toISOString(),
      image: null,
      error: truncate(error.message, 160),
    };
    saveCache();
    return null;
  }
}

/**
 * Add original article images to stories. RSS media is used first; only stories
 * without one trigger an article-page Open Graph lookup. Missing images stay
 * missing: the UI intentionally does not substitute generated art on the detail
 * page.
 */
export async function enrichStoryImages(edition, { max = CONFIG.imageLookupMax } = {}) {
  if (!edition?.stories?.length) return { attempted: 0, found: 0, failed: 0, skipped: true };
  if (!CONFIG.imageLookup) return { attempted: 0, found: 0, failed: 0, skipped: true };

  const needsImage = (story) => {
    if (!story.image?.url) return true;
    const width = Number(story.image.width) || 0;
    const url = String(story.image.url);
    return width > 0 && width < 640
      || /[?&](?:width|w)=(?:1[0-9]{2}|2[0-9]{2}|3[0-9]{2})(?:&|$)/i.test(url)
      || /\/standard\/(?:120|240|320)\//i.test(url);
  };

  const targets = edition.stories
    .filter(needsImage)
    .sort((a, b) => (b.importance || 0) - (a.importance || 0))
    .slice(0, Math.max(0, max));

  let found = 0;
  let upgraded = 0;
  let failed = 0;
  await mapLimit(targets, Math.max(1, CONFIG.imageLookupConcurrency), async (story) => {
    const hadImage = Boolean(story.image?.url);
    const image = await lookupArticleImage(story.url);
    if (!image?.url) {
      failed += 1;
      return;
    }
    const source = (story.sources || []).find((item) => item.url === story.url)
      || (story.sources || [])[0]
      || {};
    story.image = {
      url: image.url,
      alt: image.alt || story.title_en,
      width: 0,
      height: 0,
      credit: source.name || '',
      creditUrl: source.url || story.url,
      sourceId: source.id || '',
      fromArticle: true,
    };
    if (hadImage) upgraded += 1;
    else found += 1;
  });

  edition.imageLookup = {
    attempted: targets.length,
    found,
    upgraded,
    failed,
    at: new Date().toISOString(),
  };
  return edition.imageLookup;
}
