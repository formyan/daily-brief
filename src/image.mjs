import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG, MEDIA_DIR } from './config.mjs';
import { ensureDir, writeJsonAtomic } from './util.mjs';

const COVER_DIR = path.join(MEDIA_DIR, 'covers');

function hashInt(input) {
  const hex = crypto.createHash('sha1').update(String(input)).digest('hex').slice(0, 8);
  return Number.parseInt(hex, 16);
}

function esc(input = '') {
  return String(input).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Deterministic editorial cover. Used when no local diffusion server is
 * available, or while a generated cover is still rendering.
 */
export function makeProceduralCover({ date, topics = [] }) {
  const seed = hashInt(`${date}|${topics.join('|')}`);
  const w = 1600;
  const h = 900;
  const sunX = 1170 + (seed % 120);
  const sunY = 245 + (seed % 70);
  const globeX = 690 + (seed % 70);
  const globeY = 350;
  const globeR = 305;
  const horizon = 610;
  const rand = (n) => {
    let x = seed + n * 2654435761;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return (Math.abs(x) % 10000) / 10000;
  };

  // Graticule 鈥?abstract, not a political map.
  const latitudes = [];
  for (let i = -3; i <= 3; i += 1) {
    const ry = Math.abs(i) * 62 + 18;
    latitudes.push(`<ellipse cx="${globeX}" cy="${globeY + i * 74}" rx="${globeR}" ry="${ry}" fill="none" stroke="#f6e7cf" stroke-opacity="${(0.30 - Math.abs(i) * 0.025).toFixed(3)}" stroke-width="1"/>`);
  }
  const longitudes = [];
  for (let i = -2; i <= 2; i += 1) {
    const rx = Math.abs(i) * 110 + 16;
    longitudes.push(`<ellipse cx="${globeX}" cy="${globeY}" rx="${rx}" ry="${globeR}" fill="none" stroke="#f6e7cf" stroke-opacity="${(0.26 - Math.abs(i) * 0.022).toFixed(3)}" stroke-width="1"/>`);
  }

  const nodes = [];
  const arcs = [];
  const nodePoints = [];
  for (let i = 0; i < 28; i += 1) {
    const angle = rand(i) * Math.PI * 2;
    const radius = globeR * (0.28 + rand(i + 40) * 0.68);
    const x = globeX + Math.cos(angle) * radius;
    const y = globeY + Math.sin(angle) * radius * 0.92;
    nodePoints.push({ x, y });
    nodes.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(1.8 + rand(i + 80) * 3.2).toFixed(1)}" fill="#f8dcb2" fill-opacity="${(0.65 + rand(i + 90) * 0.35).toFixed(2)}"/>`);
    if (i > 0 && i % 2 === 0) {
      const prev = nodePoints[i - 1];
      const midX = (x + prev.x) / 2;
      const midY = (y + prev.y) / 2 - 40 - rand(i + 5) * 60;
      arcs.push(`<path d="M ${prev.x.toFixed(1)} ${prev.y.toFixed(1)} Q ${midX.toFixed(1)} ${midY.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}" fill="none" stroke="#f6d9b0" stroke-opacity="${(0.24 + rand(i + 7) * 0.18).toFixed(2)}" stroke-width="0.9"/>`);
    }
  }
  // Long editorial arcs from the globe toward the horizon.
  for (let i = 0; i < 5; i += 1) {
    const start = nodePoints[(i * 5 + 3) % nodePoints.length];
    const endX = 1180 + rand(i + 10) * 260;
    const endY = 620 + rand(i + 12) * 150;
    arcs.push(`<path d="M ${start.x.toFixed(1)} ${start.y.toFixed(1)} Q ${(start.x + 380).toFixed(1)} ${(start.y - 180).toFixed(1)} ${endX.toFixed(1)} ${endY.toFixed(1)}" fill="none" stroke="#f4d2a6" stroke-opacity="0.28" stroke-width="1.1" stroke-dasharray="2 6"/>`);
  }

  const contours = [];
  for (let layer = 0; layer < 6; layer += 1) {
    const points = [];
    for (let x = -80; x <= w + 80; x += 22) {
      const t = x / w;
      const y = horizon + layer * 34
        + Math.sin(t * Math.PI * (1.1 + layer * 0.2) + seed / 600 + layer) * (14 + layer * 3)
        + Math.sin(t * 21 + layer * 2.1) * 4;
      points.push(`${x},${y.toFixed(1)}`);
    }
    contours.push(`<polyline points="${points.join(' ')}" fill="none" stroke="#f4e4cd" stroke-opacity="${(0.24 - layer * 0.025).toFixed(3)}" stroke-width="0.9"/>`);
  }

  const stars = [];
  for (let i = 0; i < 55; i += 1) {
    const x = 60 + rand(i + 200) * (w - 120);
    const y = 50 + rand(i + 300) * 500;
    if (Math.hypot(x - globeX, y - globeY) < globeR * 0.95) continue;
    stars.push(`<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(0.6 + rand(i + 400) * 1.4).toFixed(1)}" fill="#f8e8cf" fill-opacity="${(0.16 + rand(i + 500) * 0.4).toFixed(2)}"/>`);
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#06131b"/>
      <stop offset="0.46" stop-color="#0d2931"/>
      <stop offset="0.78" stop-color="#7f4537"/>
      <stop offset="1" stop-color="#d87846"/>
    </linearGradient>
    <radialGradient id="glow" cx="${(sunX / w).toFixed(3)}" cy="${(sunY / h).toFixed(3)}" r="0.52">
      <stop offset="0" stop-color="#ffe2b4" stop-opacity="0.98"/>
      <stop offset="0.2" stop-color="#f2a45e" stop-opacity="0.55"/>
      <stop offset="0.55" stop-color="#d97742" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#d97742" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#f8d8ad" stop-opacity="0.04"/>
      <stop offset="0.66" stop-color="#f8d8ad" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#ffd095" stop-opacity="0.7"/>
    </linearGradient>
    <radialGradient id="vignette" cx="0.5" cy="0.42" r="0.78">
      <stop offset="0.48" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#02070a" stop-opacity="0.66"/>
    </radialGradient>
    <clipPath id="globe"><circle cx="${globeX}" cy="${globeY}" r="${globeR}"/></clipPath>
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer><feFuncA type="table" tableValues="0 0.065"/></feComponentTransfer>
    </filter>
    <filter id="blur"><feGaussianBlur stdDeviation="8"/></filter>
    <filter id="soft"><feGaussianBlur stdDeviation="2"/></filter>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <circle cx="${sunX}" cy="${sunY}" r="270" fill="url(#glow)" filter="url(#blur)"/>
  <circle cx="${sunX}" cy="${sunY}" r="104" fill="#f8d19b" fill-opacity="0.9"/>
  <circle cx="${sunX}" cy="${sunY}" r="104" fill="none" stroke="#ffe7c4" stroke-opacity="0.35" stroke-width="1"/>
  <circle cx="${sunX}" cy="${sunY}" r="142" fill="none" stroke="#f7c98f" stroke-opacity="0.14" stroke-width="1"/>
  <g>${stars.join('')}</g>
  <g clip-path="url(#globe)">
    <circle cx="${globeX}" cy="${globeY}" r="${globeR}" fill="#07161e" fill-opacity="0.56"/>
    <circle cx="${globeX}" cy="${globeY}" r="${globeR}" fill="url(#glow)" opacity="0.18"/>
    <g>${latitudes.join('')}</g>
    <g>${longitudes.join('')}</g>
    <g>${arcs.join('')}</g>
    <g>${nodes.join('')}</g>
  </g>
  <circle cx="${globeX}" cy="${globeY}" r="${globeR}" fill="none" stroke="url(#rim)" stroke-width="1.6"/>
  <path d="M ${globeX - globeR} ${globeY + 250} C ${globeX - 150} ${globeY + 160}, ${globeX + 130} ${globeY + 330}, ${globeX + globeR + 120} ${globeY + 180}" fill="none" stroke="#f5c48c" stroke-opacity="0.2" stroke-width="1.2"/>
  <g>${contours.join('')}</g>
  <path d="M 0 ${horizon + 150} C 260 ${horizon + 90}, 470 ${horizon + 220}, 720 ${horizon + 150} S 1210 ${horizon + 110}, ${w} ${horizon + 190} L ${w} ${h} L 0 ${h} Z" fill="#050e14" fill-opacity="0.66"/>
  <path d="M 0 ${horizon + 185} C 300 ${horizon + 135}, 540 ${horizon + 245}, 790 ${horizon + 185} S 1250 ${horizon + 150}, ${w} ${horizon + 220}" fill="none" stroke="#e59a62" stroke-opacity="0.26" stroke-width="1.4"/>
  <rect width="${w}" height="${h}" fill="url(#vignette)"/>
  <rect width="${w}" height="${h}" filter="url(#grain)" opacity="0.5"/>
</svg>`;
  return svg;
}

export function proceduralCoverPath(date, topics = []) {
  ensureDir(COVER_DIR);
  const file = path.join(COVER_DIR, `${date}.svg`);
  fs.writeFileSync(file, makeProceduralCover({ date, topics }), 'utf8');
  return `/media/covers/${date}.svg`;
}

async function comfy(pathname, options = {}) {
  const url = `${CONFIG.comfyUrl}${pathname}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 15000);
  try {
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`ComfyUI ${pathname} HTTP ${res.status}`);
    const type = res.headers.get('content-type') || '';
    if (type.includes('application/json')) return await res.json();
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

export async function comfyAvailable() {
  try {
    const data = await comfy('/system_stats', { timeoutMs: 2500 });
    return Boolean(data?.system);
  } catch {
    return false;
  }
}

function buildPrompt(topics = [], heroTitle = '') {
  const subject = [...topics.slice(0, 4), heroTitle].filter(Boolean).join(', ');
  return [
    'a serious editorial magazine cover illustration for an international daily news briefing',
    'abstract geopolitical world map formed by fine luminous lines and interconnected nodes',
    'deep ink blue night on the left transitioning to a warm amber dawn horizon',
    'subtle paper grain, elegant negative space, sophisticated art direction',
    'muted teal and vermilion accents, cinematic wide composition',
    'no text, no letters, no words, no logos, no flags, no faces',
    subject ? `themes: ${subject}` : '',
  ].filter(Boolean).join(', ');
}

export async function generateComfyCover({ date, topics = [], heroTitle = '', outputFile, force = false }) {
  ensureDir(COVER_DIR);
  const target = outputFile || path.join(COVER_DIR, `${date}.png`);
  if (!force && fs.existsSync(target) && fs.statSync(target).size > 20_000) {
    const stat = fs.statSync(target);
    const ageHours = (Date.now() - stat.mtimeMs) / 36e5;
    if (ageHours < 36) return `/media/covers/${path.basename(target)}`;
  }
  if (!(await comfyAvailable())) return null;

  const seed = hashInt(date) % 2147483647;
  const prompt = buildPrompt(topics, heroTitle);
  const negative = 'text, letters, words, typography, watermark, logo, signature, frame, border, low quality, blurry, oversaturated, cartoon, anime, people, faces, hands, flags, maps with country labels';
  const workflow = {
    1: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: CONFIG.comfyCheckpoint } },
    2: { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['1', 1] } },
    3: { class_type: 'CLIPTextEncode', inputs: { text: negative, clip: ['1', 1] } },
    4: { class_type: 'EmptyLatentImage', inputs: { width: 1344, height: 768, batch_size: 1 } },
    5: {
      class_type: 'KSampler',
      inputs: {
        seed, steps: CONFIG.comfySteps, cfg: 5.8, sampler_name: 'dpmpp_2m', scheduler: 'karras',
        denoise: 1.0, model: ['1', 0], positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 0],
      },
    },
    6: { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
    7: { class_type: 'SaveImage', inputs: { images: ['6', 0], filename_prefix: `daily-brief-${date}` } },
  };

  try {
    const queued = await comfy('/prompt', { method: 'POST', body: { prompt: workflow }, timeoutMs: 20000 });
    const promptId = queued?.prompt_id;
    if (!promptId) return null;
    const started = Date.now();
    while (Date.now() - started < CONFIG.comfyTimeoutMs) {
      await new Promise((resolve) => { setTimeout(resolve, 2500); });
      const history = await comfy(`/history/${encodeURIComponent(promptId)}`, { timeoutMs: 15000 });
      const entry = history?.[promptId];
      if (!entry) continue;
      if (entry.status?.status_str === 'error') return null;
      const images = Object.values(entry.outputs || {}).flatMap((node) => node.images || []);
      if (!images.length) continue;
      const image = images[0];
      const query = new URLSearchParams({
        filename: image.filename,
        subfolder: image.subfolder || '',
        type: image.type || 'output',
      });
      const buffer = await comfy(`/view?${query.toString()}`, { timeoutMs: 60000 });
      if (!Buffer.isBuffer(buffer) || buffer.length < 10_000) return null;
      fs.writeFileSync(target, buffer);
      return `/media/covers/${path.basename(target)}`;
    }
  } catch (error) {
    console.warn('[image] ComfyUI generation failed:', error.message);
  }
  return null;
}

export async function makeCover({ date, topics = [], heroTitle = '', provider = CONFIG.imageProvider }) {
  ensureDir(COVER_DIR);
  const pngPath = path.join(COVER_DIR, `${date}.png`);
  const jpgPath = path.join(COVER_DIR, `${date}.jpg`);
  if (provider !== 'svg' && provider !== 'none') {
    if (fs.existsSync(jpgPath) && fs.statSync(jpgPath).size > 20_000) {
      return { path: `/media/covers/${date}.jpg`, provider: 'comfyui', cached: true };
    }
    if (fs.existsSync(pngPath) && fs.statSync(pngPath).size > 20_000) {
      return { path: `/media/covers/${date}.png`, provider: 'comfyui', cached: true };
    }
    const generated = await generateComfyCover({ date, topics, heroTitle });
    if (generated) return { path: generated, provider: 'comfyui', cached: false };
  }
  return { path: proceduralCoverPath(date, topics), provider: 'procedural', cached: false };
}

export function coverMetaPath(date) {
  return path.join(COVER_DIR, `${date}.json`);
}

export function saveCoverMeta(date, meta) {
  ensureDir(COVER_DIR);
  writeJsonAtomic(coverMetaPath(date), meta);
}

