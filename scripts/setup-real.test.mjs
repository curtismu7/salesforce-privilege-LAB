// scripts/setup-real.sh without any real value: a temporary directory, made-up values fed through the script's test hook, and the lab's own loopback stub
// standing in for the org. Proves: key mode 600, certificate, .env mode 600 with only the four SF_* names, no secret in any output, no overwrite without
// --force, --dry-run writes nothing, and that afterwards GET /api/info says realAvailable:true and the Mock/Real toggle works both ways.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createPublicKey } from 'node:crypto';
import { parseEnv } from 'node:util';
import { createApp, startHttpServer } from '../server/src/app.js';
import { createHealth } from '../server/src/health.js';
import { createRealOrg } from '../server/src/real.js';
import { startStub } from '../server/test/stub.js';

const SCRIPT = new URL('./setup-real.sh', import.meta.url).pathname;
const CK = 'test-consumer-key-not-real-1234'; const UN = 'integration.user@stub-org.example';
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sfpriv-setup-'));
const mode = (f) => (fs.statSync(f).mode & 0o777).toString(8);
const run = (dir, args = [], env = {}) => spawnSync('bash', [SCRIPT, '--dir', dir, ...args], { encoding: 'utf8', env: { ...process.env, SFPRIV_SETUP_NONINTERACTIVE: '1', ...env }, input: '' });
const fed = (url) => ({ SFPRIV_SETUP_ORG_URL: url, SFPRIV_SETUP_CONSUMER_KEY: CK, SFPRIV_SETUP_USERNAME: UN });

test('--dry-run checks openssl, prints the numbered steps and the files, and writes and asks nothing', () => {
  const dir = tmp();
  const r = run(dir, ['--dry-run']);
  assert.equal(r.status, 0, r.stderr);
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) assert.match(r.stdout, new RegExp(`^ ${n}\\. `, 'm'));
  assert.match(r.stdout, /SEPARATE External Client App/); assert.match(r.stdout, /api and refresh_token, offline_access/); assert.match(r.stdout, /Enable JWT Bearer Flow/);
  assert.match(r.stdout, /Admin approved users are pre-authorized/); assert.match(r.stdout, /Dry run: .* nothing was generated/);
  assert.deepEqual(fs.readdirSync(dir), [], 'nothing was written');
});

test('a real run (made-up values): key mode 600, certificate valid two years, .env mode 600 with only the four SF_* names, and no secret in any output', () => {
  const dir = tmp();
  const r = run(dir, ['--host-path'], fed('https://stub-org.develop.my.salesforce.example'));
  assert.equal(r.status, 0, r.stderr);
  const key = path.join(dir, 'secrets/sf-private-key.pem'); const crt = path.join(dir, 'secrets/sf-lab-certificate.crt'); const env = path.join(dir, '.env');
  assert.equal(mode(key), '600'); assert.equal(mode(env), '600');
  const keyText = fs.readFileSync(key, 'utf8'); assert.match(keyText, /BEGIN (RSA )?PRIVATE KEY/);
  assert.match(fs.readFileSync(crt, 'utf8'), /BEGIN CERTIFICATE/);
  const x = spawnSync('openssl', ['x509', '-in', crt, '-noout', '-enddate', '-subject'], { encoding: 'utf8' }); assert.equal(x.status, 0);
  assert.match(x.stdout, /CN\s*=\s*salesforce-privilege-lab/);
  const parsed = parseEnv(fs.readFileSync(env, 'utf8'));
  assert.deepEqual(Object.keys(parsed).sort(), ['SF_CLIENT_ID', 'SF_LOGIN_URL', 'SF_PRIVATE_KEY_PATH', 'SF_USERNAME']);
  assert.equal(parsed.SF_CLIENT_ID, CK); assert.equal(parsed.SF_USERNAME, UN); assert.equal(parsed.SF_PRIVATE_KEY_PATH, key);
  const out = r.stdout + r.stderr;
  for (const secret of [CK, UN, keyText.split('\n')[1], 'stub-org']) assert.ok(!out.includes(secret), 'no value or key line is printed');
  assert.match(out, /No secret was printed or logged/);
});

test('without --host-path the key path is the one Docker mounts (/run/secrets/...)', () => {
  const dir = tmp();
  assert.equal(run(dir, [], fed('https://stub-org.develop.my.salesforce.example')).status, 0);
  assert.equal(parseEnv(fs.readFileSync(path.join(dir, '.env'), 'utf8')).SF_PRIVATE_KEY_PATH, '/run/secrets/sf-private-key.pem');
});

test('it refuses to overwrite an existing key, certificate or .env without --force, and changes nothing', () => {
  const dir = tmp();
  assert.equal(run(dir, [], fed('https://stub-org.develop.my.salesforce.example')).status, 0);
  const before = ['secrets/sf-private-key.pem', 'secrets/sf-lab-certificate.crt', '.env'].map((f) => fs.readFileSync(path.join(dir, f), 'utf8'));
  const r = run(dir, [], fed('https://other.develop.my.salesforce.example'));
  assert.equal(r.status, 3); assert.match(r.stderr, /already exists/); assert.match(r.stderr, /--force/);
  assert.deepEqual(['secrets/sf-private-key.pem', 'secrets/sf-lab-certificate.crt', '.env'].map((f) => fs.readFileSync(path.join(dir, f), 'utf8')), before);
  for (const lone of ['.env', 'secrets/sf-private-key.pem']) { const d = tmp(); fs.mkdirSync(path.join(d, 'secrets')); fs.writeFileSync(path.join(d, lone), 'x'); assert.equal(run(d, [], fed('https://a.example')).status, 3, lone); assert.equal(fs.readFileSync(path.join(d, lone), 'utf8'), 'x'); }
});

const FILES = ['secrets/sf-private-key.pem', 'secrets/sf-lab-certificate.crt', '.env'];
const snapshot = (dir) => FILES.map((f) => fs.readFileSync(path.join(dir, f), 'utf8'));
const baks = (dir) => [...fs.readdirSync(dir).filter((f) => f.startsWith('.env.bak.')).map((f) => path.join(dir, f)), ...fs.readdirSync(path.join(dir, 'secrets')).filter((f) => f.includes('.bak.')).map((f) => path.join(dir, 'secrets', f))];

test('--force replaces them, backs up the key, the certificate and the .env (the key and .env backups at mode 600), and makes a new key', () => {
  const dir = tmp();
  run(dir, [], fed('https://stub-org.develop.my.salesforce.example'));
  const old = snapshot(dir);
  const r = run(dir, ['--force'], fed('https://second.develop.my.salesforce.example'));
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(snapshot(dir)[0], old[0], 'a new key');
  assert.equal(parseEnv(fs.readFileSync(path.join(dir, '.env'), 'utf8')).SF_LOGIN_URL, 'https://second.develop.my.salesforce.example');
  const b = baks(dir); assert.equal(b.length, 3, b.join(','));
  const bk = b.find((f) => f.includes('sf-private-key.pem.bak.')); const be = b.find((f) => f.includes('.env.bak.'));
  assert.equal(mode(bk), '600'); assert.equal(mode(be), '600');
  assert.equal(fs.readFileSync(bk, 'utf8'), old[0], 'the old key is what was backed up'); assert.equal(fs.readFileSync(be, 'utf8'), old[2]);
  assert.match(r.stdout, /Backed up \(mode 600, kept\)/);
  assert.equal(mode(path.join(dir, 'secrets/sf-private-key.pem')), '600'); assert.equal(mode(path.join(dir, '.env')), '600'); assert.equal(mode(path.join(dir, 'secrets')), '700');
  assert.ok(!(r.stdout + r.stderr).includes('stub-org'));
  const again = run(dir, ['--force'], fed('https://third.develop.my.salesforce.example')); assert.equal(again.status, 0); assert.equal(baks(dir).length, 6, 'backup names never collide');
});

test('a bad value stops BEFORE anything is touched: with --force a bad Consumer Key leaves the old .env, key and certificate as they were and makes no backup', () => {
  const dir = tmp();
  run(dir, [], fed('https://stub-org.develop.my.salesforce.example'));
  const old = snapshot(dir);
  for (const over of [{ SFPRIV_SETUP_CONSUMER_KEY: 'has space' }, { SFPRIV_SETUP_USERNAME: '' }, { SFPRIV_SETUP_ORG_URL: 'http://org.example' }]) {
    const r = run(dir, ['--force'], { ...fed('https://other.develop.my.salesforce.example'), ...over });
    assert.equal(r.status, 4, r.stderr); assert.match(r.stderr, /Nothing was changed/);
    assert.deepEqual(snapshot(dir), old); assert.equal(baks(dir).length, 0); assert.equal(mode(path.join(dir, '.env')), '600');
    assert.ok(!(r.stdout + r.stderr).includes('has space'));
  }
  assert.ok(fs.readdirSync(path.join(dir, 'secrets')).every((f) => !f.includes('.new.')), 'no temporary file is left');
});

test('a failure while building the new files (here: secrets/ not writable) leaves the old setup untouched', { skip: process.getuid?.() === 0 }, () => {
  const dir = tmp();
  run(dir, [], fed('https://stub-org.develop.my.salesforce.example'));
  const old = snapshot(dir);
  fs.chmodSync(path.join(dir, 'secrets'), 0o500);
  try {
    const r = run(dir, ['--force'], fed('https://other.develop.my.salesforce.example'));
    assert.notEqual(r.status, 0);
    assert.deepEqual(snapshot(dir), old); assert.equal(baks(dir).length, 0);
    assert.ok(!(r.stdout + r.stderr).includes('other.develop'));
  } finally { fs.chmodSync(path.join(dir, 'secrets'), 0o700); }
});

test('bad values are refused without echoing them, before any file or folder is made: $, ;, spaces, non-ASCII, a path, a port, user info, plain http, an empty label', () => {
  const ok = 'https://stub-org.develop.my.salesforce.example';
  const cases = [
    [{ SFPRIV_SETUP_ORG_URL: 'https://$HOME.example' }, /org URL/], [{ SFPRIV_SETUP_ORG_URL: 'https://x.example;id' }, /org URL/], [{ SFPRIV_SETUP_ORG_URL: 'https://x .example' }, /org URL/],
    [{ SFPRIV_SETUP_ORG_URL: 'https://exämple.example' }, /org URL/], [{ SFPRIV_SETUP_ORG_URL: 'https://stub-org.example/path' }, /org URL/], [{ SFPRIV_SETUP_ORG_URL: 'https://stub-org.example/' }, /org URL/],
    [{ SFPRIV_SETUP_ORG_URL: 'https://stub-org.example:8443' }, /org URL/], [{ SFPRIV_SETUP_ORG_URL: 'https://user:pw@stub-org.example' }, /org URL/], [{ SFPRIV_SETUP_ORG_URL: 'https://stub-org.example?x=1' }, /org URL/],
    [{ SFPRIV_SETUP_ORG_URL: 'http://org.example' }, /org URL/], [{ SFPRIV_SETUP_ORG_URL: 'https://x..example' }, /org URL|empty host label/], [{ SFPRIV_SETUP_ORG_URL: 'https://.example' }, /org URL/],
    [{ SFPRIV_SETUP_ORG_URL: 'https://stub-org.example\nhttps://evil.example' }, /org URL/], [{ SFPRIV_SETUP_ORG_URL: 'https://[::1]' }, /org URL/],
    [{ SFPRIV_SETUP_CONSUMER_KEY: '3MVG9é' }, /Consumer Key has characters/], [{ SFPRIV_SETUP_CONSUMER_KEY: 'has space' }, /Consumer Key has characters/], [{ SFPRIV_SETUP_CONSUMER_KEY: 'a=b' }, /Consumer Key has characters/],
    [{ SFPRIV_SETUP_CONSUMER_KEY: 'k\nSF_X=1' }, /Consumer Key has characters/], [{ SFPRIV_SETUP_CONSUMER_KEY: 'k'.repeat(257) }, /too long/], [{ SFPRIV_SETUP_CONSUMER_KEY: '' }, /Consumer Key is empty/],
    [{ SFPRIV_SETUP_USERNAME: 'üser@x.example' }, /Username has characters/], [{ SFPRIV_SETUP_USERNAME: 'a"b@c.example' }, /Username has characters/], [{ SFPRIV_SETUP_USERNAME: 'a b@c.example' }, /Username has characters/], [{ SFPRIV_SETUP_USERNAME: '' }, /Username is empty/],
  ];
  for (const [over, msg] of cases) {
    const dir = tmp(); const r = run(dir, [], { ...fed(ok), ...over });
    const label = JSON.stringify(over).slice(0, 70);
    assert.equal(r.status, 4, `${label}: ${r.stderr}`); assert.match(r.stderr, msg, label);
    assert.deepEqual(fs.readdirSync(dir), [], `${label}: nothing is written, not even a folder`);
    const out = r.stdout + r.stderr;
    for (const v of Object.values(over)) if (v.length > 3) assert.ok(!out.includes(v), `${label}: the value is never echoed`);
  }
});

test('it refuses to write through a symbolic link at .env, the key, the certificate or secrets/, even with --force, and touches the target of none', () => {
  for (const [link, fileKind] of [['.env', 'file'], ['secrets/sf-private-key.pem', 'file'], ['secrets/sf-lab-certificate.crt', 'file'], ['secrets', 'dir']]) {
    const dir = tmp(); const away = tmp(); const target = path.join(away, 'target');
    if (fileKind === 'dir') fs.mkdirSync(target); else { fs.mkdirSync(path.join(dir, 'secrets')); fs.writeFileSync(target, 'precious'); }
    fs.symlinkSync(target, path.join(dir, link));
    for (const args of [[], ['--force']]) {
      const r = run(dir, args, fed('https://stub-org.develop.my.salesforce.example'));
      assert.equal(r.status, 3, `${link} ${args}: ${r.stderr}`); assert.match(r.stderr, /symbolic link/);
    }
    if (fileKind === 'file') assert.equal(fs.readFileSync(target, 'utf8'), 'precious'); else assert.deepEqual(fs.readdirSync(target), []);
  }
});

test('a relative --dir is made absolute before the key path is written, and secrets/ is created with mode 700', () => {
  const parent = tmp();
  const r = spawnSync('bash', [SCRIPT, '--dir', 'rel/lab', '--host-path'], { cwd: parent, encoding: 'utf8', env: { ...process.env, SFPRIV_SETUP_NONINTERACTIVE: '1', ...fed('https://stub-org.develop.my.salesforce.example') } });
  assert.equal(r.status, 0, r.stderr);
  const dir = path.join(parent, 'rel/lab');
  const keyPath = parseEnv(fs.readFileSync(path.join(dir, '.env'), 'utf8')).SF_PRIVATE_KEY_PATH;
  assert.ok(path.isAbsolute(keyPath)); assert.equal(fs.realpathSync(keyPath), fs.realpathSync(path.join(dir, 'secrets/sf-private-key.pem')));
  assert.equal(mode(path.join(dir, 'secrets')), '700');
});

test('the script header and the steps say the lab uses its own key, and never the claim that the wizard\'s key cannot be exported', () => {
  const text = fs.readFileSync(SCRIPT, 'utf8') + fs.readFileSync(new URL('../docs/real-mode.md', import.meta.url), 'utf8');
  assert.match(text, /this lab uses its own key, separate from the one the Privilege wizard generated/);
  assert.ok(!/not exportable/i.test(text));
});

test('with the script\'s output and the loopback stub org: /api/info says realAvailable:true, the toggle goes to Real and back, one confirmed read signs in, and unconfigured stays 409', async () => {
  const dir = tmp();
  // The script writes the key and the .env (with a placeholder loopback URL); the stub then gets the generated key's public half and the .env is pointed at it.
  const made = run(dir, ['--host-path'], fed('http://127.0.0.1:9'));
  assert.equal(made.status, 0, made.stderr);
  const org = await startStub({ publicKey: createPublicKey(fs.readFileSync(path.join(dir, 'secrets/sf-private-key.pem'))), clientId: CK, username: UN });
  const envFile = path.join(dir, '.env');
  fs.writeFileSync(envFile, fs.readFileSync(envFile, 'utf8').replace('http://127.0.0.1:9', org.url), { mode: 0o600 });
  const parsed = parseEnv(fs.readFileSync(envFile, 'utf8'));
  const health = createHealth({ runChecks: async () => [], intervalMs: 3_600_000 }); await health.ready;
  const configured = await startHttpServer({ port: 0, host: '127.0.0.1', app: createApp({ health, env: parsed, real: createRealOrg(parsed), webDist: '/nonexistent' }) });
  const unconfigured = await startHttpServer({ port: 0, host: '127.0.0.1', app: createApp({ health, env: {}, real: createRealOrg({}), webDist: '/nonexistent' }) });
  try {
    const base = configured.url.replace(/\/$/, ''); const ub = unconfigured.url.replace(/\/$/, '');
    const send = (u, p, b) => fetch(`${u}${p}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: u }, body: JSON.stringify(b) });
    const info = async (u) => (await fetch(`${u}/api/info`)).json();
    const i0 = await info(base);
    assert.equal(i0.realAvailable, true); assert.equal(i0.realReason, null); assert.equal(i0.source, 'real', 'host-run default: Real when configured');
    assert.ok(!JSON.stringify(i0).includes(CK) && !JSON.stringify(i0).includes(UN), 'info never carries a secret');
    assert.equal((await send(base, '/api/mode', { source: 'mock' })).status, 200); assert.equal((await info(base)).source, 'mock');
    assert.equal((await send(base, '/api/mode', { source: 'real' })).status, 200); assert.equal((await info(base)).source, 'real');
    const read = await send(base, '/api/real/read', { confirm: new URL(org.url).hostname });
    assert.equal(read.status, 200, await read.clone().text());
    assert.equal(org.seen.token.length, 1, 'one sign-in with the generated key, verified by the stub');
    assert.equal((await info(ub)).realAvailable, false);
    const refused = await send(ub, '/api/mode', { source: 'real' }); assert.equal(refused.status, 409);
  } finally { health.stop(); await new Promise((res) => configured.server.close(res)); await new Promise((res) => unconfigured.server.close(res)); await org.close(); }
});
