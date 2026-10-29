import './src/env.mjs';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { CONFIG, DATA_DIR, EDITIONS_DIR, PUBLIC_DIR, ROOT } from './src/config.mjs';
import { getProxyInfo } from './src/fetch.mjs';
import {
  generateEdition, getEdition, getLatestEdition, getState, isGenerating, listEditions,
  nextUpdateInfo,
} from './src/pipeline.mjs';
import { startScheduler, schedulerStatus } from './src/scheduler.mjs';
import { SOURCES, UNAVAILABLE_SOURCES } from './src/sources.mjs';
import { ensureDir, safeHttpUrl } from './src/util.mjs';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

function json(res, status, value, headers = {}) {
  const body = Buffer.from(JSON.stringify(value));
  const accept = String(res.req?.headers?.['accept-encoding'] || '');
  const useGzip = body.length > 1024 && /\bgzip\b/.test(accept);
  const payload = useGzip ? zlib.gzipSync(body, { level: 6 }) : body;
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': payload.length,
    'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    ...(useGzip ? { 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' } : {}),
    ...headers,
  });
  res.end(payload);
}

function text(res, status, value, contentType = 'text/plain; charset=utf-8', headers = {}) {
  const body = Buffer.from(value);
  res.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': body.length,
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(body);
}

function securityHeaders() {
  return {
    'Content-Security-Policy': [
      "default-src 'self'",
      "img-src 'self' data: https:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline'",
      "connect-src 'self'",
      "font-src 'self'",
      "base-uri 'self'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join('; '),
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'geolocation=(), camera=(), microphone=(), payment=()',
  };
}

function isLocal(req) {
  const addr = String(req.socket.remoteAddress || '');
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > limit) {
        reject(new Error('Body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function serveFile(req, res, file, { cache = 'public, max-age=3600' } = {}) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;
  const ext = path.extname(file).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';
  const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ETag: etag, ...securityHeaders() });
    res.end();
    return true;
  }
  const headers = {
    'Content-Type': contentType,
    'Content-Length': stat.size,
    'Cache-Control': cache,
    ETag: etag,
    ...securityHeaders(),
  };
  if (ext === '.js' || ext === '.mjs' || ext === '.css' || ext === '.html') {
    headers.Vary = 'Accept-Encoding';
  }
  res.writeHead(200, headers);
  if (req.method === 'HEAD') {
    res.end();
    return true;
  }
  fs.createReadStream(file).pipe(res);
  return true;
}

function safeJoin(root, requestPath) {
  const decoded = decodeURIComponent(requestPath.split('?')[0]);
  const normalized = path.posix.normalize(decoded).replace(/^(\.\.\/)+/, '');
  const full = path.resolve(root, `.${normalized.startsWith('/') ? normalized : `/${normalized}`}`);
  const rootResolved = path.resolve(root);
  if (full !== rootResolved && !full.startsWith(`${rootResolved}${path.sep}`)) return null;
  return full;
}

function apiStatus() {
  const state = getState();
  const editions = listEditions();
  const latest = editions[0] || null;
  const latestEdition = latest ? getEdition(latest.date) : null;
  const proxy = getProxyInfo();
  const health = latestEdition?.sourceHealth || [];
  return {
    ok: true,
    serverTime: new Date().toISOString(),
    updateTime: `${String(CONFIG.updateHour).padStart(2, '0')}:${String(CONFIG.updateMinute).padStart(2, '0')}`,
    timeZone: CONFIG.timeZone,
    nextUpdate: nextUpdateInfo(),
    generating: isGenerating(),
    scheduler: schedulerStatus(),
    latest,
    editions: editions.length,
    aiSummary: latestEdition?.aiSummary || null,
    feeds: {
      configured: SOURCES.length,
      ok: health.filter((h) => h.status === 'ok').length,
      stale: health.filter((h) => h.status === 'stale').length,
      error: health.filter((h) => h.status === 'error').length,
    },
    proxy: proxy.proxy ? { enabled: true, source: proxy.source } : { enabled: false, source: 'direct' },
    lastError: state.lastError || null,
    lastSuccess: state.lastSuccess || null,
    version: '1.3.1',
  };
}

async function handleApi(req, res, url) {
  const pathname = url.pathname;
  if (req.method === 'GET' && pathname === '/api/health') {
    return json(res, 200, { ok: true, time: new Date().toISOString() });
  }
  if (req.method === 'GET' && pathname === '/api/status') {
    return json(res, 200, apiStatus());
  }
  if (req.method === 'GET' && pathname === '/api/editions') {
    return json(res, 200, { editions: listEditions(), updateTime: CONFIG.updateHour, timeZone: CONFIG.timeZone });
  }
  if (req.method === 'GET' && pathname === '/api/editions/latest') {
    const edition = getLatestEdition();
    if (!edition) return json(res, 404, { error: 'No edition has been generated yet', code: 'NO_EDITION' });
    return json(res, 200, edition);
  }
  const match = pathname.match(/^\/api\/editions\/(\d{4}-\d{2}-\d{2})$/);
  if (req.method === 'GET' && match) {
    const edition = getEdition(match[1]);
    if (!edition) return json(res, 404, { error: 'Edition not found', code: 'NOT_FOUND', date: match[1] });
    return json(res, 200, edition);
  }
  if (req.method === 'GET' && pathname === '/api/sources') {
    const latest = getLatestEdition();
    const health = new Map((latest?.sourceHealth || []).map((h) => [h.id, h]));
    return json(res, 200, {
      sources: SOURCES.map((s) => ({
        id: s.id, name: s.name, short: s.short, section: s.section, country: s.country,
        countryZh: s.countryZh, type: s.type, class: s.class, independent: s.independent,
        tier: s.tier, home: safeHttpUrl(s.home), note: s.note,
        health: health.get(s.id) || { status: 'unfetched', items: 0, latest: null },
      })),
      unavailable: UNAVAILABLE_SOURCES,
      updateTime: `${CONFIG.updateHour}:${String(CONFIG.updateMinute).padStart(2, '0')}`,
    });
  }
  if (req.method === 'POST' && pathname === '/api/refresh') {
    const token = req.headers['x-admin-token'];
    if (!isLocal(req) && (!CONFIG.adminToken || token !== CONFIG.adminToken)) {
      return json(res, 403, { error: 'Refresh is only available from the local machine (or with ADMIN_TOKEN)' });
    }
    if (isGenerating()) return json(res, 409, { error: 'A generation is already running', code: 'BUSY' });
    let body = {};
    try {
      body = await readBody(req);
    } catch (error) {
      return json(res, 400, { error: error.message });
    }
    const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : undefined;
    // Start in the background; the client polls /api/status and /api/editions/latest.
    setTimeout(() => {
      generateEdition({ date, force: true }).catch((error) => {
        console.error('[api] manual refresh failed:', error.message);
      });
    }, 50);
    return json(res, 202, { started: true, date: date || null, message: 'Generation started' });
  }
  return json(res, 404, { error: 'Unknown API endpoint' });
}

function logRequest(req, res, started) {
  const ms = Date.now() - started;
  const pathname = String(req.url || '').split('?')[0];
  if (pathname.startsWith('/api/') || ms > 800) {
    console.log(`${req.method} ${pathname} ${res.statusCode} ${ms}ms`);
  }
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  res.on('finish', () => logRequest(req, res, started));
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  try {
    if (url.pathname.startsWith('/api/')) {
      return await handleApi(req, res, url);
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return text(res, 405, 'Method Not Allowed');
    }

    // Media files are stored outside public/ so the daily generated covers can
    // be written without touching the web root.
    if (url.pathname.startsWith('/media/')) {
      const full = safeJoin(path.join(DATA_DIR, 'media'), url.pathname.replace(/^\/media/, ''));
      if (!full) return text(res, 400, 'Bad path');
      if (serveFile(req, res, full, { cache: 'public, max-age=86400, immutable' })) return;
      return text(res, 404, 'Not found');
    }

    if (url.pathname === '/sw.js') {
      const file = path.join(PUBLIC_DIR, 'sw.js');
      res.setHeader('Service-Worker-Allowed', '/');
      if (serveFile(req, res, file, { cache: 'no-cache' })) return;
    }

    const requested = url.pathname === '/' ? '/index.html' : url.pathname;
    const full = safeJoin(PUBLIC_DIR, requested);
    if (full && serveFile(req, res, full, {
      cache: path.extname(full) === '.html' ? 'no-cache' : 'public, max-age=3600',
    })) return;

    // SPA fallback for date/section deep links.
    if (!path.extname(requested)) {
      if (serveFile(req, res, path.join(PUBLIC_DIR, 'index.html'), { cache: 'no-cache' })) return;
    }
    return text(res, 404, 'Not found');
  } catch (error) {
    console.error('[server]', error);
    if (!res.headersSent) return text(res, 500, 'Internal Server Error');
    res.end();
  }
});

function lanAddresses() {
  const out = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) out.push(entry.address);
    }
  }
  return out;
}

function main() {
  ensureDir(EDITIONS_DIR);
  ensureDir(path.join(DATA_DIR, 'media', 'covers'));
  ensureDir(path.join(DATA_DIR, 'cache'));
  ensureDir(path.join(DATA_DIR, 'logs'));
  server.listen(CONFIG.port, CONFIG.host, () => {
    console.log('');
    console.log('  晨间简报 · THE DAILY BRIEF');
    console.log(`  Local:   http://127.0.0.1:${CONFIG.port}`);
    for (const ip of lanAddresses()) console.log(`  LAN:     http://${ip}:${CONFIG.port}`);
    console.log(`  Update:  ${CONFIG.updateHour}:${String(CONFIG.updateMinute).padStart(2, '0')} ${CONFIG.timeZone}`);
    console.log(`  Feeds:   ${SOURCES.length} configured`);
    console.log('');
    startScheduler();
  });
}

process.on('SIGINT', () => {
  console.log('\nShutting down…');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
});
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
});

main();

