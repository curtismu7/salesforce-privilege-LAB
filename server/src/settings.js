// The lab's own settings file: `.env` beside docker-compose.yml (owner rule 2026-11-09; mode 600, git-ignored; `.env.example` lists the names only).
// SFPRIV_ENV overrides the path. Parsed with util.parseEnv. Only the keys listed below are ever taken; nothing else from the file enters the server's
// environment, no value is printed, and the lab never writes the file. The private key itself is NOT in this file: SF_PRIVATE_KEY_PATH names a file.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

export const SETTINGS_KEYS = ['SF_LOGIN_URL', 'SF_CLIENT_ID', 'SF_USERNAME', 'SF_PRIVATE_KEY_PATH', 'SFPRIV_DEFAULT_SOURCE', 'SHELF_URL'];
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const settingsPath = (env = process.env) => env.SFPRIV_ENV || path.join(ROOT, '.env');

export function readSettings(file) {
  try {
    const parsed = parseEnv(fs.readFileSync(file, 'utf8'));
    return Object.fromEntries(SETTINGS_KEYS.filter((k) => typeof parsed[k] === 'string' && parsed[k] !== '').map((k) => [k, parsed[k]]));
  } catch { return {}; } // no file, or not readable: the defaults
}

// Fills only the listed keys, and only when the environment does not already set them.
export function applySettings(env = process.env, file = settingsPath(env)) {
  for (const [k, v] of Object.entries(readSettings(file))) if (env[k] === undefined) env[k] = v;
  return env;
}
