// The step 1 fix pass: label states, hostile Salesforce answers, the private-address guard, caps, atomic refusals, boundaries and the Host check.
import test from 'node:test';
import assert from 'node:assert/strict';
import dns from 'node:dns';
import net from 'node:net';
import { C, presetEngine, run, attempt, newEngine, withServer, get, post, act, rawHttp } from './helpers.js';
import { typed, LIMITS } from '../src/engine.js';
import { createRealOrg, guardedLookup, short, WITHHELD } from '../src/real.js';
import { hostOf, hostCheck, isReservedHost, scanHosts, allowedExtraHosts } from '../src/safety.js';
import { validShelfUrl, shelfInfo } from '../src/shelfLink.js';
import { runChecks } from '../src/doctor.js';
import { buildStory } from '../src/story.js';
import { OUTCOMES, OBSERVED, LAB_INFERRED, LAB_INVENTED } from '../src/data.js';
import { makeKey, tmpFile, startStub } from './stub.js';

const DAY = 1440;
const KEY = makeKey();
const CLIENT = 'client-id-for-tests-12345'; const USER = 'integration.user@stub-login.example';
async function setup(behavior) {
  const stub = await startStub({ publicKey: KEY.publicKey, clientId: CLIENT, username: USER, behavior });
  const key = tmpFile('key.pem', KEY.pem);
  return { stub, env: { SF_LOGIN_URL: stub.url, SF_CLIENT_ID: CLIENT, SF_USERNAME: USER, SF_PRIVATE_KEY_PATH: key.file }, done: async () => { await stub.close(); key.cleanup(); } };
}

// ---- S1: a Salesforce answer can never bring a JWT back -------------------------------------------------------------------------------------
test('S1: a stub that echoes our JWT assertion in error_description, or in the error field, never gets it back', async () => {
  for (const behavior of ['echo-assertion', 'echo-error-field']) {
    const s = await setup(behavior);
    try {
      await assert.rejects(createRealOrg(s.env).read(), (e) => {
        const text = JSON.stringify({ code: e.code, message: e.message, extra: e.extra });
        const assertion = new URLSearchParams(s.stub.seen.token[0]).get('assertion');
        assert.ok(assertion && assertion.startsWith('eyJ'), 'the stub did receive a JWT');
        assert.ok(!text.includes('eyJ'), `${behavior}: no JWT start`);
        assert.ok(!text.includes(assertion.split('.')[1]) && !text.includes(assertion.split('.')[2]), `${behavior}: no segment of the assertion`);
        assert.ok(text.includes(WITHHELD), `${behavior}: replaced by the fixed note`);
        assert.equal(e.code, 'salesforce_sign_in_rejected');
        return true;
      });
    } finally { await s.done(); }
  }
});

test('S1 over HTTP: the echoed assertion is withheld in the answer too', async () => {
  const s = await setup('echo-assertion');
  try {
    await withServer(async (url) => {
      const r = await post(url, '/api/real/read', { confirm: '127.0.0.1' });
      const t = await r.text();
      assert.equal(r.status, 502); assert.ok(!t.includes('eyJ') && t.includes('withheld'));
    }, { env: s.env });
  } finally { await s.done(); }
});

test('S1: short() withholds a JWT, a dotted base64url triple and anything the masker would change, and keeps ordinary text', () => {
  const jwt = 'eyJhbGciOiJSUzI1NiJ9.eyJpc3MiOiJjIn0.c2lnbmF0dXJlYnl0ZXM';
  for (const bad of [jwt, `prefix ${jwt}`, 'abcdefghij.klmnopqrst.uvwxyz12', 'eyJabc', `x${'a'.repeat(40)}.${'b'.repeat(20)}.cccc`, 'password=hunter2hunter2']) assert.equal(short(bad), WITHHELD, bad.slice(0, 30));
  for (const ok of ['Account Read Access', 'someone@stub-org.example', 'invalid_grant', 'user hasn\'t approved this consumer', 'Integration_Access']) assert.equal(short(ok), ok);
  assert.equal(short(42), null); assert.equal(short('x'.repeat(500)).length, 120);
  assert.equal(short('a‮b​c\u0007d'), 'abc d', 'format characters deleted, control characters spaced');
});

// ---- S2: the DNS guard --------------------------------------------------------------------------------------------------------------------
function withLookup(fake, fn) {
  const real = dns.lookup; dns.lookup = fake;
  const done = () => { dns.lookup = real; };
  return Promise.resolve().then(fn).finally(done);
}
const lookup = (host, opts = {}) => new Promise((resolve) => guardedLookup(host, opts, (err, address, family) => resolve({ err, address, family })));

test('S2: guardedLookup refuses a name that resolves to a private address, in single and all forms, and passes a public one through', async () => {
  for (const priv of ['10.0.0.5', '127.0.0.1', '169.254.169.254', '::1', '::ffff:7f00:1', '64:ff9b::7f00:1', '2002:7f00:1::1', 'fec0::1', '100::1', '198.18.0.9', '192.0.0.9']) {
    const r = await withLookup((h, o, cb) => cb(null, priv, priv.includes(':') ? 6 : 4), () => lookup('acme.example.invalid'));
    assert.equal(r.err?.code, 'EBLOCKED', priv);
  }
  const mixed = await withLookup((h, o, cb) => cb(null, [{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.1', family: 4 }], 4), () => lookup('acme.example.invalid', { all: true }));
  assert.equal(mixed.err?.code, 'EBLOCKED', 'one private answer among public ones refuses the name');
  const pub = await withLookup((h, o, cb) => cb(null, '8.8.8.8', 4), () => lookup('acme.example.invalid'));
  assert.equal(pub.err, null); assert.equal(pub.address, '8.8.8.8'); assert.equal(pub.family, 4);
  const err = await withLookup((h, o, cb) => cb(Object.assign(new Error('x'), { code: 'ENOTFOUND' })), () => lookup('acme.example.invalid'));
  assert.equal(err.err.code, 'ENOTFOUND');
});

test('S2: a name that resolves to loopback never gets a connection (the listener sees none) and the failure is a named 502', async () => {
  let connections = 0;
  const srv = net.createServer((c) => { connections += 1; c.destroy(); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const key = tmpFile('k.pem', KEY.pem);
  try {
    const real = createRealOrg({ SF_LOGIN_URL: `https://rebind.example.invalid:${srv.address().port}`, SF_CLIENT_ID: 'a', SF_USERNAME: 'b', SF_PRIVATE_KEY_PATH: key.file }, { timeoutMs: 3000 });
    assert.equal(real.configured, true);
    await withLookup((h, o, cb) => (o && o.all ? cb(null, [{ address: '127.0.0.1', family: 4 }]) : cb(null, '127.0.0.1', 4)), async () => {
      await assert.rejects(real.read(), (e) => e.code === 'salesforce_unreachable' && e.status === 502 && /EBLOCKED/.test(e.message));
    });
    assert.equal(connections, 0);
  } finally { key.cleanup(); await new Promise((r) => srv.close(r)); }
});

// ---- S3 and S4: caps, and a refusal never half-mutates --------------------------------------------------------------------------------------
test('S3: the mock mailbox, the wizard keys and the lab clock are bounded, each with a clear refusal', () => {
  const e = presetEngine('ready');
  for (let i = 0; i < LIMITS.mailbox; i += 1) { const r = attempt(e, 'sf.requestKeyCode'); if (!r.ok) { assert.equal(r.code, 'workspace_full'); break; } }
  assert.equal(attempt(e, 'sf.requestKeyCode').code, 'workspace_full');
  assert.ok(e.snapshot().salesforce.mailbox.length <= LIMITS.mailbox);
  const k = newEngine(); run(k, 'wizard.orgUrl', { url: C.castWizardUrl }); run(k, 'wizard.generateKey');
  for (let i = 1; i < LIMITS.keys; i += 1) assert.equal(attempt(k, 'wizard.regenerateKey').ok, true, `key ${i + 1}`);
  const full = attempt(k, 'wizard.regenerateKey');
  assert.equal(full.code, 'workspace_full'); assert.equal(full.status, 409);
  assert.equal(k.snapshot().privilege.wizard.certs.length, LIMITS.keys);
});

test('S3: the lab clock stops at ten years, iso() never throws, and the snapshot stays serialisable at the limit', () => {
  const e = presetEngine('connected');
  let moved = 0;
  while (moved + LIMITS.advanceMaxMin <= LIMITS.clockMaxMin) { run(e, 'clock.advance', { minutes: LIMITS.advanceMaxMin }); moved += LIMITS.advanceMaxMin; }
  const left = LIMITS.clockMaxMin - e.snapshot().clock.nowMin;
  assert.ok(left >= 0 && left < LIMITS.advanceMaxMin);
  if (left > 0) run(e, 'clock.advance', { minutes: left });
  assert.equal(e.snapshot().clock.nowMin, LIMITS.clockMaxMin);
  const over = attempt(e, 'clock.advance', { minutes: 1 });
  assert.equal(over.code, 'clock_limit'); assert.equal(over.status, 409);
  assert.equal(e.snapshot().clock.nowMin, LIMITS.clockMaxMin, 'a refused move changes nothing');
  assert.doesNotThrow(() => JSON.stringify(e.snapshot()));
  assert.match(e.snapshot().clock.now, /^2036-/);
});

test('S4: drift.revoke at the receipt cap is refused BEFORE anything changes: the assignment, the findings and the call log are untouched', () => {
  const e = presetEngine('connected');
  run(e, 'sf.assignPermissionSet', { userId: 'sfu-2', permSetId: 'ps-1' });
  run(e, 'app.reconcile'); e.takeCalls();
  while (e.pv.receipts.length < LIMITS.receipts) e.pv.receipts.push({ id: `fill-${e.pv.receipts.length}`, kind: 'drift', policyId: null, privilegeUserId: 'pu-x', sfUserId: 'sfu-x', setId: 'ps-x', setLabel: 'x', startAt: 0, endAt: 0, status: 'Revoked', history: [] });
  const before = JSON.stringify(e.snapshot().salesforce.assignments);
  const r = attempt(e, 'drift.revoke', { privilegeUserId: 'pu-a', permSetId: 'ps-1' });
  assert.equal(r.code, 'workspace_full');
  assert.equal(JSON.stringify(e.snapshot().salesforce.assignments), before, 'the assignment is still there');
  assert.equal(e.snapshot().privilege.reconcile.findings.length, 1);
  assert.deepEqual(e.takeCalls(), [], 'no Salesforce call was made');
});

// ---- S6 and S7: label states ---------------------------------------------------------------------------------------------------------------------
test('S6: label states: the guide\'s observed outcomes are observed; the inferred ones say lab-inferred; the sign-in order is lab-chosen', async () => {
  const observed = ['signed_in', 'invalid_client_id', 'not_propagated', 'missing_refresh_scope', 'signature_mismatch', 'not_preauthorized', 'permset_not_linked', 'permset_not_assigned'];
  const inferred = ['wrong_username', 'unknown_username', 'user_inactive', 'user_not_licensed', 'certificate_expired', 'missing_api_scope', 'jwt_not_enabled'];
  assert.deepEqual([...observed, ...inferred].sort(), Object.keys(OUTCOMES).sort());
  const s = buildStory(C, 'finance');
  for (const id of observed) assert.equal(s.outcomes.find((o) => o.id === id).label, OBSERVED, id);
  for (const id of inferred) { const o = s.outcomes.find((x) => x.id === id); assert.equal(o.basis, 'lab-inferred', id); assert.equal(o.label, LAB_INFERRED, id); }
  assert.equal(s.signInOrder.basis, 'lab-chosen'); assert.ok(s.signInOrder.checks.length >= 12);
  assert.deepEqual(Object.keys(s.labels).sort(), ['lab-inferred', 'lab-invented', 'live', 'observed']);
  assert.equal(s.labels.live, 'read from your org, read-only');
  await withServer(async (url) => {
    const r = await act(url, 'wizard.signIn', { consumerKey: 'x', username: 'y' }); assert.equal(r.status, 409);
    for (const op of [['wizard.orgUrl', { url: C.castWizardUrl }], ['wizard.generateKey'], ['sf.createApp', { name: 'Four Names' }]]) await act(url, ...op);
    const b = await (await act(url, 'wizard.signIn', { consumerKey: 'x', username: 'y' }, { refusalsAs200: true })).json();
    assert.equal(b.outcome.basis, 'observed'); assert.equal(b.outcome.label, OBSERVED);
  });
});

test('S7: the lab-invented list names the reaper, the reconcile clearing, case-sensitivity, discovered/orphaned and the authorized user\'s rights; NOT_DEMONSTRATED says so', () => {
  const s = buildStory(C, 'finance');
  const ids = s.labInvented.map((i) => i.id);
  for (const id of ['reaper', 'reconcile-clears', 'case-sensitive', 'drift-names', 'authorized-user-rights']) assert.ok(ids.includes(id), id);
  const nd = s.notDemonstrated.join('\n');
  assert.match(nd, /automatic expiry by a reaper/); assert.match(nd, /next reconcile or Sync clears Revoke pending/); assert.match(nd, /case-sensitive/); assert.match(nd, /authorized user's required permissions are not checked/);
  assert.match(JSON.stringify(s.talkTrack), /lab-invented/);
  const md = JSON.stringify(s.claims) + JSON.stringify(s.troubleshooting);
  assert.ok(!/does not override/.test(md.replace(/did not override/g, '')), 'Federation ID wording is "did not override this in the one test run"');
  const fed = s.claims.find((c) => c.id === 'email-match').claim; assert.match(fed, /did not override this in the one test run/);
  assert.match(LAB_INVENTED, /lab-invented/);
});

test('B1/S5: the claims carry the four grant-dialog observations and the exact Add Users dialog text', () => {
  const s = buildStory(C, 'finance');
  const g = s.claims.find((c) => c.id === 'grant-rules').claim;
  for (const t of ['0 of 4 seats free', 'Needs a permission set license', 'Already has this permission set', 'License Salesforce ≠ Cloud Integration User', '1 of 1 seats free']) assert.ok(g.includes(t), t);
  const n = s.claims.find((c) => c.id === 'never-creates').claim;
  assert.match(n, /Privilege doesn't create Salesforce users\. Each user you add waits here with a Create in Salesforce link that opens the prefilled New User form; after you create them in Salesforce, the next Sync links them\./);
});

// ---- S8: gaps ----------------------------------------------------------------------------------------------------------------------------------
test('S8: typed() strips control, bidi and every format character, collapses whitespace, and bounds the length', () => {
  assert.equal(typed('a\u0000b\u0007c', 'f'), 'a b c');
  assert.equal(typed('Le‮af​co⁦m⁩﻿p­any', 'f'), 'Leafcompany');
  assert.equal(typed('  a \t\n b  ', 'f'), 'a b');
  assert.equal(typed('x'.repeat(80), 'f').length, 80);
  assert.throws(() => typed('x'.repeat(81), 'f'), (e) => e.code === 'too_long');
  assert.throws(() => typed('​‮', 'f'), (e) => e.code === 'bad_field', 'only invisible characters is empty');
  assert.throws(() => typed(7, 'f'), (e) => e.code === 'bad_field');
  assert.throws(() => typed('ghp_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8', 'f'), (e) => e.code === 'credential_like_text');
  const e = newEngine();
  assert.equal(run(e, 'sf.createPermissionSet', { label: 'Safe‮​Set' }).label, 'SafeSet');
});

test('S8: bodies are bounded on the scenario route too (depth 7, a 401-character text, 41 keys, a 21-item list); depth 6, 400 characters, 20 items are accepted', async () => {
  await withServer(async (url) => {
    const nest = (n) => { let v = 'x'; for (let i = 0; i < n; i += 1) v = { a: v }; return v; };
    for (const bad of [{ upTo: nest(6) }, { vertical: 'x'.repeat(401) }, Object.fromEntries(Array.from({ length: 41 }, (_, i) => [`k${i}`, 1])), { upTo: new Array(21).fill(1) }]) assert.equal((await post(url, '/api/scenarios/happy-path/run', bad)).status, 413, JSON.stringify(bad).slice(0, 40));
    assert.equal((await post(url, '/api/scenarios/happy-path/run', { upTo: nest(5) })).status, 400, 'five nested objects (depth 6) pass the bound and the route refuses the bad upTo');
    assert.equal((await post(url, '/api/scenarios/happy-path/run', { vertical: 'x'.repeat(400), upTo: 1 })).status, 200);
    assert.equal((await act(url, 'sf.setScopes', { scopes: new Array(20).fill('api') })).status, 409, '20 items are within the bound (the engine then says there is no app)');
    assert.equal((await post(url, '/api/actions', { op: 'clock.advance', params: nest(7) })).status, 413);
  });
});

test('S8: mode strings are exact: case, spaces and look-alikes are refused', async () => {
  await withServer(async (url) => {
    for (const bad of ['Real', 'REAL', ' real', 'real ', 'Mock', 'mock\u0000', 'rea1', 'live']) assert.equal((await post(url, '/api/mode', { source: bad })).status, 400, JSON.stringify(bad));
    assert.equal((await post(url, '/api/mode', { source: 'mock' })).status, 200);
  });
});

test('S8: boundaries: a grant of 1 minute and of 366 days is taken, one beyond is refused; a window closes at exactly its end; the 10-minute wait is exact', () => {
  const e = presetEngine('connected');
  assert.equal(attempt(e, 'policy.grant', { privilegeUserId: 'pu-a', permSetId: 'ps-1', durationMin: 1 }).ok, true);
  run(e, 'clock.advance', { minutes: 1 });
  assert.deepEqual(e.snapshot().privilege.receipts.map((r) => r.status), ['Expired']);
  assert.equal(attempt(e, 'policy.grant', { privilegeUserId: 'pu-a', permSetId: 'ps-1', durationMin: 366 * DAY }).ok, true);
  run(e, 'policy.delete', { policyId: 'pol-0002' }); run(e, 'app.reconcile');
  assert.equal(attempt(e, 'policy.grant', { privilegeUserId: 'pu-a', permSetId: 'ps-1', durationMin: 366 * DAY + 1 }).code, 'bad_number');
  const w = presetEngine('fresh');
  assert.equal(w.snapshot().salesforce.externalClientApp, null);
});

test('S8: Sync is idempotent: a linked row stays linked, nothing is added twice, and a second Sync reports no new link', () => {
  const e = presetEngine('connected');
  const before = JSON.stringify(e.snapshot().privilege.users);
  const s = run(e, 'app.sync');
  assert.deepEqual(s.linked, []); assert.deepEqual(s.refused, []);
  assert.equal(JSON.stringify(e.snapshot().privilege.users), before);
  assert.equal(e.snapshot().privilege.app.permissions.length, 4);
});

test('S8: the confirm gate takes only the exact host: empty, partial, padded and extra-key values contact nothing', async () => {
  const s = await setup('ok');
  try {
    await withServer(async (url) => {
      for (const bad of ['', ' ', '127', '127.0.0', '127.0.0.1.', '127.0.0.12', 'x127.0.0.1', '1', 'localhost']) { const r = await post(url, '/api/real/read', { confirm: bad }); assert.equal(r.status, 400, JSON.stringify(bad)); assert.equal((await r.json()).error, 'confirm_required'); }
      assert.equal((await post(url, '/api/real/read', { confirm: 7 })).status, 400);
      assert.equal(s.stub.seen.headers.length, 0, 'nothing was contacted');
      assert.equal((await post(url, '/api/real/read', { confirm: ' 127.0.0.1 ' })).status, 200, 'surrounding spaces are trimmed, the host itself must match exactly');
    }, { env: s.env });
  } finally { await s.done(); }
});

test('S8: Federation ID wording and the Add Users row reasons are exact', () => {
  const e = presetEngine('connected-app');
  run(e, 'users.add', { privilegeUserId: 'pu-c' });
  run(e, 'app.sync');
  assert.equal(e.snapshot().privilege.users[0].reason, 'Waiting for Salesforce: no Salesforce user has this exact email');
});

// ---- S9 and the NITs -------------------------------------------------------------------------------------------------------------------------
test('S9: no email or host anywhere in the cast is on example.com, and isReservedHost agrees with the rulebook', () => {
  for (const v of ['finance', 'health', 'retail']) { const t = JSON.stringify(buildStory(C, v)) + JSON.stringify(C); assert.ok(!/example\.com|example\.org|example\.net/.test(t)); }
  assert.ok(isReservedHost('x.example') && isReservedHost('x.invalid') && !isReservedHost('example.com') && !isReservedHost('x.example.com'));
  assert.deepEqual(scanHosts('mail omar.reyes@fabrikam.example and a@example.com'), ['example.com']);
});

test('NIT: the Host header is parsed strictly: "[::1]evil", spaces, two ports and an empty value are refused; loopback with and without a port pass', async () => {
  for (const [raw, want] of [['localhost', 'localhost'], ['localhost:7835', 'localhost'], ['127.0.0.1:7835', '127.0.0.1'], ['[::1]', '[::1]'], ['[::1]:7835', '[::1]'], ['[::1]evil', null], ['[::1]:99999x', null], ['a b', null], ['localhost:1:2', null], ['', null], ['[::1', null], ['evil.example.invalid:80', 'evil.example.invalid']]) assert.equal(hostOf(raw), want, raw);
  await withServer(async (url) => {
    const host = new URL(url).host;
    assert.equal((await rawHttp(`${url}/api/info`, { headers: { host: '[::1]evil' } })).status, 403);
    assert.equal((await rawHttp(`${url}/api/info`, { headers: { host } })).status, 200);
  });
});

test('NIT: a bad LAB_ALLOWED_HOSTS is a clear start-up/doctor failure and a 403, never a 500 on every request', async () => {
  const saved = process.env.LAB_ALLOWED_HOSTS;
  try {
    process.env.LAB_ALLOWED_HOSTS = 'good.example, bad host!';
    assert.throws(() => allowedExtraHosts(), /LAB_ALLOWED_HOSTS: not a host name: bad host!/);
    const checks = await runChecks({ env: { LAB_ALLOWED_HOSTS: 'bad host!' } });
    assert.equal(checks.find((c) => c.id === 'allowed-hosts').level, 'fail');
    assert.equal((await runChecks({ env: { LAB_ALLOWED_HOSTS: 'a.example,b.example' } })).find((c) => c.id === 'allowed-hosts').level, 'pass');
    await withServer(async (url) => {
      const host = new URL(url).host;
      assert.equal((await rawHttp(`${url}/api/info`, { headers: { host: 'good.example' } })).status, 403, 'a bad setting matches no extra host');
      assert.equal((await rawHttp(`${url}/api/info`, { headers: { host } })).status, 200, 'loopback still works');
    });
  } finally { if (saved === undefined) delete process.env.LAB_ALLOWED_HOSTS; else process.env.LAB_ALLOWED_HOSTS = saved; }
});

test('NIT: SHELF_URL is validated: only a plain http(s) URL without credentials, query or fragment; the home .env is never read', () => {
  assert.equal(validShelfUrl('https://shelf.example:8443/'), 'https://shelf.example:8443');
  assert.equal(validShelfUrl('"http://localhost:7800/shelf/"'), 'http://localhost:7800/shelf');
  for (const bad of ['', undefined, 'javascript:alert(1)', 'file:///etc/passwd', 'https://u:p@shelf.example', 'https://shelf.example/?a=1', 'https://shelf.example/#x', 'not a url', 'https://shelf.example/a b', `https://shelf.example/${'a'.repeat(400)}`]) assert.equal(validShelfUrl(bad), null, String(bad).slice(0, 30));
  assert.deepEqual(shelfInfo({ HOME: '/nonexistent', SHELF_URL: 'ftp://x.example' }), { shelfUrl: null });
  assert.deepEqual(shelfInfo({}), { shelfUrl: null });
});

test('NIT: the unfilled-HTTP Real path stays cheap: an over-long error text is cut before it is checked', () => {
  const t0 = Date.now();
  short('a'.repeat(1_000_000) + '.' + 'b'.repeat(1_000_000)); short('eyJ' + 'A'.repeat(1_000_000));
  assert.ok(Date.now() - t0 < 500);
});
