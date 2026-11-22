// Static files, 404 and 405 outside /api, with and without a web build: always JSON, never Express's HTML, never the typed path.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rawHttp, withServer } from './helpers.js';

const NOT_FOUND = { error: 'not_found', message: 'Not found' };
const SHELL = '<!doctype html><title>shell</title><p id="shell">app shell</p>';
async function withDist(fn) {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'sfpriv-dist-'));
  fs.writeFileSync(path.join(dist, 'index.html'), SHELL);
  fs.mkdirSync(path.join(dist, 'assets')); fs.writeFileSync(path.join(dist, 'assets', 'app.js'), 'console.log(1)');
  try { await withServer(fn, { webDist: dist }); } finally { fs.rmSync(dist, { recursive: true, force: true }); }
}
const raw = (url, p, o = {}) => rawHttp(`${url}${p}`, { ...o, headers: { host: new URL(url).host, origin: url, ...(o.headers || {}) } });

test('a missing static file is a JSON 404, never 200 HTML; the shell answers only an extension-less, non-dotfile GET', async () => {
  await withDist(async (url) => {
    for (const p of ['/assets/missing.js', '/favicon.ico', '/robots.txt', '/foo.map', '/.env', '/.git/config', '/a/b/c.css', '/assets', '/assets/', '/static/x', '/api-docs.json']) {
      const r = await raw(url, p);
      assert.equal(r.status, 404, p); assert.match(r.headers['content-type'], /^application\/json/, p); assert.deepEqual(JSON.parse(r.text), NOT_FOUND, p);
      assert.ok(!/<html|<pre>|Cannot GET/i.test(r.text), p);
    }
    for (const p of ['/', '/foo', '/foo/bar', '/some-page', '/assetsx']) { const r = await raw(url, p); assert.equal(r.status, 200, p); assert.ok(r.text.includes('id="shell"'), p); }
    assert.equal((await raw(url, '/assets/app.js')).text, 'console.log(1)');
    assert.equal((await raw(url, '/%E0%A4%A')).status, 404);
  });
});

test('with no web build every path outside /api is a JSON 404, and a write is a JSON 404 (405 with Allow on "/" when there is a build)', async () => {
  await withServer(async (url) => {
    for (const p of ['/', '/foo', '/assets/x.js']) { const r = await raw(url, p); assert.equal(r.status, 404, p); assert.deepEqual(JSON.parse(r.text), NOT_FOUND, p); }
  }, { webDist: '/nonexistent/dist' });
  await withDist(async (url) => {
    for (const m of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const any = await raw(url, '/anything', { method: m }); assert.equal(any.status, 404, m); assert.deepEqual(JSON.parse(any.text), NOT_FOUND);
      const root = await raw(url, '/', { method: m }); assert.equal(root.status, 405, m); assert.equal(root.headers.allow, 'GET, HEAD');
    }
  });
});

test('a path with a token typed into it never comes back, whatever the method', async () => {
  const probe = 'ghp_' + 'Zx9Qw8Er7Ty6Ui5Op4As3Df2Gh1Jk0LzXcVb';
  await withDist(async (url) => {
    for (const m of ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']) for (const p of [`/${probe}`, `/api/${probe}`, `/api/scenarios/${probe}/run`, `/static/${probe}.js`]) {
      const r = await raw(url, p, { method: m, headers: { 'content-type': 'application/json' }, body: ['POST', 'PUT', 'PATCH'].includes(m) ? '{}' : undefined });
      assert.ok(!r.text.includes(probe.slice(4, 20)), `${m} ${p.slice(0, 20)}`);
      assert.ok(!/Cannot (GET|POST|PUT|DELETE|PATCH)|<pre>/.test(r.text), `${m} ${p.slice(0, 20)}`);
    }
  });
});
