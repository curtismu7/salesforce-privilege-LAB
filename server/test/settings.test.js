import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SETTINGS_KEYS, applySettings, readSettings, settingsPath } from '../src/settings.js';

const withFile = (text, fn) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sfpriv-set-'));
  const f = path.join(dir, '.env'); fs.writeFileSync(f, text, { mode: 0o600 });
  try { return fn(f); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
};

test('only this lab\'s own keys are taken from its .env; every other key stays out', () => {
  assert.deepEqual(SETTINGS_KEYS, ['SF_LOGIN_URL', 'SF_CLIENT_ID', 'SF_USERNAME', 'SF_PRIVATE_KEY_PATH', 'SFPRIV_DEFAULT_SOURCE', 'SHELF_URL']);
  withFile('PINGONE_CLIENT_SECRET=hunter2hunter2\nMODE=live\nPORT=9999\nSF_LOGIN_URL=https://acme.example.invalid\nSF_USERNAME=u@x.example\n# a comment\nOTHER_APP_TOKEN="x y"\n', (f) => {
    assert.deepEqual(readSettings(f), { SF_LOGIN_URL: 'https://acme.example.invalid', SF_USERNAME: 'u@x.example' });
    const env = { HOME: '/x' };
    applySettings(env, f);
    assert.deepEqual(Object.keys(env).sort(), ['HOME', 'SF_LOGIN_URL', 'SF_USERNAME']);
  });
});

test('the environment wins over the file; a missing, empty or unreadable file is the defaults', () => {
  withFile('SFPRIV_DEFAULT_SOURCE=real\n', (f) => assert.equal(applySettings({ SFPRIV_DEFAULT_SOURCE: 'mock' }, f).SFPRIV_DEFAULT_SOURCE, 'mock'));
  assert.deepEqual(readSettings('/nonexistent/.env'), {});
  withFile('', (f) => assert.deepEqual(readSettings(f), {}));
  withFile('SF_CLIENT_ID=\n', (f) => assert.deepEqual(readSettings(f), {}));
  assert.deepEqual(readSettings(os.tmpdir()), {}, 'a directory is not a settings file');
});

test('the settings file is the lab\'s own .env beside the compose file (never a shared file in the home directory), overridable with SFPRIV_ENV', () => {
  assert.ok(settingsPath({}).endsWith(`${path.sep}.env`));
  assert.ok(fs.existsSync(path.join(path.dirname(settingsPath({})), 'docker-compose.yml')));
  assert.equal(settingsPath({ SFPRIV_ENV: '/x/y.env' }), '/x/y.env');
  assert.ok(!settingsPath({}).includes(`${path.sep}Documents${path.sep}`));
});
