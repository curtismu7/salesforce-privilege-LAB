// Grant, receipts, revoke by deleting the policy, the removed behaviours (reaper, drift) and downstream failures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { C, presetEngine, run, attempt } from './helpers.js';

const HOUR = 60; const DAY = 1440;
const assignedTo = (e, userId) => e.snapshot().salesforce.assignments.filter((a) => a.userId === userId).map((a) => a.setId);
const grant = (e, o = {}) => attempt(e, 'policy.grant', { privilegeUserId: 'pu-a', permSetId: 'ps-1', durationMin: HOUR, ...o });
const status = (e) => e.snapshot().privilege.receipts.map((r) => r.status);

test('grant: a plain permission set is assigned for real in the mock org, the receipt says Granted and reconciliation reads 1 confirmed', () => {
  const e = presetEngine('connected');
  const g = grant(e);
  assert.equal(g.ok, true);
  assert.deepEqual(assignedTo(e, 'sfu-2'), ['ps-1']);
  assert.deepEqual(status(e), ['Granted']);
  const r = e.snapshot().privilege.reconcile;
  assert.deepEqual(r.counts, { confirmed: 1, revokePending: 0 });
  assert.equal(r.policies.active, 1);
  const p = e.snapshot().privilege.policies[0];
  assert.equal(p.endAt - p.startAt, HOUR);
});

test('the guide\'s four grant-dialog observations: a plain set, "Needs a permission set license", "License Salesforce ≠ <other>", "Already has this permission set"', () => {
  const e = presetEngine('connected');
  const lic = grant(e, { permSetId: 'ps-2' });
  assert.equal(lic.code, 'needs_permission_set_license'); assert.equal(lic.message, 'Needs a permission set license');
  const other = grant(e, { permSetId: 'ps-3' });
  assert.equal(other.code, 'license_mismatch'); assert.equal(other.message, `License Salesforce ≠ ${C.castOtherLicense}`);
  assert.equal(grant(e).ok, true);
  const again = grant(e);
  assert.equal(again.code, 'already_has_permission_set'); assert.equal(again.message, 'Already has this permission set');
  assert.deepEqual(assignedTo(e, 'sfu-2'), ['ps-1'], 'a refusal assigns nothing');
});

test('a set the user already holds by hand cannot be granted either', () => {
  const e = presetEngine('connected');
  run(e, 'sf.assignPermissionSet', { userId: 'sfu-2', permSetId: 'ps-1' });
  assert.equal(grant(e).code, 'already_has_permission_set');
});

test('who and what can be granted: a linked user, a set that is in the synced Permissions list, a bounded duration', () => {
  const e = presetEngine('connected-app');
  assert.equal(grant(e).code, 'user_not_linked');
  const f = presetEngine('connected');
  run(f, 'sf.createPermissionSet', { label: C.castPermSet2 });
  assert.equal(grant(f, { permSetId: 'ps-5' }).code, 'unknown_permission', 'created in Salesforce but not synced yet');
  run(f, 'app.sync');
  assert.equal(grant(f, { permSetId: 'ps-5' }).ok, true);
  for (const bad of [0, -1, 1.5, '60', null, NaN, 366 * DAY + 1, undefined]) assert.equal(grant(f, { permSetId: 'ps-1', durationMin: bad }).code, 'bad_number', String(bad));
  assert.equal(grant(f, { permSetId: 'nope-id', durationMin: 5 }).code, 'unknown_permission');
  assert.equal(grant(f, { permSetId: 'ps-1', durationMin: 366 * DAY }).ok, true, 'a year is the longest offered window');
});

test('delete the policy: "Revoke pending, access still live", the assignment is still in Salesforce until the next reconcile, then it is gone and the receipt is Revoked', () => {
  const e = presetEngine('connected');
  grant(e);
  const d = run(e, 'policy.delete', { policyId: 'pol-0001' });
  assert.equal(d.status, 'Revoke pending, access still live');
  assert.deepEqual(status(e), ['Revoke pending, access still live']);
  assert.deepEqual(assignedTo(e, 'sfu-2'), ['ps-1'], 'access is still live');
  assert.equal(e.snapshot().privilege.reconcile.counts.revokePending, 1);
  const r = run(e, 'app.reconcile');
  assert.deepEqual(r.removed, ['pol-0001']);
  assert.deepEqual(assignedTo(e, 'sfu-2'), []);
  assert.deepEqual(status(e), ['Revoked']);
  const rc = e.snapshot().privilege.reconcile;
  assert.deepEqual(rc.policies, { active: 0, revokePending: 0, expiredRevoked: 1 });
  assert.deepEqual(rc.counts, { confirmed: 0, revokePending: 0 });
});

test('Sync clears a pending revoke too', () => {
  const e = presetEngine('connected');
  grant(e); run(e, 'policy.delete', { policyId: 'pol-0001' });
  const s = run(e, 'app.sync');
  assert.deepEqual(s.removed, ['pol-0001']);
  assert.deepEqual(assignedTo(e, 'sfu-2'), []);
});

test('deleting a policy that is unknown, ended or already pending is refused', () => {
  const e = presetEngine('connected');
  assert.equal(attempt(e, 'policy.delete', { policyId: 'pol-0009' }).code, 'unknown_policy');
  grant(e); run(e, 'policy.delete', { policyId: 'pol-0001' });
  assert.equal(attempt(e, 'policy.delete', { policyId: 'pol-0001' }).code, 'policy_not_active');
  run(e, 'app.reconcile');
  assert.equal(attempt(e, 'policy.delete', { policyId: 'pol-0001' }).code, 'policy_not_active');
});

test('nothing ends a grant by itself: moving the lab clock past the end time leaves the assignment, the policy and the receipt as they were', () => {
  const e = presetEngine('connected');
  grant(e);
  const r = run(e, 'clock.advance', { minutes: 5 * DAY });
  assert.deepEqual(Object.keys(r), ['now']);
  assert.deepEqual(assignedTo(e, 'sfu-2'), ['ps-1']);
  assert.deepEqual(status(e), ['Granted']);
  assert.equal(e.snapshot().privilege.policies[0].status, 'active');
  assert.equal(e.snapshot().privilege.reconcile.counts.confirmed, 1);
});

test('the reaper and the drift operations are gone: they are unknown ops, and the reconciliation has no discovered or orphaned counts', () => {
  const e = presetEngine('connected');
  for (const op of ['reaper.run', 'drift.revoke']) { const r = attempt(e, op, {}); assert.equal(r.ok, false, op); assert.equal(r.code, 'unknown_op', op); }
  run(e, 'sf.assignPermissionSet', { userId: 'sfu-2', permSetId: 'ps-1' });
  const rc = run(e, 'app.reconcile').reconcile;
  assert.deepEqual(Object.keys(rc.counts).sort(), ['confirmed', 'revokePending']);
  assert.ok(!('findings' in rc));
  assert.deepEqual(rc.counts, { confirmed: 0, revokePending: 0 }, 'access assigned by hand is not counted or classified');
  assert.ok(!/reaped|findings|discovered|orphaned/.test(JSON.stringify(e.snapshot())));
});

test('the lab clock only moves forward, in whole bounded steps', () => {
  const e = presetEngine('fresh');
  for (const bad of [0, -5, 1.5, '10', null, 800 * DAY + 1]) assert.equal(attempt(e, 'clock.advance', { minutes: bad }).code, 'bad_number', String(bad));
  const t0 = e.snapshot().clock.nowMin;
  run(e, 'clock.advance', { minutes: 800 * DAY });
  assert.equal(e.snapshot().clock.nowMin, t0 + 800 * DAY);
});

test('downstream failure: when Privilege can no longer sign in, a grant is a structured 502 and nothing changes', () => {
  const e = presetEngine('connected');
  run(e, 'sf.createPermissionSet', { label: C.castPermSet2 }); run(e, 'app.sync');
  const before = JSON.stringify([e.snapshot().salesforce.assignments, e.snapshot().privilege.policies, e.snapshot().privilege.receipts]);
  run(e, 'sf.setPermittedUsers', { policy: 'self_authorize' });
  const g = grant(e, { permSetId: 'ps-5' });
  assert.equal(g.ok, false); assert.equal(g.status, 502); assert.equal(g.code, 'salesforce_sign_in_failed'); assert.equal(g.outcome.id, 'not_preauthorized');
  assert.equal(e.snapshot().privilege.app.syncStatus, 'Error');
  assert.equal(JSON.stringify([e.snapshot().salesforce.assignments, e.snapshot().privilege.policies, e.snapshot().privilege.receipts]), before, 'state unchanged');
  run(e, 'sf.setPermittedUsers', { policy: 'admin_preauthorized' });
  assert.equal(grant(e, { permSetId: 'ps-5' }).ok, true);
  assert.equal(e.snapshot().privilege.app.syncStatus, 'Ready');
});

test('a removal that cannot sign in is a 502 and stays queued as Revoke pending, access still live, until Privilege can sign in again', () => {
  const e = presetEngine('connected');
  grant(e); run(e, 'policy.delete', { policyId: 'pol-0001' });
  run(e, 'sf.setPermittedUsers', { policy: 'self_authorize' });
  const r = attempt(e, 'app.reconcile');
  assert.equal(r.ok, false); assert.equal(r.status, 502); assert.equal(r.code, 'salesforce_sign_in_failed');
  assert.equal(e.snapshot().privilege.policies[0].status, 'revoke_pending');
  assert.deepEqual(status(e), ['Revoke pending, access still live']);
  assert.deepEqual(assignedTo(e, 'sfu-2'), ['ps-1']);
  run(e, 'sf.setPermittedUsers', { policy: 'admin_preauthorized' });
  assert.deepEqual(run(e, 'app.reconcile').removed, ['pol-0001']);
  assert.deepEqual(assignedTo(e, 'sfu-2'), []);
});

test('a regenerate without re-uploading breaks Privilege\'s own sign-in (the key is the wizard\'s current one)', () => {
  const e = presetEngine('connected');
  run(e, 'wizard.regenerateKey');
  assert.equal(attempt(e, 'app.sync').code, 'salesforce_sign_in_failed');
});

test('bounds: the workspace takes 200 policies and then refuses with workspace_full instead of dropping anything', () => {
  const e = presetEngine('connected');
  for (let i = 0; i < 200; i += 1) { assert.equal(grant(e, { durationMin: 1 }).ok, true, `grant ${i}`); run(e, 'policy.delete', { policyId: e.snapshot().privilege.policies.at(-1).id }); run(e, 'app.reconcile'); }
  assert.equal(e.snapshot().privilege.policies.length, 200);
  assert.equal(grant(e, { durationMin: 1 }).code, 'workspace_full');
  assert.equal(e.snapshot().privilege.policies.length, 200);
});

test('Reset restores the whole world, the clock included', () => {
  const e = presetEngine('connected');
  grant(e); run(e, 'clock.advance', { minutes: 500 });
  e.reset();
  const s = e.snapshot();
  assert.equal(s.clock.nowMin, 0); assert.equal(s.privilege.app, null); assert.equal(s.salesforce.externalClientApp, null); assert.equal(s.privilege.policies.length, 0);
});

test('the snapshot never carries a private key, and is JSON-serialisable', () => {
  const e = presetEngine('connected');
  const text = JSON.stringify(e.snapshot());
  assert.ok(!/BEGIN [A-Z ]*PRIVATE KEY|privateKey|private_key/i.test(text));
  assert.ok(text.length > 100);
});
