import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const sha = (p) => createHash('sha256').update(fs.readFileSync(path.join(root, p))).digest('hex');

test('the files the standalone rules ask for are present', () => {
  for (const f of ['README.md', 'CLAUDE.md', 'LICENSE', 'Dockerfile', 'docker-compose.yml', '.github/workflows/ci.yml', 'docs/talk-track.md', 'docs/safety.md', 'docs/setup-guide.md', 'docs/real-mode.md', 'docs/ship-notes.md', 'secrets/.gitkeep', 'docs/content-pack.schema.json', 'docs/shelf-entry.json', 'customer.config.example.json', 'content-pack.json', 'scripts/doctor.mjs', 'scripts/reset.mjs', 'web/src/styles/standalone-ui.css', '.env.example', '.gitignore', 'skills/privilege-salesforce-setup/SKILL.md']) {
    assert.ok(fs.existsSync(path.join(root, f)), f);
  }
});

// The shelf's tag taxonomy at the time of writing (demo-shelf-LAB data/tags.json). A snapshot, so the test is portable; when a sibling demo-shelf-LAB clone exists it is
// checked against the real file too.
const SHELF_TAGS = ['pingone', 'pingid', 'pingone-authorize', 'pingone-protect', 'pingone-davinci', 'pingone-privilege', 'agent-gateway', 'pingone-mcp', 'pingfederate', 'pinggateway', 'ai-agent-security', 'mcp-security', 'tool-poisoning', 'agent-identity', 'authorization-policy', 'human-in-the-loop', 'agent-controls', 'sign-in-and-mfa', 'token-security', 'audit-observability', 'learning', 'workload-identity', 'federation', 'jwt', 'jwks', 'pass-agent-token', 'poc-patterns', 'simulated', 'real', 'oauth', 'oidc', 'token-exchange', 'id-jag', 'dpop', 'mtls', 'par', 'ciba', 'step-up', 'rfc9728', 'fapi', 'mcp', 'a2a', 'cimd', 'cedar', 'mcp-server-built', 'aws', 'aws-agentcore', 'aws-bedrock'];

test('the shelf entry is valid, portable and this lab\'s own: the registry\'s field rules, port 7835, a placeholder catalog id, a relative composeFile, tags from the taxonomy', () => {
  const e = JSON.parse(read('docs/shelf-entry.json')).demos[0];
  assert.equal(JSON.parse(read('docs/shelf-entry.json')).demos.length, 1);
  assert.match(e.id, /^[a-z0-9-]{2,41}$/); assert.equal(e.id, 'salesforce-privilege-lab');
  assert.ok(e.name.length > 0 && e.name.length <= 300);
  assert.ok(e.description.length > 0 && e.description.length <= 300, `description is ${e.description.length} characters`);
  assert.equal(e.kind, 'Demo');
  assert.equal(e.healthPath, '/api/health');
  assert.equal(e.url, 'http://localhost:7835');
  assert.match(e.catalogId, /^D\d+$/);
  assert.equal(e.catalogId, 'D000', 'a placeholder: the owner assigns the real catalog id before the registry PR');
  assert.deepEqual(e.pingProducts, []);
  assert.deepEqual(e.composeOverlays, []);
  assert.equal(e.where, 'installed');
  assert.equal(e.repo, 'https://github.com/curtismu7/salesforce-privilege-LAB');
  assert.match(e.addedAt, /^\d{4}-\d{2}-\d{2}$/); assert.ok(Date.parse(`${e.addedAt}T00:00:00Z`) <= Date.now() + 14 * 3600 * 1000, 'addedAt is not in the future');
  assert.equal(e.composeFile, 'salesforce-privilege-LAB/docker-compose.yml');
  assert.ok(!path.isAbsolute(e.composeFile) && !e.composeFile.includes('..') && /\.ya?ml$/.test(e.composeFile) && !/[;&|$`\s]/.test(e.composeFile), 'composeFile must be relative with no shell characters');
  assert.ok(Array.isArray(e.tags) && e.tags.length >= 1 && e.tags.length <= 20 && new Set(e.tags).size === e.tags.length);
  for (const t of e.tags) assert.ok(SHELF_TAGS.includes(t), `tag ${t} is not in the shelf taxonomy`);
  assert.ok(e.tags.includes('simulated') && e.tags.includes('real'));
  assert.ok(!/\/Users\//.test(JSON.stringify(e)), 'no absolute home path');
  // the compose file the entry names is this repo's, at the path the shelf will find it under (the repo folder's name)
  assert.ok(fs.existsSync(path.join(root, 'docker-compose.yml')));
  const sibling = path.join(root, '..', 'demo-shelf-LAB', 'data', 'tags.json');
  if (fs.existsSync(sibling)) {
    const ids = new Set(JSON.parse(fs.readFileSync(sibling, 'utf8')).groups.flatMap((g) => g.tags.map((t) => t.id)));
    for (const t of e.tags) assert.ok(ids.has(t), `tag ${t} is not in ${sibling}`);
  }
});

test('the fork carries none of the source lab\'s identity', () => {
  const skip = new Set(['node_modules', 'dist', '.git', 'package-lock.json', 'shared']);
  const hits = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      if (skip.has(name)) continue;
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) { walk(p); continue; }
      // README and CLAUDE.md say honestly that this is a fork of the source; this test names the source on purpose.
      if (['repo.test.mjs', 'README.md', 'CLAUDE.md'].some((n) => p.endsWith(n)) || p.endsWith('.sha256')) continue;
      const t = fs.readFileSync(p, 'utf8');
      for (const w of ['D104', '7250', 'SAL_LAB', 'SALAB_', 'saas-access', 'SaaS Access']) if (t.includes(w)) hits.push(`${path.relative(root, p)}: ${w}`);
    }
  };
  walk(root);
  assert.deepEqual(hits, []);
  assert.match(read('README.md'), /fork of \[curtismu7\/saas-access-LAB\]/);
});

test('the vendored shared components are byte-identical with their pin files', () => {
  for (const [file, pin] of [['web/src/components/JsonPane.jsx', 'web/src/components/JsonPane.sha256'], ['web/src/components/JsonPane.css', 'web/src/components/JsonPane.css.sha256'], ['web/src/components/VerifyMark.jsx', 'web/src/components/VerifyMark.sha256'], ['web/src/components/VerifyMark.css', 'web/src/components/VerifyMark.css.sha256'], ['web/src/styles/standalone-ui.css', 'scripts/standalone-ui.sha256']]) {
    const want = read(pin).trim().split(/\s+/)[0];
    assert.equal(sha(file), want, `${file} differs from ${pin}`);
  }
  // the TopMenu pin is one file with both lines, names relative to its folder (the shape conformance rule 22 reads)
  const pins = Object.fromEntries(read('web/src/top-menu/top-menu.sha256').split('\n').filter(Boolean).map((l) => l.trim().split(/\s+/).reverse()));
  for (const f of ['TopMenu.jsx', 'top-menu.css']) assert.equal(sha(`web/src/top-menu/${f}`), pins[f], `top-menu/${f} differs from top-menu.sha256`);
  for (const f of ['top-menu/ReleaseNotes.jsx', 'floating-dialog/FloatingDialog.jsx', 'diagram-kit/DiagramKit.jsx']) assert.ok(fs.existsSync(path.join(root, 'web/src', f)), f);
});

test('customer.config.json is git-ignored, and its example only sets the brand', () => {
  assert.match(read('.gitignore'), /^customer\.config\.json$/m);
  assert.deepEqual(Object.keys(JSON.parse(read('customer.config.example.json')).cast), ['brand']);
});

test('the CI workflow is GitHub-hosted, Node 26 only, and carries the forbidden-strings and gitleaks jobs', () => {
  const ci = read('.github/workflows/ci.yml');
  assert.match(ci, /runs-on: ubuntu-latest/);
  assert.ok(!/self-hosted/.test(ci));
  const versions = [...ci.matchAll(/node-version: (\S+)/g)].map((m) => m[1]);
  assert.ok(versions.length >= 3 && versions.every((v) => v === '26'), versions.join());
  assert.match(ci, /forbidden-strings:/);
  assert.match(ci, /gitleaks/);
  assert.match(ci, /PORT=7835 npm run doctor/);
});

test('package.json requires Node 26 and the Dockerfile uses a Node 26 base', () => {
  assert.equal(JSON.parse(read('package.json')).engines.node, '>=26');
  assert.ok((read('Dockerfile').match(/^FROM node:26-alpine/gm) || []).length === 2);
});

test('README follows the README standard: title ends in LAB, plain Tier and Repo lines, the port text, a run-from-a-clone section; no internal names', () => {
  const r = read('README.md');
  assert.match(r.split('\n')[0], /^# .* LAB$/);
  assert.match(r, /^Tier: Demo$/m);
  assert.match(r, /^Repo: https:\/\/github\.com\/curtismu7\/salesforce-privilege-LAB$/m);
  for (const h of ['What is simulated', 'Run from a clone', 'Settings file', 'Ports, and what to do', 'Mock and Real modes', 'Health, doctor and reset', 'Tests', 'Troubleshooting', 'Ownership', 'Not done']) assert.match(r, new RegExp(`^## .*${h}`, 'mi'), h);
  assert.match(r, /lsof -iTCP:7835 -sTCP:LISTEN -n -P/);
  assert.match(r, /### Known limits of the model/);
  assert.match(r, /UNVERIFIED as a product claim/);
  assert.ok(!/ping-devops|cm[u]ir/i.test(r));
  assert.ok(!/\bdoor\b/i.test(r));
});

test('docs never use the word "door", and the lab ships no k8s manifests (deferred by the owner)', () => {
  for (const f of ['README.md', 'CLAUDE.md', 'docs/talk-track.md', 'docs/safety.md']) assert.ok(!/\bdoor\b/i.test(read(f)), f);
  assert.ok(!fs.existsSync(path.join(root, 'k8s')));
});

test('the lab keeps no secret: .env is git-ignored, .env.example lists names only, and no PEM block is committed', () => {
  assert.match(read('.gitignore'), /^\.env$/m);
  for (const line of read('.env.example').split('\n')) if (!line.startsWith('#') && line.trim()) assert.fail(`.env.example has a live line: ${line.slice(0, 20)}`);
  const walk = (dir, out = []) => { for (const n of fs.readdirSync(dir)) { if (['node_modules', 'dist', '.git'].includes(n)) continue; const p = path.join(dir, n); fs.statSync(p).isDirectory() ? walk(p, out) : out.push(p); } return out; };
  for (const f of walk(root)) { const t = fs.readFileSync(f, 'utf8'); if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(t) && !f.endsWith('repo.test.mjs')) assert.fail(`a private key block is committed: ${path.relative(root, f)}`); }
});

test('app CSS follows the CSS standard: tokens only, no colour literal, no purple', () => {
  const css = read('web/src/app.css');
  assert.ok(!/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/.test(css), 'no colour literal');
  assert.ok(!/purple|violet|magenta|indigo/i.test(css));
  const main = read('web/src/main.jsx');
  assert.ok(main.indexOf('standalone-ui.css') < main.indexOf('app.css'), 'the shared stylesheet loads before the app stylesheet');
});

test('the UI tells a visitor about a table wider than the screen and about the diagram at phone width, and email cells never wrap', () => {
  const css = read('web/src/app.css');
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.scroll::before \{ content: "\\2194  scroll sideways/);
  assert.match(css, /\.scroll \{[^}]*radial-gradient/);
  assert.match(css, /\.tbl td\.email \{ white-space: nowrap; overflow-wrap: normal; \}/);
  assert.match(css, /@media \(max-width: 600px\) \{ \.pat-pan-hint \{ display: block; \} \}/);
  const pd = read('web/src/components/PatternDiagram.jsx');
  assert.match(pd, /<Controls showInteractive=\{false\} fitViewOptions=\{fit\} \/>/, 'Fit view uses the readable fit, not the 0.3 zoom');
  assert.match(pd, /minZoom=\{narrow\(\) \? 0\.5 : 0\.3\}/);
  assert.match(pd, /role="button" tabIndex=\{0\}/);
});

test('README says the Shelf link needs SHELF_URL and names the diagram keyboard limit', () => {
  const r = read('README.md');
  assert.match(r, /Shelf link \(it appears only when `SHELF_URL` is set\)/);
  assert.match(r, /### Known limits of the model[\s\S]*keyboard[\s\S]*(move|moving) a box/i);
});

test('docs/real-mode.md: a separate app with the two openssl commands, and the key is kept at 600, never world-readable', () => {
  const d = read('docs/real-mode.md');
  assert.match(d, /SEPARATE External Client App/);
  assert.match(d, /openssl genrsa -out <key-name>\.pem 2048/);
  assert.match(d, /openssl req -x509 -new -key <key-name>\.pem -sha256 -days 730 -subj "\/CN=<certificate-common-name>" -out <certificate-name>\.crt/);
  assert.match(d, /Keep the key at mode 600/);
  assert.match(d, /chown 1000/);
  assert.match(d, /Never make the key world-readable/);
  assert.ok(!/\b644\b|640/.test(d), 'no recommendation to loosen the key mode');
});
