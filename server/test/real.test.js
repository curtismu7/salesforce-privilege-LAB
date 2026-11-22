// Real mode: owner-run, read-only. Everything here talks to an in-process stub on loopback, never to a real org.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRealOrg, parseOrigin, isPrivateAddress, signJwt, REAL_LIMITS } from '../src/real.js';
import { installNetguard } from '../src/netguard.js';
import { createPrivateKey } from 'node:crypto';
import { makeKey, tmpFile, startStub, TOKEN } from './stub.js';
import { withServer, get, post, act } from './helpers.js';

const KEY = makeKey();
const CLIENT = 'client-id-for-tests-12345';
const USER = 'integration.user@stub-login.example';

async function setup(behavior = 'ok', env = {}) {
  const stub = await startStub({ publicKey: KEY.publicKey, clientId: CLIENT, username: USER, behavior });
  const key = tmpFile('key.pem', KEY.pem);
  const e = { SF_LOGIN_URL: stub.url, SF_CLIENT_ID: CLIENT, SF_USERNAME: USER, SF_PRIVATE_KEY_PATH: key.file, ...env };
  return { stub, env: e, done: async () => { await stub.close(); key.cleanup(); } };
}

test('parseOrigin: an https origin or a loopback stub only; no credentials, path, query, IP literal or local name', () => {
  const ok = ['https://acme-dev-ed.develop.my.salesforce.example', 'https://login.example.invalid:8443', 'http://127.0.0.1:9', 'http://localhost:9'];
  for (const u of ok) assert.ok(parseOrigin(u).origin, u);
  const bad = ['http://acme.example.invalid', 'https://user:pw@acme.example.invalid', 'https://acme.example.invalid/path', 'https://acme.example.invalid/?a=1', 'https://acme.example.invalid/#x', 'https://10.0.0.1', 'https://[::1]', 'https://192.168.1.5', 'https://localhost', 'https://intranet', 'https://box.local', 'https://x.local.', 'https://x.internal.', 'https://localhost.', 'https://acme.example.invalid.', 'https://acme.example.invalid:0', 'https://127.0.0.1', 'https://[::1]', 'ftp://x.example.invalid', 'file:///etc/passwd', 'not a url', '', 'https://169.254.169.254'];
  for (const u of bad) assert.ok(parseOrigin(u).problem, u);
});

test('isPrivateAddress covers loopback, private, link-local, carrier-grade, mapped and unique-local addresses', () => {
  for (const a of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.0.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '224.0.0.1', '::1', '::', 'fc00::1', 'fd12::1', 'fe80::1', '::ffff:10.0.0.1', '::ffff:127.0.0.1', 'garbage',
    '::ffff:7f00:1', '::ffff:a00:1', '64:ff9b::7f00:1', '64:ff9b::10.0.0.1', '2002:7f00:1::1', '2002:808:808::1', 'fec0::1', 'feff::1', '100::1', '192.0.0.9', '198.18.0.1', '198.19.255.255', '192.0.2.1', '198.51.100.7', '203.0.113.9', '2001:db8::1', '2001::1', 'ff02::1', '::7f00:1', '240.0.0.1', '255.255.255.255']) assert.ok(isPrivateAddress(a), a);
  for (const a of ['8.8.8.8', '172.32.0.1', '172.15.0.1', '192.0.1.1', '198.17.0.1', '198.20.0.1', '2606:4700::1111', '2a00:1450:4001::1', '::ffff:8.8.8.8', '::ffff:808:808', '64:ff9a::1', '100:0:0:1::1']) assert.ok(!isPrivateAddress(a), a);
});

test('not configured: the reason names the missing settings only, never a value, and a read is refused', async () => {
  const none = createRealOrg({});
  assert.equal(none.configured, false); assert.match(none.reason, /SF_LOGIN_URL, SF_CLIENT_ID, SF_USERNAME, SF_PRIVATE_KEY_PATH/);
  await assert.rejects(none.read(), (e) => e.code === 'real_not_available' && e.status === 409);
  const part = createRealOrg({ SF_LOGIN_URL: 'https://x.example.invalid', SF_CLIENT_ID: 'SECRET-CLIENT-VALUE' });
  assert.equal(part.configured, false); assert.ok(!part.reason.includes('SECRET-CLIENT-VALUE')); assert.match(part.reason, /SF_USERNAME, SF_PRIVATE_KEY_PATH/);
  const badUrl = createRealOrg({ SF_LOGIN_URL: 'http://plain.example.invalid', SF_CLIENT_ID: 'a', SF_USERNAME: 'b', SF_PRIVATE_KEY_PATH: '/nonexistent/key.pem' });
  assert.equal(badUrl.configured, false); assert.match(badUrl.reason, /SF_LOGIN_URL/);
  const noKey = createRealOrg({ SF_LOGIN_URL: 'https://x.example.invalid', SF_CLIENT_ID: 'a', SF_USERNAME: 'b', SF_PRIVATE_KEY_PATH: '/nonexistent/key.pem' });
  assert.equal(noKey.configured, false); assert.ok(!noKey.reason.includes('/nonexistent'));
});

test('the sign-in is an RS256 JWT bearer the stub verifies; the read returns permission sets and users, labelled, with a trace on every hop', async () => {
  const s = await setup();
  try {
    const real = createRealOrg(s.env);
    assert.equal(real.configured, true); assert.equal(real.host, '127.0.0.1');
    const tp = `00-${'c'.repeat(32)}-${'d'.repeat(16)}-01`;
    const r = await real.read({ traceparent: tp });
    assert.equal(r.readOnly, true); assert.equal(r.label, 'read from your org, read-only'); assert.equal(r.basis, 'live'); assert.ok(!/observed|UNVERIFIED/.test(r.label), 'live data is not labelled as an observed product claim');
    assert.deepEqual(r.permissionSets.map((x) => x.label), ['Account Read Access', 'Integration Access']);
    assert.equal(r.users[0].email, 'someone@stub-org.example'); assert.equal(r.users[0].active, true);
    assert.equal(r.traceId, 'c'.repeat(32));
    assert.deepEqual(r.hops.map((h) => `${h.method} ${h.path} ${h.status}`), ['POST /services/oauth2/token 200', 'GET /services/data/v62.0/query 200', 'GET /services/data/v62.0/query 200']);
    for (const h of r.hops) assert.match(h.traceparent, /^00-c{32}-[0-9a-f]{16}-01$/);
    assert.equal(new Set(r.hops.map((h) => h.traceparent)).size, 3);
    assert.deepEqual(s.stub.seen.headers.map((h) => !!h.traceparent), [true, true, true], 'traceparent went out on every hop');
    assert.ok(s.stub.seen.query.every((q) => /^SELECT /.test(q) && !/INSERT|UPDATE|DELETE|UPSERT/i.test(q)), 'only read-only SOQL');
    assert.deepEqual(s.stub.seen.headers.map((h) => h.method), ['POST', 'GET', 'GET']);
  } finally { await s.done(); }
});

test('the private key and the access token are never in what a read returns, and never logged', async () => {
  const s = await setup();
  const logged = [];
  const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  for (const k of Object.keys(orig)) console[k] = (...a) => logged.push(a.map(String).join(' '));
  try {
    const r = await createRealOrg(s.env).read();
    const text = JSON.stringify(r);
    const body = KEY.pem.split('\n').filter((l) => !l.startsWith('-----')).join('');
    for (const secret of [body.slice(20, 60), 'BEGIN', 'PRIVATE KEY', TOKEN, CLIENT, USER, s.env.SF_PRIVATE_KEY_PATH]) assert.ok(!text.includes(secret), `the read leaks ${secret.slice(0, 12)}`);
    assert.deepEqual(logged, [], 'nothing is logged');
  } finally { Object.assign(console, orig); await s.done(); }
});

test('signJwt: RS256, claims iss/sub/aud/exp, a signature that verifies, and an expiry within 3 minutes', async () => {
  const { verify } = await import('node:crypto');
  const jwt = signJwt({ clientId: 'c', username: 'u', audience: 'https://o.example.invalid', privateKey: createPrivateKey(KEY.pem), now: 1_000_000 });
  const [h, c, sg] = jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { alg: 'RS256', typ: 'JWT' });
  assert.deepEqual(JSON.parse(Buffer.from(c, 'base64url')), { iss: 'c', sub: 'u', aud: 'https://o.example.invalid', exp: 1_000_180 });
  assert.ok(verify('RSA-SHA256', Buffer.from(`${h}.${c}`), KEY.publicKey, Buffer.from(sg, 'base64url')));
});

test('Salesforce refuses the sign-in: a structured 502 with its own error and the matching causes and fixes from the guide', async () => {
  const s = await setup('reject');
  try {
    await assert.rejects(createRealOrg(s.env).read(), (e) => {
      assert.equal(e.code, 'salesforce_sign_in_rejected'); assert.equal(e.status, 502);
      assert.equal(e.extra.salesforce.error, 'invalid_grant');
      const ids = e.extra.candidates.map((c) => c.id).sort();
      assert.deepEqual(ids, ['not_preauthorized', 'not_propagated', 'permset_not_assigned', 'permset_not_linked']);
      assert.ok(e.extra.candidates.every((c) => c.fix && c.cause && /UNVERIFIED/.test(c.label)));
      return true;
    });
  } finally { await s.done(); }
});

test('a wrong client id is answered by the stub as invalid_grant: nothing is returned but the error', async () => {
  const s = await setup('ok', { SF_CLIENT_ID: 'a-different-client' });
  try { await assert.rejects(createRealOrg(s.env).read(), (e) => e.code === 'salesforce_sign_in_rejected'); } finally { await s.done(); }
});

test('downstream failures are named and structured: redirect, too large, bad body, hang, cross-origin instance url, query failure, connection refused', async () => {
  const cases = [['redirect', 'salesforce_redirect_refused', 502], ['huge', 'salesforce_response_too_large', 502], ['bad-json', 'salesforce_bad_response', 502], ['hang', 'salesforce_timeout', 504], ['other-instance', 'salesforce_cross_origin_instance_url', 502], ['query-fail', 'salesforce_query_failed', 502]];
  for (const [behavior, code, status] of cases) {
    const s = await setup(behavior);
    try { await assert.rejects(createRealOrg(s.env, { timeoutMs: 300 }).read(), (e) => { assert.equal(e.code, code, behavior); assert.equal(e.status, status, behavior); assert.ok(e.message, behavior); return true; }); } finally { await s.done(); }
  }
  const s = await setup();
  await s.stub.close(); // the key file stays, the org is gone
  try { await assert.rejects(createRealOrg(s.env, { timeoutMs: 500 }).read(), (e) => e.code === 'salesforce_unreachable' && e.status === 502 && /ECONNREFUSED/.test(e.message)); } finally { await s.done(); }
});

test('a redirect is never followed (nothing is requested at the Location)', async () => {
  const s = await setup('redirect');
  try { await assert.rejects(createRealOrg(s.env).read()); assert.equal(s.stub.seen.headers.length, 1); } finally { await s.done(); }
});

test('the key file: unreadable, not a key and oversized are refused with fixed messages that do not carry the path or the content', async () => {
  const s = await setup();
  const junk = tmpFile('junk.pem', 'this is not a key but it is long enough to look like one SECRET-JUNK-TEXT');
  const big = tmpFile('big.pem', 'x'.repeat(REAL_LIMITS.keyBytes + 1));
  try {
    await assert.rejects(createRealOrg({ ...s.env, SF_PRIVATE_KEY_PATH: junk.file }).read(), (e) => { assert.equal(e.code, 'private_key_invalid'); assert.ok(!e.message.includes('SECRET-JUNK') && !e.message.includes(junk.file)); return true; });
    await assert.rejects(createRealOrg({ ...s.env, SF_PRIVATE_KEY_PATH: big.file }).read(), (e) => e.code === 'private_key_unreadable');
    assert.equal(s.stub.seen.headers.length, 0, 'nothing was sent without a usable key');
  } finally { junk.cleanup(); big.cleanup(); await s.done(); }
});

test('netguard: with only Mock configured nothing but loopback may leave; the one configured host is the single addition', async () => {
  const g = installNetguard();
  try {
    const env = { SF_LOGIN_URL: 'https://acme-dev-ed.develop.my.salesforce.example', SF_CLIENT_ID: 'a', SF_USERNAME: 'b', SF_PRIVATE_KEY_PATH: tmpFile('k.pem', KEY.pem).file };
    const real = createRealOrg(env, { timeoutMs: 4000 });
    assert.equal(real.configured, true);
    await assert.rejects(real.read(), (e) => e.code === 'salesforce_unreachable');
    assert.ok(g.attempts.some((a) => a.includes('acme-dev-ed.develop.my.salesforce.example')), 'the guard saw and refused the attempt');
    g.attempts.length = 0;
    g.allow(real.host);
    await assert.rejects(real.read(), (e) => ['salesforce_unreachable', 'salesforce_timeout'].includes(e.code)); // .example does not resolve, but the guard no longer refuses it
    assert.deepEqual(g.attempts, [], 'the allowed host is not an attempt');
    await assert.rejects(createRealOrg({ ...env, SF_LOGIN_URL: 'https://other-host.example.invalid' }, { timeoutMs: 4000 }).read(), () => true);
    assert.ok(g.attempts.some((a) => a.includes('other-host.example.invalid')), 'a different host is still refused');
  } finally { g.restore(); }
});

// ---- over HTTP: the toggle, the 409, the confirm gate, the data reload --------------------------------------------------------------------------
test('rule 19: the mode toggle switches both ways, answers 409 when Real is not configured, takes exactly { source }, and reloads the data', async () => {
  await withServer(async (url) => {
    assert.equal((await (await get(url, '/api/info')).json()).source, 'mock');
    const no = await post(url, '/api/mode', { source: 'real' });
    assert.equal(no.status, 409); const nb = await no.json(); assert.equal(nb.error, 'real_not_available'); assert.ok(nb.message);
    assert.equal((await (await get(url, '/api/info')).json()).source, 'mock', 'a refused switch changes nothing');
    for (const bad of [{}, { source: 'live' }, { source: 'mock', x: 1 }, { source: 5 }, { src: 'mock' }, [], 'mock']) assert.equal((await post(url, '/api/mode', bad)).status, 400, JSON.stringify(bad));
    assert.equal((await post(url, '/api/mode', { source: 'mock' })).status, 200);
  });
});

test('rule 19 with Real configured: default is Real, the toggle works in both directions, the state reloads for the new source, mock writes are refused in Real', async () => {
  const s = await setup();
  try {
    await withServer(async (url) => {
      const info = await (await get(url, '/api/info')).json();
      assert.equal(info.source, 'real', 'default Real when configured'); assert.equal(info.realAvailable, true); assert.equal(info.realHost, '127.0.0.1');
      assert.equal((await get(url, '/api/state')).status, 200);
      let st = await (await get(url, '/api/state')).json(); assert.equal(st.source, 'real'); assert.equal(st.real, null, 'nothing read yet: no call is made by switching or loading');
      assert.equal(s.stub.seen.headers.length, 0, 'the lab contacted nothing');
      // mock writes are refused while Real is selected
      assert.equal((await act(url, 'clock.advance', { minutes: 1 })).status, 409);
      assert.equal((await post(url, '/api/scenarios/happy-path/run', {})).status, 409);
      // real -> mock: the mock world loads
      let m = await (await post(url, '/api/mode', { source: 'mock' })).json(); assert.equal(m.source, 'mock'); assert.equal(m.realAvailable, true);
      st = await (await get(url, '/api/state')).json(); assert.equal(st.source, 'mock'); assert.ok(st.state.salesforce.host);
      assert.equal((await act(url, 'clock.advance', { minutes: 1 })).status, 200);
      // mock -> real: read-only, confirm gate first
      m = await (await post(url, '/api/mode', { source: 'real' })).json(); assert.equal(m.source, 'real');
      const noRead = await post(url, '/api/real/read', {}); assert.equal(noRead.status, 400);
      const wrong = await post(url, '/api/real/read', { confirm: 'something.else.example' }); assert.equal(wrong.status, 400); assert.equal((await wrong.json()).error, 'confirm_required');
      assert.equal((await post(url, '/api/real/read', { confirm: '127.0.0.1', extra: 1 })).status, 400);
      assert.equal(s.stub.seen.headers.length, 0, 'a refused confirm contacts nothing');
      const read = await post(url, '/api/real/read', { confirm: '127.0.0.1' });
      assert.equal(read.status, 200); const rb = await read.json();
      assert.equal(rb.ok, true); assert.equal(rb.real.permissionSets.length, 2); assert.equal(s.stub.seen.headers.length, 3);
      const text = JSON.stringify(rb);
      for (const secret of [TOKEN, CLIENT, 'PRIVATE KEY']) assert.ok(!text.includes(secret), secret);
      assert.match(read.headers.get('traceparent'), /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
      st = await (await get(url, '/api/state')).json(); assert.equal(st.source, 'real'); assert.equal(st.real.users.length, 1, 'the page reloads the real data');
      m = await (await post(url, '/api/mode', { source: 'mock' })).json(); assert.equal(m.source, 'mock');
      st = await (await get(url, '/api/state')).json(); assert.equal(st.real, undefined); assert.ok(st.state.privilege);
    }, { env: s.env });
  } finally { await s.done(); }
});

test('the read is refused in Mock mode, and SFPRIV_DEFAULT_SOURCE=mock keeps Real off by default even when configured (the Docker default)', async () => {
  const s = await setup();
  try {
    await withServer(async (url) => {
      assert.equal((await (await get(url, '/api/info')).json()).source, 'mock');
      const r = await post(url, '/api/real/read', { confirm: '127.0.0.1' });
      assert.equal(r.status, 409); assert.equal((await r.json()).error, 'not_in_real_mode');
      assert.equal(s.stub.seen.headers.length, 0);
    }, { env: { ...s.env, SFPRIV_DEFAULT_SOURCE: 'mock' } });
    await withServer(async (url) => { const r = await post(url, '/api/real/read', { confirm: 'x' }); assert.equal(r.status, 409); assert.equal((await r.json()).error, 'real_not_available'); });
  } finally { await s.done(); }
});

test('a real read that fails is a structured JSON error through the API, never HTML or a blank 200', async () => {
  const s = await setup('reject');
  try {
    await withServer(async (url) => {
      const r = await post(url, '/api/real/read', { confirm: '127.0.0.1' });
      assert.equal(r.status, 502); assert.match(r.headers.get('content-type'), /^application\/json/);
      const b = await r.json(); assert.equal(b.ok, false); assert.equal(b.error, 'salesforce_sign_in_rejected'); assert.ok(b.message); assert.ok(b.candidates.length);
      assert.ok(!JSON.stringify(b).includes(CLIENT));
    }, { env: s.env });
  } finally { await s.done(); }
});

test('Real is only one origin: a stub that names a different instance URL is refused, not followed', async () => {
  const s = await setup('other-instance');
  try {
    await withServer(async (url) => {
      const r = await post(url, '/api/real/read', { confirm: '127.0.0.1' });
      assert.equal(r.status, 502); assert.equal((await r.json()).error, 'salesforce_cross_origin_instance_url');
      assert.equal(s.stub.seen.query.length, 0, 'no query was sent anywhere');
    }, { env: s.env });
  } finally { await s.done(); }
});
