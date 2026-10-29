import path from 'node:path';
import { ROOT } from '../src/config.mjs';
import { buildEdition } from '../src/analyze.mjs';
import { readJson, dateKey } from '../src/util.mjs';

const cache = readJson(path.join(ROOT, 'data', 'cache', 'last-fetch.json'));
if (!cache) {
  console.error('No data/cache/last-fetch.json; run scripts/refresh.mjs first.');
  process.exit(1);
}
const ok = (cache.health || []).filter((h) => h.status === 'ok').length;
const edition = buildEdition({
  items: cache.items || [],
  feedStats: { configured: (cache.health || []).length, ok, fetched: (cache.items || []).length },
  date: dateKey(),
  now: Date.now(),
  maxStories: 32,
  windowHours: 36,
});
console.log('stats', edition.stats);
console.log('sections', edition.sections.map((s) => `${s.id}:${s.count}`).join(' '));
for (const s of edition.stories) {
  console.log(
    String(s.rank).padStart(2),
    s.section.padEnd(9),
    `src=${s.sourceCount}`,
    `art=${s.articleCount}`,
    s.verification.level.padEnd(9),
    s.verification.score,
    '|',
    s.title_en.slice(0, 90),
    '|',
    s.sources.map((x) => x.short).join(','),
  );
}
