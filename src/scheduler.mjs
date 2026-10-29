import fs from 'node:fs';
import path from 'node:path';
import { CONFIG, EDITIONS_DIR } from './config.mjs';
import { dateKey, ensureDir } from './util.mjs';
import { generateEdition, getEdition, isGenerating, listEditions, nextUpdateInfo } from './pipeline.mjs';

let timer = null;
let running = false;
let lastFailureAt = 0;
let failures = 0;
let lastReason = '';

function targetForToday(now = new Date()) {
  const today = dateKey(now);
  return new Date(`${today}T${String(CONFIG.updateHour).padStart(2, '0')}:${String(CONFIG.updateMinute).padStart(2, '0')}:00+08:00`);
}

function editionNeedsRefresh() {
  const today = dateKey();
  const edition = getEdition(today);
  if (!edition?.stories?.length) return { needed: true, reason: 'missing' };
  const target = targetForToday();
  const generated = new Date(edition.generatedAt || 0);
  if (Date.now() >= target.getTime() && generated.getTime() < target.getTime()) {
    return { needed: true, reason: 'pre-update edition' };
  }
  return { needed: false, reason: 'fresh' };
}

async function tick(trigger = 'interval') {
  if (running || isGenerating()) return;
  const now = new Date();
  const target = targetForToday(now);
  const afterUpdate = now.getTime() >= target.getTime();
  const hasAnyEdition = fs.existsSync(EDITIONS_DIR)
    && fs.readdirSync(EDITIONS_DIR).some((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
  const check = editionNeedsRefresh();

  // Bootstrap when there is nothing to show. Otherwise wait for the update time.
  const bootstrap = !hasAnyEdition && CONFIG.refreshOnStart;
  if (!bootstrap && !afterUpdate) return;
  if (!check.needed) return;
  if (failures >= 6) return;
  if (failures > 0 && Date.now() - lastFailureAt < 10 * 60 * 1000) return;

  running = true;
  lastReason = `${trigger}:${check.reason}`;
  try {
    console.log(`[schedule] generating ${dateKey()} (${lastReason})`);
    await generateEdition({ date: dateKey(), force: true });
    failures = 0;
  } catch (error) {
    failures += 1;
    lastFailureAt = Date.now();
    console.error(`[schedule] generation failed (${failures}/6):`, error.message);
  } finally {
    running = false;
  }
}

export function startScheduler() {
  ensureDir(EDITIONS_DIR);
  const info = nextUpdateInfo();
  console.log(`[schedule] daily update ${CONFIG.updateHour}:${String(CONFIG.updateMinute).padStart(2, '0')} ${CONFIG.timeZone}; next ${info.label} (${info.seconds}s)`);
  // Slight delay so the HTTP server is listening before a potentially long run.
  setTimeout(() => { tick('startup'); }, 1200).unref?.();
  timer = setInterval(() => { tick('interval'); }, 30_000);
  timer.unref?.();
  return () => {
    if (timer) clearInterval(timer);
  };
}

export function schedulerStatus() {
  const editions = listEditions();
  return {
    updateTime: `${String(CONFIG.updateHour).padStart(2, '0')}:${String(CONFIG.updateMinute).padStart(2, '0')}`,
    timeZone: CONFIG.timeZone,
    next: nextUpdateInfo(),
    generating: running || isGenerating(),
    failures,
    lastFailureAt: lastFailureAt ? new Date(lastFailureAt).toISOString() : null,
    lastReason,
    editions: editions.length,
    latest: editions[0] || null,
  };
}
