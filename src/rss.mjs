import { cleanText, decodeEntities, parseDate, safeHttpUrl, shortHash, truncate, uniqueBy } from './util.mjs';

function cdataInner(value = '') {
  return String(value)
    .replace(/^<!\[CDATA\[/, '')
    .replace(/\]\]>$/, '');
}

function tagValue(block, names) {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, 'i');
    const match = block.match(re);
    if (match && match[1] != null) return cdataInner(match[1]).trim();
  }
  return '';
}

function tagAttr(block, name, attr) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`<${escaped}\\b[^>]*\\b${attr}=["']([^"']+)["'][^>]*>`, 'i');
  return block.match(re)?.[1] || '';
}

function extractLink(block, base) {
  // Atom: <link rel="alternate" href="..."/>
  const atomLinks = [...block.matchAll(/<link\b([^>]*)\/?>/gi)];
  for (const match of atomLinks) {
    const attrs = match[1];
    if (/rel=["'](?:self|enclosure|replies)["']/i.test(attrs)) continue;
    const href = attrs.match(/href=["']([^"']+)["']/i)?.[1];
    if (href) return safeHttpUrl(decodeEntities(href), base);
  }
  const plain = tagValue(block, ['link']);
  if (plain) {
    const value = decodeEntities(plain).trim();
    if (value && !value.includes('<')) return safeHttpUrl(value, base);
  }
  const guid = tagValue(block, ['guid', 'id']);
  if (guid && /^https?:\/\//i.test(guid)) return safeHttpUrl(guid, base);
  return '';
}

function extractDate(block) {
  const raw = tagValue(block, [
    'pubDate', 'published', 'updated', 'dc:date', 'date', 'created', 'lastBuildDate',
  ]);
  const parsed = parseDate(raw);
  return parsed ? parsed.toISOString() : null;
}

function extractDescription(block, title) {
  let raw = tagValue(block, [
    'content:encoded', 'description', 'summary', 'content', 'media:description',
  ]);
  if (!raw) return '';
  let text = cleanText(raw, 720);
  if (title && text.toLowerCase().startsWith(title.toLowerCase())) {
    text = text.slice(title.length).replace(/^[\s:–—-]+/, '').trim();
  }
  text = text
    .replace(/The post .{1,160} appeared first on .{1,100}\.?$/i, '')
    .replace(/\[…\]|\[\.\.\.\]/g, ' ')
    .replace(/\b(Continue reading|Read the full story|Read more)\b[\s\S]*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}

function extractAuthor(block) {
  return cleanText(tagValue(block, ['dc:creator', 'author', 'creator', 'byline']), 80)
    .replace(/^by\s+/i, '');
}

function attrsOf(raw = '') {
  const attrs = {};
  for (const match of raw.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*["']([^"']*)["']/g)) {
    attrs[match[1].toLowerCase()] = decodeEntities(match[2]);
  }
  return attrs;
}

function normalizeImageUrl(raw, base) {
  if (!raw) return '';
  const url = safeHttpUrl(decodeEntities(raw).trim(), base);
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:') parsed.protocol = 'https:';
    const haystack = `${parsed.hostname}${parsed.pathname}`.toLowerCase();
    if (/(^|[./_-])(pixel|tracker|tracking|analytics|spacer|1x1|doubleclick|feedburner)([./_-]|$)/.test(haystack)) return '';
    if (/\.(gif|svg)$/i.test(parsed.pathname) && !/logo/i.test(parsed.pathname)) {
      // GIF/SVG are often spacers or logos; allow only explicitly sized media.
      return parsed.href;
    }
    return parsed.href;
  } catch {
    return '';
  }
}

/**
 * Find a usable lead image in an RSS/Atom item. Prefer large media:content
 * renditions, then thumbnails/enclosures, then the first inline <img>.
 */
function extractImage(block, base) {
  const candidates = [];
  const add = (rawUrl, attrs = {}, kind = 'media') => {
    const url = normalizeImageUrl(rawUrl, base);
    if (!url) return;
    const width = Number.parseInt(attrs.width || '', 10) || 0;
    const height = Number.parseInt(attrs.height || '', 10) || 0;
    const area = width && height ? width * height : 0;
    candidates.push({
      url,
      width,
      height,
      area,
      kind,
      alt: cleanText(attrs.alt || attrs.title || '', 160),
    });
  };

  for (const match of block.matchAll(/<media:content\b([^>]*)\/?>/gi)) {
    const attrs = attrsOf(match[1]);
    if (attrs.medium && attrs.medium !== 'image') continue;
    add(attrs.url, attrs, 'media');
  }
  for (const match of block.matchAll(/<media:thumbnail\b([^>]*)\/?>/gi)) {
    add(attrsOf(match[1]).url, attrsOf(match[1]), 'thumbnail');
  }
  for (const match of block.matchAll(/<enclosure\b([^>]*)\/?>/gi)) {
    const attrs = attrsOf(match[1]);
    if (attrs.type && !/^image\//i.test(attrs.type) && !/\.(jpe?g|png|webp|avif)(\?|$)/i.test(attrs.url || '')) continue;
    add(attrs.url, attrs, 'enclosure');
  }
  // Inline images are frequently escaped inside description/content:encoded.
  const decoded = decodeEntities(block);
  for (const match of decoded.matchAll(/<img\b([^>]*)>/gi)) {
    const attrs = attrsOf(match[1]);
    if (!attrs.src) continue;
    add(attrs.src, attrs, 'inline');
  }

  if (!candidates.length) return { url: '', alt: '', width: 0, height: 0 };
  candidates.sort((a, b) => b.area - a.area || (a.kind === 'inline' ? 1 : 0) - (b.kind === 'inline' ? 1 : 0));
  const best = candidates[0];
  return { url: best.url, alt: best.alt, width: best.width, height: best.height };
}

function extractCategories(block) {
  const values = [];
  for (const match of block.matchAll(/<category\b[^>]*>([\s\S]*?)<\/category>/gi)) {
    const v = cleanText(cdataInner(match[1]), 40);
    if (v) values.push(v);
  }
  for (const match of block.matchAll(/<category\b[^>]*term=["']([^"']+)["'][^>]*\/?>/gi)) {
    values.push(cleanText(match[1], 40));
  }
  return [...new Set(values)].slice(0, 6);
}

function blocks(xml, tag) {
  const re = new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}>`, 'gi');
  return xml.match(re) || [];
}

export function parseFeed(xml, source = {}) {
  if (typeof xml !== 'string' || !xml.trim()) {
    return { title: '', items: [], format: 'empty', error: 'Empty response' };
  }
  const head = xml.slice(0, 800).toLowerCase();
  if (head.includes('<!doctype html') || head.includes('<html')) {
    return { title: '', items: [], format: 'html', error: 'Response is HTML, not a feed' };
  }
  let itemBlocks = blocks(xml, 'item');
  let format = 'rss';
  if (!itemBlocks.length) {
    itemBlocks = blocks(xml, 'entry');
    format = itemBlocks.length ? 'atom' : 'unknown';
  }
  const channelTitle = cleanText(tagValue(xml, ['title']), 120);
  const feedUpdated = extractDate(xml);
  const base = source.home || source.url || '';
  const items = itemBlocks.slice(0, 40).map((block, index) => {
    const title = cleanText(tagValue(block, ['title']), 240);
    const link = extractLink(block, base);
    const description = extractDescription(block, title);
    const publishedAt = extractDate(block) || feedUpdated || null;
    const author = extractAuthor(block);
    const categories = extractCategories(block);
    const image = extractImage(block, link || base);
    const id = tagValue(block, ['guid', 'id']) || link || `${source.id || 'feed'}-${index}-${title}`;
    return {
      id: shortHash(`${source.id || ''}|${id}|${title}`, 12),
      sourceId: source.id || '',
      sourceGroup: source.group || source.id || '',
      section: source.section || 'world',
      title,
      url: link,
      summary: description,
      publishedAt,
      author,
      categories,
      image: image.url,
      imageAlt: image.alt || title,
      imageWidth: image.width,
      imageHeight: image.height,
      language: source.language || 'en',
    };
  }).filter((item) => (
    item.title
    && item.title.length >= 12
    && item.title.length <= 240
    && item.url
    && !/^(video|watch|live updates?|in pictures|podcast)\s*[:|-]/i.test(item.title)
  ));

  return {
    title: channelTitle,
    items: uniqueBy(items, (item) => item.url || `${item.title}`),
    format,
    error: items.length ? null : 'No usable items',
  };
}

export function feedDebugSummary(feedResult, source) {
  const latest = feedResult.items.reduce((max, item) => {
    const t = item.publishedAt ? new Date(item.publishedAt).getTime() : 0;
    return t > max ? t : max;
  }, 0);
  return {
    sourceId: source.id,
    sourceName: source.name,
    format: feedResult.format,
    items: feedResult.items.length,
    latest: latest ? new Date(latest).toISOString() : null,
    title: truncate(feedResult.title, 80),
    error: feedResult.error,
  };
}
