import test from 'node:test';
import assert from 'node:assert/strict';

process.env.LLM_PROVIDER = 'none';
delete process.env.LLM_BASE_URL;
delete process.env.LLM_API_KEY;

const { parseSummaryPayload, summarizeEdition } = await import('../src/summarize.mjs');

function story(id) {
  return {
    id,
    title_en: 'France protests continue',
    summary_en: 'Hundreds of thousands marched across France.',
    title_zh: '',
    summary_zh: '',
    sources: [{ name: 'BBC', title: 'France protests', summary: 'Marches took place.' }],
    verification: { independentCount: 2, sourceCount: 3, label: '双源印证' },
    importance: 80,
  };
}

test('parses strict JSON and maps ids', () => {
  const batch = [story('s-1'), story('s-2')];
  const payload = {
    items: [
      { id: 's-1', headline: '法国抗议持续', summary: '法国多地继续游行。', why_it_matters: '测试。', key_facts: ['数十万人'], confidence: 'high' },
      { id: 's-2', headline: '第二条', summary: '第二条摘要。', key_facts: [], confidence: 'medium' },
    ],
  };
  const parsed = parseSummaryPayload(JSON.stringify(payload), batch);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].title, '法国抗议持续');
  assert.equal(parsed[0].confidence, 'high');
  assert.deepEqual(parsed[1].facts, []);
});

test('tolerates code fences and a short explanatory prefix', () => {
  const batch = [story('s-1')];
  const text = '```json\n{"items":[{"id":"s-1","headline":"法国抗议","summary":"多地游行持续。"}]}\n```';
  const parsed = parseSummaryPayload(text, batch);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].id, 's-1');
});

test('missing provider leaves the edition intact and records fallback', async () => {
  const edition = {
    date: '2026-10-25',
    stories: [story('s-1')],
    hero: null,
    aiSummary: null,
  };
  const result = await summarizeEdition(edition);
  assert.equal(result.stories[0].summary_zh, '');
  assert.equal(result.aiSummary.status, 'unavailable');
  assert.match(result.aiSummary.note, /none|未配置/);
});
