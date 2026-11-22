// The wizard rehearsal: every sign-in outcome the guide records, in the order a person meets them, each with its cause and exact fix.
import test from 'node:test';
import assert from 'node:assert/strict';
import { C, newEngine, presetEngine, run, attempt } from './helpers.js';
import { OUTCOMES, OBSERVED, labelFor } from '../src/data.js';

const DAY = 1440;
const signIn = (e, o = {}) => attempt(e, 'wizard.signIn', { consumerKey: C.castConsumerKey, username: C.castAdminUsername, ...o });

function prepared({ scopes = ['api', 'refresh_token'], jwt = true, preauth = true, link = true, assign = true, wait = true } = {}) {
  const e = newEngine();
  run(e, 'wizard.orgUrl', { url: C.castWizardUrl }); run(e, 'wizard.generateKey');
  run(e, 'sf.createApp', { name: C.castEccName }); run(e, 'sf.setScopes', { scopes });
  if (jwt) run(e, 'sf.setJwtBearer', { enabled: true, certId: 'cert-1' });
  run(e, 'sf.setPermittedUsers', { policy: preauth ? 'admin_preauthorized' : 'self_authorize' });
  run(e, 'sf.createPermissionSet', { label: C.castIntegrationSet });
  if (link) run(e, 'sf.linkPermissionSet', { permSetId: 'ps-4' });
  if (assign) run(e, 'sf.assignPermissionSet', { userId: 'sfu-1', permSetId: 'ps-4' });
  if (wait) run(e, 'clock.advance', { minutes: 11 });
  return e;
}

test('a fully set up app signs in: the message names the host and the user, and the mock token is labelled', () => {
  const r = signIn(prepared());
  assert.equal(r.ok, true);
  assert.equal(r.result.message, `Signed in to ${C.castOrgHost} as ${C.castAdminUsername}`);
  assert.match(r.result.token.value, /^mock-sf-access-\d+$/);
  assert.match(r.result.token.label, /MOCK token issued by this lab, not a Salesforce token/);
});

test('each failure carries a stable code, a cause, the exact fix and the observed-on-one-org label', () => {
  const cases = [
    ['invalid_client_id', () => prepared(), { consumerKey: 'not-the-key' }],
    ['not_propagated', () => prepared({ wait: false }), {}],
    ['jwt_not_enabled', () => prepared({ jwt: false }), {}],
    ['missing_api_scope', () => prepared({ scopes: ['refresh_token'] }), {}],
    ['missing_refresh_scope', () => prepared({ scopes: ['api'] }), {}],
    ['not_preauthorized', () => prepared({ preauth: false }), {}],
    ['permset_not_linked', () => prepared({ link: false, assign: false }), {}],
    ['permset_not_assigned', () => prepared({ assign: false }), {}],
    ['wrong_username', () => prepared(), { username: C.castAdminEmail }],
    ['unknown_username', () => prepared(), { username: 'nobody@nowhere.example' }],
  ];
  for (const [id, make, over] of cases) {
    const r = signIn(make(), over);
    assert.equal(r.ok, false, id); assert.equal(r.code, id, id); assert.equal(r.status, 422, id);
    assert.equal(r.outcome.id, id); assert.equal(r.outcome.label, labelFor(OUTCOMES[id].basis)); assert.equal(r.outcome.basis, OUTCOMES[id].basis);
    assert.equal(r.outcome.cause, OUTCOMES[id].cause); assert.equal(r.outcome.fix, OUTCOMES[id].fix);
    assert.ok(r.outcome.cause.length > 10 && r.outcome.fix.length > 10, id);
  }
});

test('invalid_grant is what Salesforce said for the pre-authorization, link, assignment and propagation failures; the rest were not captured and are null, not invented', () => {
  for (const id of ['not_propagated', 'not_preauthorized', 'permset_not_linked', 'permset_not_assigned']) {
    assert.equal(OUTCOMES[id].sfError, 'invalid_grant', id);
    assert.equal(OUTCOMES[id].sfDescription, 'user hasn\'t approved this consumer', id);
  }
  assert.equal(OUTCOMES.invalid_client_id.sfError, 'invalid_client_id');
  for (const id of ['jwt_not_enabled', 'missing_refresh_scope', 'signature_mismatch', 'certificate_expired', 'wrong_username']) { assert.equal(OUTCOMES[id].sfError, null, id); assert.equal(OUTCOMES[id].sfDescription, null, id); }
});

test('"not propagated yet" lasts exactly 10 lab minutes after the app was created', () => {
  const e = prepared({ wait: false });
  run(e, 'clock.advance', { minutes: 9 });
  assert.equal(signIn(e).code, 'not_propagated');
  run(e, 'clock.advance', { minutes: 1 });
  assert.equal(signIn(e).ok, true);
});

test('the certificate: a regenerated key no longer matches the uploaded one; the matching upload fixes it; two years later it has expired', () => {
  const e = prepared();
  run(e, 'wizard.regenerateKey');
  assert.equal(signIn(e).code, 'signature_mismatch');
  run(e, 'sf.setJwtBearer', { enabled: true, certId: 'cert-2' });
  assert.equal(signIn(e).ok, true);
  run(e, 'clock.advance', { minutes: 729 * DAY });
  assert.equal(signIn(e).ok, true, 'one day before the two years are up');
  run(e, 'clock.advance', { minutes: 1 * DAY + 1 });
  assert.equal(signIn(e).code, 'certificate_expired');
});

test('a certificate from some other key never matches', () => {
  const e = prepared({ jwt: false });
  run(e, 'sf.setJwtBearer', { enabled: true, certId: 'cert-stranger' });
  assert.equal(signIn(e).code, 'signature_mismatch');
});

test('an inactive or non-Salesforce-licensed authorized user is refused with its own outcome', () => {
  const e = prepared();
  run(e, 'sf.deactivateUser', { userId: 'sfu-1' });
  assert.equal(signIn(e).code, 'user_inactive');
});

test('order of checks: the Consumer Key first, then propagation, then JWT, scopes, certificate, user, pre-authorization, link, assignment', () => {
  const e = prepared({ wait: false, jwt: false, scopes: [], preauth: false, link: false, assign: false });
  assert.equal(signIn(e, { consumerKey: 'x' }).code, 'invalid_client_id');
  assert.equal(signIn(e).code, 'not_propagated');
  run(e, 'clock.advance', { minutes: 11 });
  assert.equal(signIn(e).code, 'jwt_not_enabled');
  run(e, 'sf.setJwtBearer', { enabled: true, certId: 'cert-1' });
  assert.equal(signIn(e).code, 'missing_api_scope');
  run(e, 'sf.setScopes', { scopes: ['api'] });
  assert.equal(signIn(e).code, 'missing_refresh_scope');
  run(e, 'sf.setScopes', { scopes: ['api', 'refresh_token'] });
  assert.equal(signIn(e, { username: C.castAdminEmail }).code, 'wrong_username');
  assert.equal(signIn(e).code, 'not_preauthorized');
  run(e, 'sf.setPermittedUsers', { policy: 'admin_preauthorized' });
  assert.equal(signIn(e).code, 'permset_not_linked');
  run(e, 'sf.linkPermissionSet', { permSetId: 'ps-4' });
  assert.equal(signIn(e).code, 'permset_not_assigned');
  run(e, 'sf.assignPermissionSet', { userId: 'sfu-1', permSetId: 'ps-4' });
  assert.equal(signIn(e).ok, true);
});

test('the consumer key is hidden until the emailed verification code is entered; a wrong code is refused', () => {
  const e = prepared();
  assert.equal(e.snapshot().salesforce.externalClientApp.consumerKey, null);
  run(e, 'sf.requestKeyCode');
  assert.equal(attempt(e, 'sf.revealConsumerKey', { code: '000000' }).code, 'bad_verification_code');
  const r = run(e, 'sf.revealConsumerKey', { code: C.castKeyCode });
  assert.equal(r.consumerKey, C.castConsumerKey);
  assert.match(r.label, /MOCK/);
  assert.equal(e.snapshot().salesforce.externalClientApp.consumerKey, C.castConsumerKey);
});

test('the wizard order holds: org URL, then key, then sign-in, then create; one application per org; the name needs 4 characters', () => {
  const e = newEngine();
  assert.equal(attempt(e, 'wizard.generateKey').code, 'org_url_first');
  assert.equal(attempt(e, 'wizard.signIn', { consumerKey: 'a', username: 'b' }).code, 'key_first');
  assert.equal(attempt(e, 'wizard.regenerateKey').code, 'key_first');
  assert.equal(attempt(e, 'app.create', { name: 'Salesforce' }).code, 'sign_in_first');
  assert.equal(attempt(e, 'wizard.orgUrl', { url: 'https://other-org-dev-ed.develop.lightning.force.example/' }).code, 'org_unreachable');
  assert.equal(attempt(e, 'wizard.orgUrl', { url: 'https://other-org-dev-ed.develop.lightning.force.example/' }).status, 502);
  assert.equal(attempt(e, 'wizard.orgUrl', { url: 'http://x.example' }).code, 'not_an_org_url');
  assert.equal(attempt(e, 'wizard.orgUrl', { url: 'https://evil.invalid/' }).code, 'not_an_org_url');
  const ok = run(e, 'wizard.orgUrl', { url: `https://${C.castOrg}-dev-ed.develop.my.salesforce-setup.example/lightning/setup/SetupOneHome/home` });
  assert.equal(ok.instanceUrl, C.castLoginUrl);
  run(e, 'wizard.generateKey');
  assert.equal(attempt(e, 'wizard.generateKey').code, 'key_exists');
  const p = presetEngine('ready');
  assert.equal(attempt(p, 'app.create', { name: 'abc' }).code, 'name_too_short');
  run(p, 'app.create', { name: 'abcd' });
  assert.equal(attempt(p, 'app.create', { name: 'abcde' }).code, 'app_exists');
});

test('a regenerate in the wizard signs the form out: the green line is gone and Create is refused until a new sign-in', () => {
  const e = presetEngine('ready');
  assert.ok(e.snapshot().privilege.wizard.signedIn);
  run(e, 'wizard.regenerateKey');
  assert.equal(e.snapshot().privilege.wizard.signedIn, null);
  assert.equal(attempt(e, 'app.create', { name: 'Four Names' }).code, 'sign_in_first');
});

test('a credential-shaped value typed into a text field is refused whole and never echoed', () => {
  const e = newEngine();
  const secret = 'ghp_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8';
  for (const [op, p] of [['sf.createApp', { name: secret }], ['sf.createPermissionSet', { label: `password=${secret}` }]]) {
    const r = attempt(e, op, p);
    assert.equal(r.ok, false, op);
    assert.equal(r.code, 'credential_like_text');
    assert.ok(!JSON.stringify(r).includes('a1B2c3'), 'the refusal never echoes the text');
  }
  assert.equal(e.snapshot().salesforce.externalClientApp, null);
});

test('a wrong or hostile consumer key is never echoed in the hop or the state', () => {
  const e = prepared();
  const typed = 'TYPED-VALUE-THAT-MUST-NOT-APPEAR-123';
  signIn(e, { consumerKey: typed });
  assert.ok(!JSON.stringify(e.takeCalls()).includes(typed));
  assert.ok(!JSON.stringify(e.snapshot()).includes(typed));
});

test('unknown ops, unknown keys and non-object params are refused without naming them', () => {
  const e = newEngine();
  assert.equal(attempt(e, 'nope', {}).code, 'unknown_op');
  assert.equal(attempt(e, 'wizard.generateKey', { evil: 1 }).code, 'unknown_field');
  assert.equal(attempt(e, 'sf.createApp', [1]).code, 'bad_request');
  assert.equal(attempt(e, '__proto__', {}).code, 'unknown_op');
  assert.equal(attempt(e, 'constructor', {}).code, 'unknown_op');
});
