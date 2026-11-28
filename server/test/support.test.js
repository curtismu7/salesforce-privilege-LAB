// The Support P1 story: visibility of Cases is derived from the Salesforce assignment, the request carries a note and an end time, and ending access is
// deleting the policy. Nothing here ends access by itself, and nothing claims Privilege stores the note.
import test from 'node:test';
import assert from 'node:assert/strict';
import { C, presetEngine, run, attempt, newEngine, withServer, act, get, post } from './helpers.js';
import { VERTICALS } from '../src/cast.js';
import { LAB_START, parseIsoInstant } from '../src/engine.js';
import { scenarioById, runScenario } from '../src/scenarios.js';

const END = '2026-11-02T11:00:00Z';
const request = (e, o = {}) => attempt(e, 'support.requestAccess', { note: 'P1: need to read the case history', endAt: END, ...o });
const sup = (e) => e.snapshot().support;
const ready = (cast = C) => presetEngine('connected', cast);

test('on load the engineer has no access: Cases is denied and the answer carries no title, no count and no case at all', () => {
  const e = ready();
  const s = sup(e);
  assert.equal(s.ready, true); assert.equal(s.canSeeCases, false); assert.equal(s.cases, null);
  assert.equal(s.engineer.name, C.castAName); assert.equal(s.engineer.profile, 'Minimum Access - Salesforce');
  const text = JSON.stringify(e.snapshot());
  for (const t of [C.castCaseP1Title, C.castCase2Title, C.castCase3Title, '00001041']) assert.ok(!text.includes(t), `no leak of ${t}`);
  assert.ok(!/"cases":\[|caseCount|totalCases/.test(text));
});

test('a request with a note and an end time: Privilege grants it, the engineer sees the P1 and two other cases, the receipt says Granted', () => {
  const e = ready();
  const r = request(e);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.result.receipt, 'Granted'); assert.equal(r.result.request.note, 'P1: need to read the case history'); assert.equal(r.result.endAt, '2026-11-02T11:00:00.000Z');
  const s = sup(e);
  assert.equal(s.canSeeCases, true); assert.equal(s.cases.length, 3);
  assert.deepEqual(s.cases.map((c) => c.priority), ['P1', 'P2', 'P3']);
  assert.equal(s.cases[0].title, C.castCaseP1Title);
  assert.equal(s.access.status, 'active'); assert.equal(s.requests.length, 1);
  assert.deepEqual(e.snapshot().privilege.receipts.map((x) => x.status), ['Granted']);
  assert.deepEqual(e.snapshot().privilege.reconcile.counts, { confirmed: 1 });
});

test('visibility is DERIVED from the assignment: delete the policy and Cases is still visible while Revoke pending, then gone; nothing else changes it', () => {
  const e = ready();
  assert.equal(sup(e).canSeeCases, false);
  run(e, 'clock.advance', { minutes: 90 }); run(e, 'app.sync');
  assert.equal(sup(e).canSeeCases, false, 'a clock move or a Sync changes nothing');
  request(e);
  assert.equal(sup(e).canSeeCases, true);
  run(e, 'clock.advance', { minutes: 3 * 1440 }); run(e, 'app.sync'); run(e, 'sf.createPermissionSet', { label: C.castPermSet2 });
  assert.equal(sup(e).canSeeCases, true, 'the end time passing ends nothing');
  const pid = sup(e).access.policyId;
  run(e, 'policy.delete', { policyId: pid });
  assert.equal(sup(e).canSeeCases, true, 'Revoke pending, access still live');
  assert.equal(sup(e).access.status, 'revoke_pending');
  assert.deepEqual(e.snapshot().privilege.receipts.map((x) => x.status), ['Granted'], 'only the policy reads pending');
  run(e, 'app.reconcile');
  assert.equal(sup(e).canSeeCases, false); assert.equal(sup(e).cases, null); assert.equal(sup(e).access, null);
  assert.deepEqual(e.snapshot().privilege.receipts.map((x) => x.status), ['Expired / Revoked']);
  assert.ok(!JSON.stringify(e.snapshot()).includes(C.castCaseP1Title));
});

test('the same rule for an assignment made by hand in Salesforce and for one removed by hand; another set changes nothing', () => {
  const e = ready();
  run(e, 'sf.assignPermissionSet', { userId: 'sfu-2', permSetId: 'ps-1' });
  assert.equal(sup(e).canSeeCases, true);
  run(e, 'sf.removeAssignment', { userId: 'sfu-2', permSetId: 'ps-1' });
  assert.equal(sup(e).canSeeCases, false);
  run(e, 'sf.createPermissionSet', { label: C.castPermSet2 }); run(e, 'app.sync');
  run(e, 'policy.grant', { privilegeUserId: 'pu-a', permSetId: 'ps-5', durationMin: 60 });
  assert.equal(sup(e).canSeeCases, false, 'holding a different set does not open Cases');
});

test('reconciliation reads 1 confirmed only while the Salesforce assignment really exists', () => {
  const e = ready();
  request(e);
  assert.equal(run(e, 'app.reconcile').reconcile.counts.confirmed, 1);
  run(e, 'sf.removeAssignment', { userId: 'sfu-2', permSetId: 'ps-1' });
  assert.equal(run(e, 'app.reconcile').reconcile.counts.confirmed, 0, 'the policy is active but Salesforce does not hold the assignment');
});

test('the note is bounded and inert: HTML, bidi and zero-width characters, __proto__ and 200 characters are taken as plain text; over 200 and credential-shaped text are refused whole', () => {
  const hostile = '<img src=x onerror=alert(1)> ‮evil​ __proto__ {{castBrand}}';
  const e = ready();
  const r = request(e, { note: hostile });
  assert.equal(r.ok, true);
  const note = sup(e).requests[0].note;
  assert.ok(!/[‮​]/.test(note)); assert.equal(note, '<img src=x onerror=alert(1)> evil __proto__ {{castBrand}}', 'stored as typed text; the page renders it as text');
  const f = ready();
  assert.equal(request(f, { note: 'x'.repeat(200) }).ok, true);
  const g = ready();
  for (const [note, code] of [['x'.repeat(201), 'too_long'], ['', 'bad_field'], ['   ', 'bad_field'], ['​‮', 'bad_field'], [7, 'bad_field'], [null, 'bad_field'], ['password=' + 'ghp_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8', 'credential_like_text']]) {
    const x = request(g, { note }); assert.equal(x.ok, false, String(note).slice(0, 12)); assert.equal(x.code, code);
    assert.ok(!JSON.stringify(x).includes('a1B2c3'), 'a refusal never echoes the text');
  }
  assert.equal(sup(g).requests.length, 0); assert.equal(sup(g).canSeeCases, false); assert.equal(g.snapshot().privilege.policies.length, 0, 'a refused request changes nothing');
});

test('the end time must be an ISO 8601 date and time with Z or an offset, on a whole lab minute, after the lab clock now and within 366 days; a refusal changes nothing', () => {
  const e = ready();
  const nowIso = new Date(LAB_START + e.snapshot().clock.nowMin * 60000).toISOString();
  for (const bad of ['', 'tomorrow', 'x'.repeat(41), nowIso, '2026-11-02T09:00:00Z', '2025-01-01T00:00:00Z', '2030-01-01T00:00:00Z', 7, null, undefined,
    '2026-11-02 11:00:00', '2026-11-02T11:00:00', '2026-11-02', '11/02/2026 11:00', '2026-11-02T11:00', 'Nov 2 2026 11:00 UTC', '2026-11-02T11:00:00 Z', '2026-02-31T11:00:00Z',
    '2026-11-02T11:00:30Z', '2026-11-02T11:00:00.500Z',
    '2026-11-02T24:00:00Z', '2026-13-02T11:00:00Z', '2026-11-31T11:00:00Z', '2026-00-10T11:00:00Z', '2026-11-00T11:00:00Z', '2026-11-02T11:60:00Z', '2026-11-02T11:00:60Z', '2026-11-02T11:00:00+24:00', '2026-11-02T11:00:00+01:60', '2027-02-29T11:00:00Z']) {
    const x = request(e, { endAt: bad }); assert.equal(x.ok, false, String(bad)); assert.equal(x.code, 'bad_end_time', String(bad));
  }
  assert.equal(e.snapshot().privilege.policies.length, 0); assert.equal(sup(e).canSeeCases, false);
  assert.equal(request(e, { endAt: '2026-11-02T09:11:00Z' }).ok, true, 'one minute after the clock is the least');
  const f = ready();
  assert.equal(request(f, { endAt: '2026-11-02T12:00:00+01:00' }).ok, true, 'an offset is understood: 11:00 UTC');
  assert.equal(sup(f).requests[0].endAt, '2026-11-02T11:00:00.000Z');
  const g = ready();
  assert.equal(request(g, { endAt: '2026-11-02T11:00:00.000Z' }).ok, true);
});

test('a row that looks linked but is still waiting is not the engineer linked: user_not_linked, nothing granted (mutant M20)', () => {
  const e = presetEngine('connected-app');
  run(e, 'users.add', { privilegeUserId: 'pu-a' });
  assert.equal(e.snapshot().privilege.users[0].status, 'waiting');
  assert.equal(sup(e).ready, false);
  const r = request(e);
  assert.equal(r.code, 'user_not_linked'); assert.equal(r.status, 409);
  assert.equal(e.snapshot().privilege.policies.length, 0); assert.equal(sup(e).requests.length, 0);
  assert.equal(attempt(e, 'policy.grant', { privilegeUserId: 'pu-a', permSetId: 'ps-1', durationMin: 60 }).code, 'user_not_linked');
});

test('Reset clears the story\'s requests as well as the world (mutant M16)', () => {
  const e = ready();
  request(e);
  assert.equal(sup(e).requests.length, 1);
  e.reset();
  assert.equal(sup(e).requests.length, 0); assert.equal(sup(e).canSeeCases, false); assert.equal(sup(e).ready, false); assert.equal(e.snapshot().privilege.receipts.length, 0);
  assert.equal(e.support.requests.length, 0);
});

test('the licence refusal reads "License Salesforce ≠ Cloud Integration User" in every vertical', () => {
  for (const [v, cast] of Object.entries(VERTICALS)) {
    const e = presetEngine('connected', cast);
    const r = attempt(e, 'policy.grant', { privilegeUserId: 'pu-a', permSetId: 'ps-3', durationMin: 60 });
    assert.equal(r.message, 'License Salesforce ≠ Cloud Integration User', v);
  }
});

test('requesting again while the access is live gives the guide\'s "Already has this permission set" and changes nothing', () => {
  const e = ready();
  request(e);
  const before = JSON.stringify([e.snapshot().privilege.policies, e.snapshot().privilege.receipts, sup(e).requests]);
  const again = request(e);
  assert.equal(again.code, 'already_has_permission_set'); assert.equal(again.message, 'Already has this permission set');
  assert.equal(JSON.stringify([e.snapshot().privilege.policies, e.snapshot().privilege.receipts, sup(e).requests]), before);
  run(e, 'policy.delete', { policyId: 'pol-0001' });
  assert.equal(request(e).code, 'already_has_permission_set', 'still held while Revoke pending');
  run(e, 'app.reconcile');
  assert.equal(request(e).ok, true, 'after Revoked a new request is a new grant');
  assert.equal(sup(e).requests.length, 2);
});

test('ending access twice, or when nothing is granted, is a named refusal and changes nothing', () => {
  const e = ready();
  assert.equal(attempt(e, 'policy.delete', { policyId: 'pol-0001' }).code, 'unknown_policy');
  request(e); run(e, 'policy.delete', { policyId: 'pol-0001' });
  const before = JSON.stringify(e.snapshot().privilege);
  const twice = attempt(e, 'policy.delete', { policyId: 'pol-0001' });
  assert.equal(twice.code, 'policy_not_active'); assert.match(twice.message, /already ended or being revoked/);
  assert.equal(JSON.stringify(e.snapshot().privilege), before);
});

test('when Privilege cannot sign in to Salesforce the request is a named 502, salesforce_sign_in_failed, and no request, policy, receipt or assignment is made', () => {
  const e = ready();
  run(e, 'sf.setPermittedUsers', { policy: 'self_authorize' });
  const r = request(e);
  assert.equal(r.status, 502); assert.equal(r.code, 'salesforce_sign_in_failed'); assert.equal(r.outcome.id, 'not_preauthorized');
  assert.equal(sup(e).requests.length, 0); assert.equal(e.snapshot().privilege.policies.length, 0); assert.equal(e.snapshot().privilege.receipts.length, 0); assert.equal(sup(e).canSeeCases, false);
});

test('the story needs the world it starts from: no application, or an engineer who is not linked, is a named refusal', () => {
  const f = newEngine();
  assert.equal(sup(f).ready, false);
  assert.equal(request(f).code, 'no_application');
  const g = presetEngine('connected-app');
  assert.equal(sup(g).ready, false);
  assert.equal(request(g).code, 'user_not_linked');
});

test('the vertical changes the case titles and names, not the mechanics', () => {
  const titles = new Set();
  for (const [v, cast] of Object.entries(VERTICALS)) {
    const e = presetEngine('connected', cast);
    assert.equal(sup(e).canSeeCases, false, v);
    assert.equal(attempt(e, 'support.requestAccess', { note: 'a note', endAt: END }).ok, true, v);
    const s = sup(e);
    assert.equal(s.permissionSet, 'Case Read Access', v); assert.equal(s.cases.length, 3, v); assert.equal(s.cases.filter((c) => c.priority === 'P1').length, 1, v);
    assert.equal(s.cases[0].title, cast.castCaseP1Title, v); assert.equal(s.engineer.name, cast.castAName, v);
    assert.ok(!/\{\{/.test(JSON.stringify(s)), v);
    titles.add(s.cases[0].title);
  }
  assert.equal(titles.size, Object.keys(VERTICALS).length);
});

test('the scripted scenario ends where it began: Cases denied, receipt Expired / Revoked, in every vertical', () => {
  for (const [v, cast] of Object.entries(VERTICALS)) {
    const r = runScenario(cast, scenarioById('support-p1'));
    assert.ok(r.ok, v);
    assert.equal(r.engine.snapshot().support.canSeeCases, false, v);
    assert.deepEqual(r.engine.snapshot().privilege.receipts.map((x) => x.status), ['Expired / Revoked'], v);
    const mid = runScenario(cast, scenarioById('support-p1'), { upTo: 2 });
    assert.equal(mid.engine.snapshot().support.canSeeCases, true, v);
  }
});

test('over HTTP: /api/actions is the one write; a hostile note comes back as text, a bad key is refused, Real refuses the write', async () => {
  await withServer(async (url) => {
    assert.equal((await post(url, '/api/scenarios/support-p1/run', { upTo: 0 })).status, 200);
    const st = await (await get(url, '/api/state')).json();
    assert.equal(st.state.support.ready, true); assert.equal(st.state.support.canSeeCases, false); assert.equal(st.state.support.cases, null);
    const r = await act(url, 'support.requestAccess', { note: '<script>alert(1)</script>', endAt: END }, { refusalsAs200: true });
    const b = await r.json(); assert.equal(b.ok, true); assert.equal(b.state.support.requests[0].note, '<script>alert(1)</script>'); assert.equal(b.state.support.canSeeCases, true);
    assert.equal((await act(url, 'support.requestAccess', { note: 'x', endAt: END, evil: 1 })).status, 400, 'a key the op does not take is refused whole');
    const dup = await (await act(url, 'support.requestAccess', { note: 'x', endAt: END }, { refusalsAs200: true })).json();
    assert.equal(dup.ok, false); assert.equal(dup.error, 'already_has_permission_set');
  });
});

test('endAt is parsed strictly: calendar-invalid dates and out-of-range components are NaN, never rolled over; leap days, offsets and fractions are understood', () => {
  for (const bad of ['2026-02-31T10:00:00Z', '2026-11-02T24:00:00Z', '2027-02-29T10:00:00Z', '2100-02-29T10:00:00Z', '2026-04-31T10:00:00Z', '2026-11-02T10:00:60Z', '2026-11-02T10:00:00+24:00', '2026-11-02T10:00:00-00:60', '2026-11-02', '', 7, null]) assert.ok(Number.isNaN(parseIsoInstant(bad)), String(bad));
  assert.equal(parseIsoInstant('2028-02-29T10:00:00Z'), Date.UTC(2028, 1, 29, 10)); assert.equal(parseIsoInstant('2000-02-29T00:00:00Z'), Date.UTC(2000, 1, 29));
  assert.equal(parseIsoInstant('2026-11-02T12:30:00+01:30'), Date.UTC(2026, 10, 2, 11)); assert.equal(parseIsoInstant('2026-11-02T10:00:00.250Z'), Date.UTC(2026, 10, 2, 10, 0, 0, 250));
  assert.equal(parseIsoInstant('2026-11-02T10:00Z'), Date.UTC(2026, 10, 2, 10));
});
