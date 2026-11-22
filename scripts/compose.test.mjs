import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { portProblem } from '../server/src/safety.js';

// Every published port must be bound to loopback on the host. A small line parser (no YAML dependency).
export function publishedPorts(text) {
  const out = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)ports:\s*$/.exec(lines[i]);
    if (!m) continue;
    for (let j = i + 1; j < lines.length; j++) {
      const item = /^\s*-\s*["']?([^"'\s#]+)["']?/.exec(lines[j]);
      if (!item || lines[j].search(/\S/) <= m[1].length) break;
      out.push(item[1]);
    }
  }
  return out;
}
const here = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('docker-compose.yml publishes only on 127.0.0.1', () => {
  const ports = publishedPorts(here('docker-compose.yml'));
  assert.ok(ports.length > 0, 'the parser found the published port');
  for (const p of ports) assert.match(p, /^127\.0\.0\.1:/, `${p} must start with 127.0.0.1:`);
});

test('the parser flags an unbound or wildcard publish', () => {
  for (const bad of ['- "7835:7835"', '- "0.0.0.0:7835:7835"', '- 7835', '- "::1:7835:7835"']) {
    const ports = publishedPorts(`services:\n  a:\n    ports:\n      ${bad}\n`);
    assert.equal(ports.length, 1);
    assert.doesNotMatch(ports[0], /^127\.0\.0\.1:/);
  }
});

test('compose default host port and Dockerfile port are allowed ports and agree', () => {
  const compose = here('docker-compose.yml');
  const host = Number(/\$\{HOST_PORT:-(\d+)\}/.exec(compose)[1]);
  assert.equal(portProblem(host), null);
  const docker = here('Dockerfile');
  const port = Number(/^EXPOSE (\d+)/m.exec(docker)[1]);
  assert.equal(portProblem(port), null);
  assert.match(compose, new RegExp(`:${port}"`));
  assert.match(docker, /^ENV SFPRIV_BIND=0\.0\.0\.0$/m);
  assert.match(docker, /^USER node$/m);
});

test('the container is locked down: read-only fs, no capabilities, no new privileges', () => {
  const compose = here('docker-compose.yml');
  assert.match(compose, /read_only: true/);
  assert.match(compose, /cap_drop: \[ALL\]/);
  assert.match(compose, /no-new-privileges:true/);
});

test('docker-compose.yml passes a usable SHELF_URL into the container (the shelf button needs it)', () => {
  assert.match(here('docker-compose.yml'), /^\s*SHELF_URL: \$\{SHELF_URL:-https:\/\/local\.ping-devops\.com:8443\/demo-shelf\}\s*$/m);
});

test('Docker never opens in Real: the image and the compose file force Mock as the default source, and the lab\'s own .env is optional', () => {
  assert.match(here('Dockerfile'), /^ENV .*SFPRIV_DEFAULT_SOURCE=mock/m);
  assert.match(here('docker-compose.yml'), /SFPRIV_DEFAULT_SOURCE: \$\{SFPRIV_DEFAULT_SOURCE:-mock\}/);
  assert.match(here('docker-compose.yml'), /restart: unless-stopped/);
});

// ---- Docker and Real wiring (step 3a) ---------------------------------------------------------------------------------------------------------
import { createApp, startHttpServer } from '../server/src/app.js';
import { createHealth } from '../server/src/health.js';
import { createRealOrg } from '../server/src/real.js';
import { allowedExtraHosts } from '../server/src/safety.js';

const root = new URL('..', import.meta.url);
const lines = (name) => here(name).split('\n');
// The lines of one block under the service (a key at 4 spaces), without a YAML dependency.
function block(key) {
  const ls = lines('docker-compose.yml'); const out = [];
  const at = ls.findIndex((l) => l === `    ${key}:` || l.startsWith(`    ${key}: `));
  if (at < 0) return null;
  for (let i = at + 1; i < ls.length; i += 1) { if (/^ {0,4}\S/.test(ls[i])) break; out.push(ls[i]); }
  return out;
}
const uncommented = (name) => lines(name).filter((l) => !/^\s*#/.test(l)).join('\n');

test('the host port is published on 127.0.0.1 only, exactly as pinned, and nowhere else', () => {
  assert.deepEqual(publishedPorts(here('docker-compose.yml')), ['127.0.0.1:${HOST_PORT:-7835}:7835']);
  assert.match(uncommented('docker-compose.yml'), /^\s*- "127\.0\.0\.1:\$\{HOST_PORT:-7835\}:7835"$/m);
  assert.ok(!/0\.0\.0\.0:|network_mode: ?host|expose:/.test(uncommented('docker-compose.yml')));
});

test('the restart policy is unless-stopped (rule 21) and the service has a /api/health healthcheck on the demo-health/1 contract', () => {
  assert.match(uncommented('docker-compose.yml'), /^\s{4}restart: unless-stopped$/m);
  const hc = block('healthcheck').join('\n');
  assert.match(hc, /127\.0\.0\.1:7835\/api\/health/); assert.match(hc, /demo-health\/1/); assert.match(hc, /state==='ready'/);
});

test('the container is non-root, read-only, drops every capability and has a tmpfs for /tmp', () => {
  const c = uncommented('docker-compose.yml');
  for (const re of [/^\s{4}user: node$/m, /^\s{4}read_only: true$/m, /^\s{4}cap_drop: \[ALL\]$/m, /no-new-privileges:true/]) assert.match(c, re);
  assert.deepEqual(block('tmpfs').map((l) => l.trim()), ['- /tmp']);
  assert.match(here('Dockerfile'), /^USER node$/m);
});

test('no secret is in the compose environment block or the image: the block holds only non-secret settings, secrets come from the optional .env, and the build context excludes them', () => {
  const env = block('environment').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  const keys = env.map((l) => l.split(':')[0]);
  assert.deepEqual(keys.sort(), ['LAB_ALLOWED_HOSTS', 'PORT', 'SFPRIV_BIND', 'SFPRIV_DEFAULT_SOURCE', 'SHELF_URL']);
  assert.ok(!/SF_(CLIENT_ID|USERNAME|LOGIN_URL|PRIVATE_KEY)/.test(uncommented('docker-compose.yml').replace(/path: \.\/\.env/, '')), 'the SF_ settings are never named in the compose file body');
  assert.deepEqual(block('env_file').map((l) => l.trim()), ['- path: ./.env', 'required: false']);
  const docker = uncommented('Dockerfile');
  assert.ok(!/SF_|PRIVATE KEY|\.pem|\.env|secrets|ARG /i.test(docker), 'the Dockerfile copies and sets no secret, key or .env');
  const ignore = here('.dockerignore').split('\n');
  for (const p of ['.env', '.env.*', 'secrets', '*.pem', '*.key', '.git']) assert.ok(ignore.includes(p), `.dockerignore excludes ${p}`);
  const git = here('.gitignore').split('\n');
  for (const p of ['.env', 'secrets/*', '!secrets/.gitkeep', '*.pem']) assert.ok(git.includes(p), `.gitignore has ${p}`);
});

test('the key mount cannot break "docker compose up" in Mock: ./secrets is a committed directory mounted read-only at /run/secrets, and .env is optional', () => {
  assert.deepEqual(block('volumes').map((l) => l.trim()), ['- ./secrets:/run/secrets:ro']);
  assert.ok(fs.statSync(new URL('secrets/', root)).isDirectory());
  assert.ok(fs.existsSync(new URL('secrets/.gitkeep', root)), 'the directory is in the repo, so the bind never makes one on the host');
  assert.deepEqual(fs.readdirSync(new URL('secrets/', root)).filter((f) => f !== '.gitkeep'), [], 'no key file is ever committed or left here');
});

test('LAB_ALLOWED_HOSTS defaults to the lab-proxy names, every one a valid host name', () => {
  const def = /LAB_ALLOWED_HOSTS: \$\{LAB_ALLOWED_HOSTS:-([^}]*)\}/.exec(here('docker-compose.yml'))[1].split(',');
  assert.ok(def.includes('local.ping-devops.com') && def.includes('salesforce-privilege-lab.local.ping-devops.com'));
  assert.equal(allowedExtraHosts({ LAB_ALLOWED_HOSTS: def.join(',') }).size, 2);
});

// The compose model's default environment, read from the compose file itself.
function composeDefaults() {
  const env = {};
  for (const l of block('environment').map((x) => x.trim()).filter((x) => x && !x.startsWith('#'))) {
    const m = /^([A-Z_]+): "?(?:\$\{[A-Z_]+:-([^}]*)\}|([^"]*))"?$/.exec(l);
    env[m[1]] = m[2] ?? m[3];
  }
  return env;
}

test('inside the compose model Mock is the default and Real, not configured, answers 409 on the toggle', async () => {
  const env = composeDefaults();
  assert.equal(env.SFPRIV_DEFAULT_SOURCE, 'mock');
  const health = createHealth({ runChecks: async () => [], intervalMs: 3_600_000 });
  const { server, url } = await startHttpServer({ port: 0, host: '127.0.0.1', app: createApp({ health, env, real: createRealOrg(env) }) });
  try {
    const base = url.replace(/\/$/, ''); const h = { 'content-type': 'application/json', origin: base };
    const info = await (await fetch(`${base}/api/info`)).json();
    assert.equal(info.source, 'mock'); assert.equal(info.realAvailable, false);
    const r = await fetch(`${base}/api/mode`, { method: 'POST', headers: h, body: JSON.stringify({ source: 'real' }) });
    assert.equal(r.status, 409); assert.equal((await r.json()).error, 'real_not_available');
    assert.equal((await (await fetch(`${base}/api/info`)).json()).source, 'mock', 'the refused switch left Mock');
    // a half-filled .env (the key mount is missing) is still Not configured, and says which names, never a value
    const half = { ...env, SF_LOGIN_URL: 'https://acme-dev-ed.develop.my.salesforce.example', SF_CLIENT_ID: 'SECRET-CLIENT', SF_USERNAME: 'u', SF_PRIVATE_KEY_PATH: '/run/secrets/missing.pem' };
    const real = createRealOrg(half);
    assert.equal(real.configured, false); assert.ok(!real.reason.includes('SECRET-CLIENT'));
  } finally { health.stop(); await new Promise((res) => server.close(res)); }
});

test('with the compose default and a configured Real, the page still opens in Mock; "auto" opens in Real; both keep the toggle', async () => {
  const { defaultSource } = await import('../server/src/config.js');
  assert.equal(defaultSource({ SFPRIV_DEFAULT_SOURCE: composeDefaults().SFPRIV_DEFAULT_SOURCE }, true), 'mock');
  assert.equal(defaultSource({ SFPRIV_DEFAULT_SOURCE: 'auto' }, true), 'real');
  assert.equal(defaultSource({ SFPRIV_DEFAULT_SOURCE: 'auto' }, false), 'mock');
});

test('the Dockerfile image builds the web app, copies only the server source and the built web, runs as node and sets the safe defaults', () => {
  const d = here('Dockerfile');
  assert.match(d, /^ENV NODE_ENV=production PORT=7835 SFPRIV_DEFAULT_SOURCE=mock$/m);
  assert.match(d, /^COPY server\/src server\/src$/m);
  assert.match(d, /^COPY server\/diagrams server\/diagrams$/m, 'the diagram data files ship in the image (rule 17: loaded by name)');
  assert.match(d, /^COPY --from=build \/app\/web\/dist web\/dist$/m);
  assert.match(d, /^CMD \["node", "server\/src\/index\.js"\]$/m);
});
