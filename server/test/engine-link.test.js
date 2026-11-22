// Linking: identical email only, Federation ID does not rescue it, a shared email is refused, seats and usernames.
import test from 'node:test';
import assert from 'node:assert/strict';
import { C, presetEngine, run, attempt } from './helpers.js';

const rowOf = (e, id) => e.snapshot().privilege.users.find((r) => r.privilegeUserId === id);

test('a user with a unique email and a Salesforce user with that exact email links on the first Sync', () => {
  const e = presetEngine('connected-app');
  run(e, 'users.add', { privilegeUserId: 'pu-a' });
  assert.equal(rowOf(e, 'pu-a').status, 'waiting');
  assert.equal(rowOf(e, 'pu-a').reason, 'Waiting for Salesforce');
  const s = run(e, 'app.sync');
  assert.deepEqual(s.linked, ['pu-a']);
  assert.equal(rowOf(e, 'pu-a').status, 'linked');
  assert.equal(rowOf(e, 'pu-a').profile, 'Minimum Access - Salesforce');
});

test('two Privilege records sharing an email are both refused with "its email matches 2 Privilege users"', () => {
  const e = presetEngine('connected-app');
  run(e, 'users.add', { privilegeUserId: 'pu-dup1' }); run(e, 'users.add', { privilegeUserId: 'pu-dup2' });
  const s = run(e, 'app.sync');
  assert.deepEqual(s.refused.sort(), ['pu-dup1', 'pu-dup2']);
  for (const id of ['pu-dup1', 'pu-dup2']) { assert.match(rowOf(e, id).reason, /its email matches 2 Privilege users/); assert.equal(rowOf(e, id).status, 'waiting'); }
  // a Salesforce user with that exact email exists for dup1, and it still does not link
  assert.ok(e.snapshot().salesforce.users.some((u) => u.email === C.castDupEmail));
});

test('the refusal is lifted for a user whose email is unique; the shared pair stays refused', () => {
  const e = presetEngine('connected-app');
  for (const id of ['pu-dup1', 'pu-dup2', 'pu-a']) run(e, 'users.add', { privilegeUserId: id });
  run(e, 'app.sync');
  assert.equal(rowOf(e, 'pu-a').status, 'linked');
  assert.equal(rowOf(e, 'pu-dup1').status, 'waiting');
});

test('a Federation ID does not rescue a mismatched email', () => {
  const e = presetEngine('connected-app');
  run(e, 'sf.createUser', { name: C.castFName, email: C.castFSfEmail, username: C.castFUsername });
  run(e, 'sf.setFederationId', { userId: 'sfu-4', federationId: C.castFFederationId });
  run(e, 'users.add', { privilegeUserId: 'pu-f' });
  run(e, 'app.sync');
  assert.equal(rowOf(e, 'pu-f').status, 'waiting');
  assert.match(rowOf(e, 'pu-f').reason, /Federation ID did not override this/);
});

test('matching is by exactly identical email: a different case does not link', () => {
  const e = presetEngine('connected-app');
  run(e, 'sf.createUser', { name: C.castCName, email: C.castCEmail.toUpperCase(), username: C.castCUsername });
  run(e, 'users.add', { privilegeUserId: 'pu-c' });
  run(e, 'app.sync');
  assert.equal(rowOf(e, 'pu-c').status, 'waiting');
});

test('someone without a Salesforce user waits; it never creates one; the user links after an admin creates it and Sync runs', () => {
  const e = presetEngine('connected-app');
  const before = e.snapshot().salesforce.users.length;
  run(e, 'users.add', { privilegeUserId: 'pu-c' });
  run(e, 'app.sync');
  assert.equal(e.snapshot().salesforce.users.length, before, 'Privilege created no Salesforce user');
  assert.match(rowOf(e, 'pu-c').reason, /no Salesforce user has this exact email/);
  run(e, 'sf.createUser', { name: C.castCName, email: C.castCEmail, username: C.castCUsername });
  assert.equal(rowOf(e, 'pu-c').status, 'waiting', 'not before a Sync');
  run(e, 'app.sync');
  assert.equal(rowOf(e, 'pu-c').status, 'linked');
});

test('Add Users: needs an application, an existing Privilege user, and once only', () => {
  const e = presetEngine('ready');
  assert.equal(attempt(e, 'users.add', { privilegeUserId: 'pu-a' }).code, 'no_application');
  run(e, 'app.create', { name: C.castAppName });
  assert.equal(attempt(e, 'users.add', { privilegeUserId: 'pu-nobody' }).code, 'unknown_privilege_user');
  run(e, 'users.add', { privilegeUserId: 'pu-a' });
  assert.equal(attempt(e, 'users.add', { privilegeUserId: 'pu-a' }).code, 'already_added');
  assert.equal(attempt(e, 'users.add', { privilegeUserId: '../x' }).code, 'bad_id');
  assert.equal(attempt(e, 'users.add', { privilegeUserId: '__proto__' }).code, 'bad_id');
  assert.equal(attempt(e, 'users.add', { privilegeUserId: 'constructor' }).code, 'unknown_privilege_user');
});

test('Salesforce: a Developer org has 4 seats ("No Salesforce licenses available"), freed by deactivating a user', () => {
  const e = presetEngine('connected-app');
  assert.deepEqual(e.snapshot().salesforce.licenses, { total: 4, used: 3, free: 1 });
  run(e, 'sf.createUser', { name: C.castFName, email: C.castFSfEmail, username: C.castFUsername });
  const r = attempt(e, 'sf.createUser', { name: C.castCName, email: C.castCEmail, username: C.castCUsername });
  assert.equal(r.code, 'no_licenses'); assert.equal(r.message, 'No Salesforce licenses available');
  run(e, 'sf.deactivateUser', { userId: 'sfu-4' });
  assert.equal(run(e, 'sf.createUser', { name: C.castCName, email: C.castCEmail, username: C.castCUsername }).seatsUsed, 4);
});

test('Salesforce: a username is unique across all orgs ("Duplicate username"); changing the username and keeping the email works', () => {
  const e = presetEngine('connected-app');
  const taken = attempt(e, 'sf.createUser', { name: C.castCName, email: C.castCEmail, username: C.castTakenUsername });
  assert.equal(taken.code, 'duplicate_username'); assert.equal(taken.message, 'Duplicate username');
  assert.equal(attempt(e, 'sf.createUser', { name: C.castCName, email: C.castCEmail, username: C.castAUsername }).code, 'duplicate_username', 'a username in this org too');
  assert.ok(run(e, 'sf.createUser', { name: C.castCName, email: C.castCEmail, username: C.castCUsername }).id);
});

test('sf.createUser validates its text and its email', () => {
  const e = presetEngine('connected-app');
  assert.equal(attempt(e, 'sf.createUser', { name: 'X', email: 'not-an-email', username: 'u@x.example' }).code, 'bad_email');
  assert.equal(attempt(e, 'sf.createUser', { name: '', email: C.castCEmail, username: 'u@x.example' }).code, 'bad_field');
  assert.equal(attempt(e, 'sf.createUser', { name: 5, email: C.castCEmail, username: 'u@x.example' }).code, 'bad_field');
  assert.equal(attempt(e, 'sf.createUser', { name: 'x'.repeat(500), email: C.castCEmail, username: 'u@x.example' }).code, 'too_long');
});

test('Privilege records are read-only: there is no op to edit one, and the directory marks the shared email', () => {
  const e = presetEngine('fresh');
  const dir = e.snapshot().privilege.directory;
  assert.ok(dir.every((u) => u.readOnly));
  assert.deepEqual(dir.filter((u) => u.sharedEmail).map((u) => u.id).sort(), ['pu-dup1', 'pu-dup2']);
});
