import '../src/env.mjs';
import { dateKey } from '../src/util.mjs';

const args = process.argv.slice(2);
const dateArg = args.find((arg) => /^\d{4}-\d{2}-\d{2}$/.test(arg)) || dateKey();
const force = !args.includes('--keep');

const { generateEdition } = await import('../src/pipeline.mjs');
try {
  const edition = await generateEdition({ date: dateArg, force });
  console.log(JSON.stringify({
    ok: true,
    date: edition.date,
    stories: edition.stories?.length || 0,
    verified: edition.stats?.verified || 0,
    image: edition.image,
    translation: edition.translation,
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exitCode = 1;
}
