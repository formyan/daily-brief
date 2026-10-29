import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { CONFIG } from './config.mjs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 DailyBrief/1.0';
const MAX_BYTES = 4 * 1024 * 1024;

let cachedProxy;
let proxySource = '';

function normalizeProxy(value) {
  if (!value) return '';
  let v = String(value).trim();
  if (!v) return '';
  if (!/^[a-z]+:\/\//i.test(v)) v = `http://${v}`;
  try {
    const url = new URL(v);
    if (!url.hostname) return '';
    return url.href.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

/**
 * Find the proxy the operating system is already using. This makes the app
 * work on Windows machines where the browser has a proxy but Node has no
 * HTTPS_PROXY environment variable.
 */
export function detectSystemProxy() {
  if (cachedProxy !== undefined) return cachedProxy;
  const envProxy = normalizeProxy(CONFIG.proxy);
  if (envProxy) {
    cachedProxy = envProxy;
    proxySource = 'environment';
    return cachedProxy;
  }
  if (process.platform !== 'win32') {
    cachedProxy = '';
    proxySource = 'none';
    return cachedProxy;
  }
  try {
    const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
    const out = execFileSync('reg', ['query', key], { encoding: 'utf8', windowsHide: true, timeout: 3000 });
    const enabled = /ProxyEnable\s+REG_DWORD\s+0x1/i.test(out);
    const match = out.match(/ProxyServer\s+REG_SZ\s+([^\r\n]+)/i);
    if (!enabled || !match) {
      cachedProxy = '';
      proxySource = 'none';
      return cachedProxy;
    }
    const raw = match[1].trim();
    let value = raw;
    if (raw.includes('=')) {
      const map = Object.fromEntries(raw.split(';').map((pair) => {
        const i = pair.indexOf('=');
        return i > 0 ? [pair.slice(0, i).trim().toLowerCase(), pair.slice(i + 1).trim()] : [];
      }).filter(Boolean));
      value = map.https || map.http || '';
    }
    if (/^(localhost|127\.0\.0\.1|\[::1\])(?::|$)/i.test(value)) {
      cachedProxy = '';
      proxySource = 'none';
      return cachedProxy;
    }
    cachedProxy = normalizeProxy(value);
    proxySource = cachedProxy ? 'windows' : 'none';
    return cachedProxy;
  } catch {
    cachedProxy = '';
    proxySource = 'none';
    return cachedProxy;
  }
}

export function getProxyInfo() {
  detectSystemProxy();
  return { proxy: cachedProxy || '', source: proxySource };
}

function bypassProxy(hostname) {
  if (!CONFIG.noProxy) return false;
  const rules = CONFIG.noProxy.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const host = hostname.toLowerCase();
  return rules.some((rule) => {
    if (rule === '*') return true;
    const clean = rule.replace(/^\./, '');
    return host === clean || host.endsWith(`.${clean}`);
  });
}

function parseProxy(url) {
  try {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: Number(u.port || (u.protocol === 'https:' ? 443 : 80)),
      auth: u.username ? `Basic ${Buffer.from(`${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`).toString('base64')}` : '',
    };
  } catch {
    return null;
  }
}

function headersFromRaw(rawHead) {
  const lines = rawHead.toString('latin1').split('\r\n');
  const status = Number.parseInt(lines[0]?.match(/^HTTP\/\d(?:\.\d)?\s+(\d{3})/)?.[1] || '0', 10);
  const headers = {};
  for (const line of lines.slice(1)) {
    const idx = line.indexOf(':');
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    headers[key] = headers[key] ? `${headers[key]}, ${value}` : value;
  }
  return { status, headers };
}

function dechunk(buffer) {
  const chunks = [];
  let offset = 0;
  while (offset < buffer.length) {
    const lineEnd = buffer.indexOf('\r\n', offset);
    if (lineEnd < 0) break;
    const sizeLine = buffer.subarray(offset, lineEnd).toString('latin1').split(';')[0].trim();
    const size = Number.parseInt(sizeLine, 16);
    if (!Number.isFinite(size) || size < 0) break;
    offset = lineEnd + 2;
    if (size === 0) break;
    const end = Math.min(offset + size, buffer.length);
    chunks.push(buffer.subarray(offset, end));
    offset = end + 2;
  }
  return Buffer.concat(chunks);
}

function decompress(buffer, encoding) {
  const enc = String(encoding || '').toLowerCase();
  try {
    if (enc.includes('br')) return zlib.brotliDecompressSync(buffer);
    if (enc.includes('gzip')) return zlib.gunzipSync(buffer);
    if (enc.includes('deflate')) return zlib.inflateSync(buffer);
  } catch {
    return buffer;
  }
  return buffer;
}

function decodeResponse(raw) {
  const headerEnd = raw.indexOf('\r\n\r\n');
  if (headerEnd < 0) throw new Error('Malformed HTTP response');
  const { status, headers } = headersFromRaw(raw.subarray(0, headerEnd));
  let body = raw.subarray(headerEnd + 4);
  if (/chunked/i.test(headers['transfer-encoding'] || '')) body = dechunk(body);
  else if (headers['content-length']) {
    const length = Number.parseInt(headers['content-length'], 10);
    if (Number.isFinite(length) && length >= 0 && body.length > length) body = body.subarray(0, length);
  }
  body = decompress(body, headers['content-encoding']);
  return { status, headers, body };
}

function connectTunnel(proxy, host, port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: proxy.host,
      port: proxy.port,
      method: 'CONNECT',
      path: `${host}:${port}`,
      headers: {
        Host: `${host}:${port}`,
        'User-Agent': UA,
        ...(proxy.auth ? { 'Proxy-Authorization': proxy.auth } : {}),
      },
      timeout: timeoutMs,
    });
    req.on('connect', (res, socket, head) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        reject(new Error(`Proxy CONNECT ${res.statusCode}`));
        return;
      }
      if (head?.length) socket.unshift(head);
      const secure = tls.connect({ socket, servername: host }, () => resolve(secure));
      secure.on('error', reject);
      secure.setTimeout(timeoutMs, () => secure.destroy(new Error('TLS timeout')));
    });
    req.on('timeout', () => req.destroy(new Error('Proxy connect timeout')));
    req.on('error', reject);
    req.end();
  });
}

function requestThroughProxy(proxy, url, options = {}) {
  const host = url.hostname;
  const port = Number(url.port || 443);
  return new Promise((resolve, reject) => {
    connectTunnel(proxy, host, port, options.timeoutMs || 12000).then((socket) => {
      let settled = false;
      const finish = (err, value) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (err) reject(err); else resolve(value);
      };
      socket.on('error', (err) => finish(err));
      socket.on('close', () => {
        if (!settled) finish(new Error('Connection closed before response completed'));
      });
      socket.on('data', (chunk) => {
        chunks.push(chunk);
        total += chunk.length;
        if (total > MAX_BYTES) finish(new Error('Response too large'));
      });
      const chunks = [];
      let total = 0;
      socket.on('end', () => {
        try {
          finish(null, decodeResponse(Buffer.concat(chunks)));
        } catch (err) {
          finish(err);
        }
      });
      const path = `${url.pathname}${url.search}`;
      const body = options.body
        ? (Buffer.isBuffer(options.body) ? options.body : Buffer.from(String(options.body)))
        : null;
      const headers = {
        Host: url.host,
        'User-Agent': UA,
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html, application/json, */*',
        'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        Connection: 'close',
        ...(body ? { 'Content-Length': body.length } : {}),
        ...options.headers,
      };
      const headerLines = Object.entries(headers)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\r\n');
      socket.write(`${options.method || 'GET'} ${path} HTTP/1.1\r\n${headerLines}\r\n\r\n`);
      if (body) socket.write(body);
    }).catch(reject);
  });
}

function requestDirect(url, options = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'http:' ? http : https;
    const req = lib.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || (url.protocol === 'http:' ? 80 : 443),
      path: `${url.pathname}${url.search}`,
      method: options.method || 'GET',
      headers: {
        Host: url.host,
        'User-Agent': UA,
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html, application/json, */*',
        'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        Connection: 'close',
        ...options.headers,
      },
      timeout: options.timeoutMs || 12000,
    }, (res) => {
      const chunks = [];
      let total = 0;
      res.on('data', (chunk) => {
        total += chunk.length;
        if (total > MAX_BYTES) {
          req.destroy(new Error('Response too large'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode || 0,
          headers: res.headers,
          body: decompress(Buffer.concat(chunks), res.headers['content-encoding']),
        });
      });
    });
    req.on('timeout', () => req.destroy(new Error('Request timeout')));
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

/**
 * Fetch a URL with optional system-proxy support and manual redirects.
 * Returns { status, headers, body, url }.
 */
export async function fetchBuffer(input, options = {}) {
  const timeoutMs = options.timeoutMs || CONFIG.fetchTimeoutMs;
  const maxRedirects = options.maxRedirects ?? 4;
  let url;
  try {
    url = input instanceof URL ? input : new URL(String(input));
  } catch {
    throw new Error(`Invalid URL: ${input}`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP(S) is supported');

  const proxyValue = options.proxy === false ? '' : (options.proxy || detectSystemProxy());
  const proxy = proxyValue && !bypassProxy(url.hostname) ? parseProxy(proxyValue) : null;

  let response;
  let proxyError;
  if (proxy) {
    try {
      response = await requestThroughProxy(proxy, url, { ...options, timeoutMs });
    } catch (error) {
      proxyError = error;
      if (options.allowDirect === false) throw error;
    }
  }
  if (!response) {
    try {
      response = await requestDirect(url, { ...options, timeoutMs });
    } catch (error) {
      if (proxyError) throw new Error(`Proxy failed (${proxyError.message}); direct failed (${error.message})`);
      throw error;
    }
  }

  if (response.status >= 300 && response.status < 400 && response.headers.location && maxRedirects > 0) {
    const next = new URL(response.headers.location, url);
    return fetchBuffer(next, { ...options, maxRedirects: maxRedirects - 1, proxy: proxyValue });
  }
  return { ...response, url: url.href, proxied: Boolean(proxy) };
}

function detectCharset(buffer, contentType = '') {
  const head = buffer.subarray(0, 2048).toString('latin1').toLowerCase();
  const headerMatch = String(contentType).match(/charset=["']?([\w-]+)/i);
  const metaMatch = head.match(/<meta[^>]+charset=["']?([\w-]+)/i) || head.match(/encoding=["']([\w-]+)["']/i);
  const raw = (headerMatch?.[1] || metaMatch?.[1] || 'utf-8').toLowerCase();
  if (raw === 'gb2312' || raw === 'gbk') return 'gb18030';
  if (raw === 'iso-8859-1' || raw === 'latin1') return 'windows-1252';
  return raw;
}

export function fetchText(input, options = {}) {
  return fetchBuffer(input, options).then((res) => {
    const charset = detectCharset(res.body, res.headers['content-type']);
    let text;
    try {
      text = new TextDecoder(charset).decode(res.body);
    } catch {
      text = res.body.toString('utf8');
    }
    return { ...res, text };
  });
}

export async function checkUrl(input, timeoutMs = 5000) {
  try {
    const res = await fetchBuffer(input, { timeoutMs, maxRedirects: 1 });
    return { ok: res.status >= 200 && res.status < 400, status: res.status, proxied: res.proxied };
  } catch (error) {
    return { ok: false, status: 0, error: error.message };
  }
}
