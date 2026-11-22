import test from 'node:test';
import assert from 'node:assert/strict';
import { C, withServer, get, post, act, rawHttp } from './helpers.js';
import { ROUTES } from '../src/app.js';
import { installNetguard } from '../src/netguard.js';

const json = (r) => r.json();

test('GET /api/health is demo-health/1 and GET only', async () => {
  await withServer(async (url) => {
    const h = await json(await get(url, '/api/health'));
    assert.equal(h.schema, 'demo-health/1'); assert.equal(h.state, 'ready'); assert.equal(h.runtime, 'offline');
    assert.equal(h.demo.id, 'salesforce-privilege-lab'); assert.match(h.demo.version, /^\d+\.\d+\.\d+$/);
    assert.deepEqual(Object.keys(h).sort(), ['at', 'demo', 'runtime', 'schema', 'state']);
    const r = await post(url, '/api/health', {}); assert.equal(r.status, 405); assert.equal(r.headers.get('allow'), 'GET, HEAD');
  });
});

test('GET /api/info answers source and realAvailable; Mock is the default when Real is not configured', async () => {
  await withServer(async (url) => {
    const i = await json(await get(url, '/api/info'));
    assert.equal(i.source, 'mock'); assert.equal(i.realAvailable, false); assert.deepEqual(i.modes, ['mock', 'real']);
    assert.match(i.realReason, /Real is not configured: set SF_LOGIN_URL, SF_CLIENT_ID, SF_USERNAME, SF_PRIVATE_KEY_PATH/);
    assert.equal(i.simulated, true);
  });
});

test('an action runs on the mock org and answers the result, the whole state, a trace and the Salesforce hops', async () => {
  await withServer(async (url) => {
    const r = await act(url, 'wizard.orgUrl', { url: C.castWizardUrl });
    assert.equal(r.status, 200);
    const b = await json(r);
    assert.equal(b.ok, true); assert.equal(b.source, 'mock'); assert.equal(b.workspace, 'default'); assert.equal(b.vertical, 'finance');
    assert.equal(b.state.privilege.wizard.orgUrl, `${C.castOrg}-dev-ed.develop.my.salesforce.example`);
    assert.match(r.headers.get('traceparent'), /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    assert.equal(b.hops[0].from, 'browser');
  });
});

test('traceparent: an incoming one is continued on every hop; each hop has its own span', async () => {
  await withServer(async (url) => {
    const trace = 'a'.repeat(32);
    const tp = `00-${trace}-${'b'.repeat(16)}-01`;
    for (const [op, p] of [['wizard.orgUrl', { url: C.castWizardUrl }], ['wizard.generateKey', undefined], ['sf.createApp', { name: C.castEccName }]]) await act(url, op, p, {}, { traceparent: tp });
    // a sign-in makes a Salesforce call
    await act(url, 'sf.setScopes', { scopes: ['api', 'refresh_token'] }, {}, { traceparent: tp });
    const b = await json(await act(url, 'wizard.signIn', { consumerKey: C.castConsumerKey, username: C.castAdminUsername }, { refusalsAs200: true }, { traceparent: tp }));
    assert.equal(b.traceId, trace);
    assert.ok(b.hops.length >= 2, 'the browser hop and the Salesforce sign-in hop');
    const spans = new Set();
    for (const h of b.hops) { assert.match(h.traceparent, new RegExp(`^00-${trace}-[0-9a-f]{16}-01$`)); spans.add(h.spanId); }
    assert.equal(spans.size, b.hops.length, 'a new span per hop');
    const sf = b.hops.find((h) => h.to === 'Salesforce (mock)');
    assert.equal(sf.url, `https://${C.castOrgHost}/services/oauth2/token`); assert.equal(sf.method, 'POST');
    assert.ok(sf.request.grant_type && sf.response);
    // no incoming header: a new trace
    const n = await json(await act(url, 'clock.advance', { minutes: 1 }));
    assert.match(n.traceId, /^[0-9a-f]{32}$/); assert.notEqual(n.traceId, trace);
  });
});

test('a refusal keeps its status, or comes back as data when the page asks; a downstream failure is always a real 5xx with { error, message }', async () => {
  await withServer(async (url) => {
    const r = await act(url, 'wizard.generateKey');
    assert.equal(r.status, 409);
    const b = await json(r); assert.equal(b.ok, false); assert.equal(b.error, 'org_url_first'); assert.ok(b.message);
    const d = await act(url, 'wizard.generateKey', undefined, { refusalsAs200: true });
    assert.equal(d.status, 200); assert.equal((await json(d)).ok, false);
    // Downstream failure: no application's sign-in works any more -> 502, even when the page asks for refusals as data.
    for (const [op, p] of [['wizard.orgUrl', { url: C.castWizardUrl }], ['wizard.generateKey'], ['sf.createApp', { name: C.castEccName }], ['sf.setScopes', { scopes: ['api', 'refresh_token'] }], ['sf.setJwtBearer', { enabled: true, certId: 'cert-1' }], ['sf.setPermittedUsers', { policy: 'admin_preauthorized' }], ['sf.createPermissionSet', { label: 'Integration Access' }], ['sf.linkPermissionSet', { permSetId: 'ps-4' }], ['sf.assignPermissionSet', { userId: 'sfu-1', permSetId: 'ps-4' }], ['clock.advance', { minutes: 11 }], ['wizard.signIn', { consumerKey: C.castConsumerKey, username: C.castAdminUsername }], ['app.create', { name: C.castAppName }], ['wizard.regenerateKey']]) assert.equal((await act(url, op, p)).status, 200, op);
    const down = await act(url, 'app.sync', undefined, { refusalsAs200: true });
    assert.equal(down.status, 502);
    const db = await json(down);
    assert.equal(db.error, 'salesforce_sign_in_failed'); assert.match(db.message, /could not sign in to Salesforce/); assert.equal(db.outcome.id, 'signature_mismatch');
    assert.match(down.headers.get('content-type'), /^application\/json/);
  });
});

test('unknown ops, unknown body keys, non-object bodies and over-bounds bodies are refused before anything runs', async () => {
  await withServer(async (url, { workspaces }) => {
    assert.equal((await act(url, 'nope', {})).status, 400);
    assert.equal((await post(url, '/api/actions', { op: 'clock.advance', params: { minutes: 1 }, extra: 1 })).status, 400);
    assert.equal((await post(url, '/api/actions', [1])).status, 400);
    assert.equal((await act(url, 'sf.createApp', { name: 'x'.repeat(401) })).status, 413);
    assert.equal((await act(url, 'sf.setScopes', { scopes: new Array(21).fill('api') })).status, 413);
    assert.equal(workspaces.size(), 0, 'a refusal creates no workspace slot');
  });
});

test('GET /api/state: a peek creates nothing; the vertical changes the cast', async () => {
  await withServer(async (url, { workspaces }) => {
    const s = await json(await get(url, '/api/state?vertical=health'));
    assert.equal(s.source, 'mock'); assert.equal(s.vertical, 'health'); assert.equal(s.state.salesforce.host, 'contoso-dev-ed.develop.my.salesforce.example');
    assert.equal(workspaces.size(), 0);
    const f = await json(await get(url, '/api/state?vertical=zzz'));
    assert.equal(f.vertical, 'finance');
  });
});

test('scenarios: list, run (to the end or to a step), the engine stays where it ended, an unknown id is a JSON 404', async () => {
  await withServer(async (url) => {
    const list = await json(await get(url, '/api/scenarios'));
    assert.equal(list.scenarios.length, 12); assert.ok(list.scenarios.every((s) => s.id && s.title && s.steps > 0 && !('label' in s) && !('basis' in s)));
    const r = await json(await post(url, '/api/scenarios/happy-path/run', {}));
    assert.equal(r.ok, true); assert.ok(r.steps.every((x) => x.met));
    assert.equal(r.state.privilege.policies[0].status, 'ended');
    const st = await json(await get(url, '/api/state'));
    assert.equal(st.state.privilege.policies[0].status, 'ended', 'the workspace\'s engine is the scenario\'s');
    const part = await json(await post(url, '/api/scenarios/happy-path/run', { upTo: 3 }));
    assert.equal(part.steps.length, 3);
    const d = await json(await post(url, '/api/scenarios/duplicate-email/run', { vertical: 'retail' }));
    assert.match(JSON.stringify(d.steps[2].result), /its email matches 2 Privilege users/);
    assert.equal(d.vertical, 'retail');
    const miss = await post(url, '/api/scenarios/nope/run', {}); assert.equal(miss.status, 404); assert.equal((await json(miss)).error, 'unknown_scenario');
    assert.equal((await post(url, '/api/scenarios/happy-path/run', { upTo: -1 })).status, 400);
    assert.equal((await post(url, '/api/scenarios/__proto__/run', {})).status, 404);
  });
});

test('Reset restores state for this workspace only', async () => {
  await withServer(async (url) => {
    const hdr = { 'x-workspace': 'ws-one' };
    await act(url, 'clock.advance', { minutes: 5 }, {}, hdr); await act(url, 'clock.advance', { minutes: 7 });
    assert.equal((await json(await get(url, '/api/state', hdr))).state.clock.nowMin, 5);
    const r = await post(url, '/api/reset', {}, hdr); assert.deepEqual(await json(r), { reset: 'ok', workspace: 'ws-one' });
    assert.equal((await json(await get(url, '/api/state', hdr))).state.clock.nowMin, 0);
    assert.equal((await json(await get(url, '/api/state'))).state.clock.nowMin, 7, 'the default workspace is untouched');
  });
});

test('workspace ids: a credential-looking one is a 400 before any slot exists, and is never echoed', async () => {
  await withServer(async (url, { workspaces }) => {
    for (const bad of ['sk-abcdef1234567890', 'password-1', 'A', 'a b', 'x'.repeat(41)]) {
      const r = await act(url, 'clock.advance', { minutes: 1 }, {}, { 'x-workspace': bad });
      assert.equal(r.status, 400, bad); const t = await r.text(); assert.ok(!t.includes(bad), bad); assert.match(t, /bad_workspace/);
    }
    assert.equal(workspaces.size(), 0);
  });
});

test('security edges: Host must be loopback, writes must be same-origin, a charset other than utf-8 is a 415, the body cap is a 413', async () => {
  await withServer(async (url) => {
    const host = new URL(url).host;
    assert.equal((await rawHttp(`${url}/api/info`, { headers: { host: 'evil.example.invalid' } })).status, 403);
    assert.equal((await rawHttp(`${url}/api/reset`, { method: 'POST', headers: { host, origin: 'http://evil.example.invalid', 'content-type': 'application/json' }, body: '{}' })).status, 403);
    assert.equal((await rawHttp(`${url}/api/reset`, { method: 'POST', headers: { host, 'sec-fetch-site': 'cross-site', 'content-type': 'application/json' }, body: '{}' })).status, 403);
    assert.equal((await rawHttp(`${url}/api/actions`, { method: 'POST', headers: { host, origin: url, 'content-type': 'application/json; charset=latin1' }, body: '{}' })).status, 415);
    const big = await rawHttp(`${url}/api/actions`, { method: 'POST', headers: { host, origin: url, 'content-type': 'application/json' }, body: JSON.stringify({ op: 'x', params: { a: 'x'.repeat(40000) } }) });
    assert.equal(big.status, 413); assert.deepEqual(Object.keys(JSON.parse(big.text)).sort(), ['error', 'message']);
    const bad = await rawHttp(`${url}/api/actions`, { method: 'POST', headers: { host, origin: url, 'content-type': 'application/json' }, body: '{not json' });
    assert.equal(bad.status, 400); assert.match(bad.headers['content-type'], /^application\/json/);
  });
});

test('every route in the table is registered, and every path answers JSON for a wrong method (405 with Allow) and for an unknown path (404)', async () => {
  await withServer(async (url) => {
    for (const [p, methods] of Object.entries(ROUTES)) {
      const path = p.replace(':id', 'happy-path');
      for (const m of ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']) {
        if (methods.includes(m)) continue;
        const r = await rawHttp(`${url}${path}`, { method: m, headers: { host: new URL(url).host, origin: url, 'content-type': 'application/json' }, body: ['GET', 'DELETE'].includes(m) ? undefined : '{}' });
        assert.equal(r.status, 405, `${m} ${path}`); assert.equal(r.headers.allow, [...new Set([...methods, ...(methods.includes('GET') ? ['HEAD'] : [])])].sort().join(', '), `${m} ${path}`);
        assert.match(r.headers['content-type'], /^application\/json/);
      }
    }
    const nf = await rawHttp(`${url}/api/nothing-here`, { headers: { host: new URL(url).host } });
    assert.equal(nf.status, 404); assert.deepEqual(Object.keys(JSON.parse(nf.text)).sort(), ['error', 'message']);
  });
});

test('Mock is zero-outbound: a whole session through the API under the netguard makes no attempt', async () => {
  const g = installNetguard();
  try {
    await withServer(async (url) => {
      for (const id of ['support-p1', 'happy-path', 'link-pitfalls', 'revoke-by-delete']) await post(url, `/api/scenarios/${id}/run`, {});
      await act(url, 'app.sync');
      await get(url, '/api/story'); await get(url, '/api/state');
    });
    assert.deepEqual(g.attempts, []);
  } finally { g.restore(); }
});

test('the story is served with no label state, only the simulation banner', async () => {
  await withServer(async (url) => {
    const s = await json(await get(url, '/api/story'));
    for (const k of ['labels', 'labInvented', 'signInOrder', 'observedLabel', 'claims', 'durations']) assert.ok(!(k in s), k);
    assert.equal(s.banner.mock, 'Simulated: every behaviour shown was recorded in one real Privilege and Salesforce run.');
    assert.ok(s.troubleshooting.length >= 12 && s.outcomes.length === 9 && s.talkTrack.length >= 6);
    assert.deepEqual(s.verticals, ['finance', 'health', 'retail']);
    assert.ok(!('reaper.run' in Object.fromEntries(s.ops.map((o) => [o, 1]))) && !s.ops.includes('drift.revoke') && s.ops.includes('support.requestAccess'));
  });
});