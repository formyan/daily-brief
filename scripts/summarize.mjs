import '../src/env.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { EDITIONS_DIR, ROOT } from '../src/config.mjs';
import { dateKey, readJson, writeJsonAtomic } from '../src/util.mjs';
import { listEditions, getEdition } from '../src/pipeline.mjs';
import { summarizeEdition, summaryProviderInfo } from '../src/summarize.mjs';
import { localizeEdition } from '../src/translate.mjs';

const args = process.argv.slice(2);
const requested = args.find((arg) => /^\d{4}-\d{2}-\d{2}$/.test(arg));
const latest = listEditions()[0]?.date;
const date = requested || latest || dateKey();
const edition = getEdition(date);
if (!edition?.stories?.length) {
  console.error(`No edition found for ${date}. Run scripts/refresh.mjs first.`);
  process.exit(1);
}

console.log('provider config:', summaryProviderInfo());
const result = await summarizeEdition(edition, { force: true });
if (!result.aiSummary || result.aiSummary.status === 'unavailable') {
  console.error(`Summary API unavailable: ${result.aiSummary?.note || 'unknown reason'}`);
  console.error('Set LLM_PROVIDER / LLM_BASE_URL / LLM_MODEL / LLM_API_KEY in .env, then retry.');
  process.exit(2);
}

// Fill any stories the model did not cover, preserving LLM-generated Chinese.
await localizeEdition(result);

const byId = new Map(result.stories.map((story) => [story.id, story]));
result.hero = byId.get(result.heroId) || result.stories[0];
result.topStories = (result.topIds || []).map((id) => byId.get(id)).filter(Boolean);
result.brief = (result.brief || []).map((brief) => {
  const story = byId.get(brief.id);
  return { ...brief, title: story?.title_zh || brief.title, title_en: story?.title_en || brief.title };
});

const outFile = path.join(EDITIONS_DIR, `${date}.json`);
writeJsonAtomic(outFile, result);
console.log(JSON.stringify({
  ok: result.aiSummary.status === 'ok',
  file: path.relative(ROOT, outFile),
  provider: result.aiSummary.provider,
  model: result.aiSummary.model,
  summarized: result.aiSummary.summarized,
  failed: result.aiSummary.failed,
  total: result.aiSummary.total,
}, null, 2));
if (result.aiSummary.status !== 'ok') process.exitCode = 3;
