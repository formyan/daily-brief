import '../src/env.mjs';
import path from 'node:path';
import { EDITIONS_DIR, ROOT } from '../src/config.mjs';
import { getEdition, listEditions } from '../src/pipeline.mjs';
import { enrichStoryImages } from '../src/article-media.mjs';
import { writeJsonAtomic } from '../src/util.mjs';

const requested = process.argv.slice(2).find((arg) => /^\d{4}-\d{2}-\d{2}$/.test(arg));
const date = requested || listEditions()[0]?.date;
const edition = date ? getEdition(date) : null;
if (!edition?.stories?.length) {
  console.error('No edition found. Run scripts/refresh.mjs first.');
  process.exit(1);
}

const stats = await enrichStoryImages(edition);
const byId = new Map(edition.stories.map((story) => [story.id, story]));
edition.hero = byId.get(edition.heroId) || edition.stories[0];
edition.topStories = (edition.topIds || []).map((id) => byId.get(id)).filter(Boolean);
const outFile = path.join(EDITIONS_DIR, `${edition.date}.json`);
writeJsonAtomic(outFile, edition);
console.log(JSON.stringify({
  ok: true,
  date: edition.date,
  file: path.relative(ROOT, outFile),
  images: edition.stories.filter((story) => story.image?.url).length,
  stories: edition.stories.length,
  ...stats,
}, null, 2));
