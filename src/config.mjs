import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PUBLIC_DIR = path.join(ROOT, 'public');
export const DATA_DIR = path.join(ROOT, 'data');
export const EDITIONS_DIR = path.join(DATA_DIR, 'editions');
export const MEDIA_DIR = path.join(DATA_DIR, 'media');
export const CACHE_DIR = path.join(DATA_DIR, 'cache');
export const LOGS_DIR = path.join(DATA_DIR, 'logs');

const int = (value, fallback) => {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
};

export const CONFIG = {
  port: int(process.env.PORT, 4173),
  host: process.env.HOST || '0.0.0.0',
  updateHour: int(process.env.UPDATE_HOUR, 18),
  updateMinute: int(process.env.UPDATE_MINUTE, 30),
  timeZone: process.env.TZ_NAME || 'Asia/Shanghai',
  fetchTimeoutMs: int(process.env.FETCH_TIMEOUT_MS, 12000),
  fetchConcurrency: int(process.env.FETCH_CONCURRENCY, 10),
  windowHours: int(process.env.WINDOW_HOURS, 36),
  maxStories: int(process.env.MAX_STORIES, 32),
  minSources: int(process.env.MIN_SOURCES, 4),
  translate: process.env.TRANSLATE !== '0',
  translationConcurrency: int(process.env.TRANSLATION_CONCURRENCY, 3),
  translationLimit: int(process.env.TRANSLATION_LIMIT, 90),
  llmProvider: (process.env.LLM_PROVIDER || 'auto').toLowerCase(),
  llmBaseUrl: (process.env.LLM_BASE_URL || '').replace(/\/+$/, ''),
  llmApiKey: process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY || '',
  llmModel: process.env.LLM_MODEL || '',
  llmTimeoutMs: int(process.env.LLM_TIMEOUT_MS, 180000),
  llmMaxStories: int(process.env.LLM_MAX_STORIES, 24),
  llmBatchSize: int(process.env.LLM_BATCH_SIZE, 5),
  llmTemperature: Number.parseFloat(process.env.LLM_TEMPERATURE || '0.2'),
  imageLookup: process.env.IMAGE_LOOKUP !== '0',
  imageLookupMax: int(process.env.IMAGE_LOOKUP_MAX, 24),
  imageLookupConcurrency: int(process.env.IMAGE_LOOKUP_CONCURRENCY, 3),
  imageLookupTimeoutMs: int(process.env.IMAGE_LOOKUP_TIMEOUT_MS, 12000),
  imageProvider: (process.env.IMAGE_PROVIDER || 'auto').toLowerCase(),
  comfyUrl: (process.env.COMFYUI_URL || 'http://127.0.0.1:8188').replace(/\/+$/, ''),
  comfyCheckpoint: process.env.COMFYUI_CHECKPOINT || 'RealVisXL_V5.0_fp16.safetensors',
  comfySteps: int(process.env.COMFYUI_STEPS, 26),
  comfyTimeoutMs: int(process.env.COMFYUI_TIMEOUT_MS, 240000),
  proxy: process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || '',
  noProxy: process.env.NO_PROXY || process.env.no_proxy || '',
  adminToken: process.env.ADMIN_TOKEN || '',
  refreshOnStart: process.env.REFRESH_ON_START !== '0',
};

export const UPDATE_LABEL = `${String(CONFIG.updateHour).padStart(2, '0')}:${String(CONFIG.updateMinute).padStart(2, '0')}`;
