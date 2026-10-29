import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './util.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv(ROOT);
