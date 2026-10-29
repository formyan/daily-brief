import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEdition } from '../src/analyze.mjs';
import { parseFeed } from '../src/rss.mjs';
import { makeProceduralCover } from '../src/image.mjs';
import { parseArticleImage } from '../src/article-media.mjs';

const NOW = new Date('2026-10-25T13:00:00Z').getTime();

function source(id, group, extra = {}) {
  return {
    id, group, name: id.toUpperCase(), short: id.slice(0, 4).toUpperCase(),
    section: 'world', country: 'US', countryZh: '美国', type: '商业媒体',
    class: 'independent', independent: true, tier: 1, home: `https://${id}.example/`,
    ...extra,
  };
}

function item(src, title, summary = '', publishedAt = '2026-10-25T12:00:00Z') {
  return {
    id: `${src.id}-${title.slice(0, 12)}`, sourceId: src.id, sourceGroup: src.group,
    section: src.section, title, url: `${src.home}${encodeURIComponent(title)}`,
    summary, publishedAt, author: '', categories: [], language: 'en', source: src,
  };
}

test('RSS and Atom parsing', () => {
  const rss = `<rss xmlns:media="http://search.yahoo.com/mrss/"><channel><title>Test</title><item><title><![CDATA[Brazil votes in runoff]]></title><link>https://example.com/a</link><description><![CDATA[<p>Voters head to polls.</p>]]></description><media:content url="https://example.com/a.jpg" medium="image" width="1200" height="800"/><pubDate>Sun, 25 Oct 2026 12:00:00 GMT</pubDate></item></channel></rss>`;
  const parsedRss = parseFeed(rss, { id: 'x', home: 'https://example.com' });
  assert.equal(parsedRss.items.length, 1);
  assert.equal(parsedRss.items[0].title, 'Brazil votes in runoff');
  assert.match(parsedRss.items[0].summary, /Voters head/);
  assert.equal(parsedRss.items[0].image, 'https://example.com/a.jpg');

  const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><title>Test</title><entry><title>AI chips and trade</title><link rel="alternate" href="https://example.com/b"/><updated>2026-10-25T12:00:00Z</updated><summary>Sector braces for new rules.</summary></entry></feed>`;
  const parsedAtom = parseFeed(atom, { id: 'y', home: 'https://example.com' });
  assert.equal(parsedAtom.format, 'atom');
  assert.equal(parsedAtom.items.length, 1);
  assert.equal(parsedAtom.items[0].url, 'https://example.com/b');
});

test('same event is clustered across independent newsrooms', () => {
  const sources = [
    source('bbc', 'bbc', { country: 'GB', countryZh: '英国', section: 'world' }),
    source('guardian', 'guardian', { country: 'GB', countryZh: '英国', section: 'world' }),
    source('aljazeera', 'aljazeera', { country: 'QA', countryZh: '卡塔尔', section: 'world' }),
  ];
  const items = [
    item(sources[0], 'Voting under way across Brazil in tight presidential runoff between Lula and Bolsonaro', 'Polls opened across Brazil on Sunday as voters choose between Lula and Bolsonaro.'),
    item(sources[1], 'Brazil votes in presidential runoff as Lula faces Bolsonaro', 'Voting is under way in Brazil’s presidential runoff between Lula and Bolsonaro.'),
    item(sources[2], 'Polls open in Brazil presidential runoff', 'Brazilians vote on Sunday in a tight presidential runoff between Lula and Bolsonaro.'),
  ];
  const edition = buildEdition({
    items,
    feedStats: { configured: 3, ok: 3, fetched: 3 },
    date: '2026-10-25',
    now: NOW,
    maxStories: 10,
    windowHours: 36,
  });
  assert.equal(edition.stories.length, 1);
  assert.equal(edition.stories[0].sourceCount, 3);
  assert.equal(edition.stories[0].verification.independentCount, 3);
  assert.equal(edition.stories[0].verification.level, 'strong');
});

test('different named places stay separate', () => {
  const sources = [
    source('one', 'one', { section: 'politics' }),
    source('two', 'two', { section: 'politics' }),
  ];
  const items = [
    item(sources[0], 'Trump courts autoworkers at Michigan rally', 'The former president spoke to union workers in Michigan.'),
    item(sources[1], 'Trump unveils tax plan at Ohio rally', 'The former president announced a tax proposal in Ohio.'),
  ];
  const edition = buildEdition({
    items,
    feedStats: { configured: 2, ok: 2, fetched: 2 },
    date: '2026-10-25',
    now: NOW,
    maxStories: 10,
    windowHours: 36,
  });
  assert.equal(edition.stories.length, 2);
});

test('soft news and product reviews are filtered', () => {
  const s = source('g', 'guardian', { section: 'world' });
  const items = [
    item(s, 'Meghan Markle returns to television with a new series', 'The duchess appears in a new show.'),
    item(s, 'Wallhack M-001 Review: a mouse for gamers', 'A review of a new gaming mouse.'),
  ];
  const edition = buildEdition({
    items,
    feedStats: { configured: 1, ok: 1, fetched: 2 },
    date: '2026-10-25',
    now: NOW,
    maxStories: 10,
    windowHours: 36,
  });
  assert.equal(edition.stories.length, 0);
});

test('article image extraction prefers the declared Open Graph image', () => {
  const html = `<html><head>
    <meta content="https://example.com/og.jpg" property="og:image">
    <meta content="https://example.com/twitter.jpg" name="twitter:image">
    <meta content="OG alt text" property="og:image:alt">
    <title>Test article</title>
  </head></html>`;
  const image = parseArticleImage(html, 'https://example.com/story');
  assert.equal(image.url, 'https://example.com/og.jpg');
  assert.equal(image.alt, 'OG alt text');
});

test('procedural cover is a self-contained SVG', () => {
  const svg = makeProceduralCover({ date: '2026-10-25', topics: ['人工智能', '贸易'] });
  assert.match(svg, /^<svg/);
  assert.match(svg, /viewBox="0 0 1600 900"/);
  assert.match(svg, /<circle/);
  assert.ok(svg.length > 6000);
});
