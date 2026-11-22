// Scripted scenarios as DATA: a start point (a preset of silent setup steps) and a list of steps { op, params, expect, say }. `expect` is "ok" or the
// error code the step must give; the doctor and the tests run every scenario in every vertical and fail on a step that does otherwise. Strings carry
// {{cast}} tokens, filled by cast.js; a test fails on any token a pack does not define. Ids (sfu-1, ps-4, cert-1, pu-a, pol-0001) are the engine's
// deterministic ids for the seeded world. Every step is something docs/setup-guide.md records from the one real run; nothing here ends a grant by itself.
import { fillDeep } from './cast.js';
import { Engine } from './engine.js';
import { tryOp } from './actions.js';

const s = (op, params, say, expect = 'ok') => ({ op, ...(params ? { params } : {}), say, expect });

// ---- reusable blocks -------------------------------------------------------------------------------------------------------------------------
const keyBlock = () => [
  s('wizard.orgUrl', { url: '{{castWizardUrl}}' }, 'Paste any address from the signed-in org; Privilege converts it to the My Domain URL.'),
  s('wizard.generateKey', null, 'Generate the key and certificate. The .crt is valid two years; the private key lives only in this form.'),
];
// The External Client App, each part switchable so a scenario can leave one out.
const ecaBlock = (o = {}) => {
  const { scopes = ['api', 'refresh_token'], jwt = true, preauth = true, link = true, assign = true } = o;
  return [
    s('sf.createApp', { name: '{{castEccName}}' }, 'In Salesforce: New External Client App (Distribution State Local). It can take up to 10 minutes to activate.'),
    s('sf.setScopes', { scopes }, scopes.includes('refresh_token') ? 'OAuth scopes: api and refresh_token, offline_access.' : 'OAuth scopes: api only (refresh_token, offline_access left out).'),
    s('sf.setJwtBearer', { enabled: jwt, ...(jwt ? { certId: 'cert-1' } : {}) }, jwt ? 'Enable JWT Bearer Flow and upload the wizard\'s .crt.' : 'JWT Bearer Flow left off.'),
    s('sf.setPermittedUsers', { policy: preauth ? 'admin_preauthorized' : 'self_authorize' }, preauth ? 'Policies: Admin approved users are pre-authorized.' : 'Policies left at the default, All users can self-authorize.'),
    s('sf.createPermissionSet', { label: '{{castIntegrationSet}}' }, 'Create an empty permission set, label Integration Access, license None.'),
    ...(link ? [s('sf.linkPermissionSet', { permSetId: 'ps-4' }, 'Link the permission set to the app (Select Permission Sets).')] : []),
    ...(assign ? [s('sf.assignPermissionSet', { userId: 'sfu-1', permSetId: 'ps-4' }, 'Assign it to the user Privilege signs in as: the Salesforce-licensed admin, not the built-in Integration User.')] : []),
  ];
};
const waitBlock = () => [s('clock.advance', { minutes: 10 }, 'Move the lab clock forward 10 minutes so the new app has activated (waiting 2 to 10 minutes is the fix).')];
const keyCodeBlock = () => [
  s('sf.requestKeyCode', null, 'Open the app\'s Settings, OAuth Settings, Consumer Key and Secret: Salesforce emails a verification code first.'),
  s('sf.revealConsumerKey', { code: '{{castKeyCode}}' }, 'Enter the code. Copy only the Consumer Key; the Consumer Secret is not used.'),
];
const signInOk = (say = 'Consumer Key and Authorized User (the Username, not the email): the green "Signed in to ... as ..." line appears.') => s('wizard.signIn', { consumerKey: '{{castConsumerKey}}', username: '{{castAdminUsername}}' }, say);
const connectedUpToSignIn = () => [...keyBlock(), ...ecaBlock(), ...waitBlock(), ...keyCodeBlock(), signInOk()];

export const PRESETS = {
  fresh: [],
  ready: connectedUpToSignIn(),
  'connected-app': [...connectedUpToSignIn(), s('app.create', { name: '{{castAppName}}' }, 'Name the application and Create: Sync Status Ready.')],
  connected: [...connectedUpToSignIn(), s('app.create', { name: '{{castAppName}}' }, 'Create the application.'), s('users.add', { privilegeUserId: 'pu-a' }, 'Add the demo user: waiting for Salesforce.'), s('app.sync', null, 'Sync: the row links.')],
};
export const PRESET_TEXT = {
  fresh: 'a mock org and an empty Privilege app',
  ready: 'a connected wizard: key, External Client App, pre-authorized, permission set linked and assigned, signed in (no application yet)',
  'connected-app': 'an application created on the org, no users added',
  connected: 'an application with the demo user linked',
};

const failThenFix = (id, title, say, preset, steps) => ({ id, title, say, preset, steps });

export const SCENARIOS = [
  {
    id: 'support-p1', title: 'Support P1: no access, access for the job, no access again', preset: 'connected',
    say: '{{castAName}} is a support engineer with the Minimum Access profile and no access to Cases. A P1 lands: {{castAName}} asks for {{castPermSet}} with a note and an end time, Privilege grants it, and Cases lists the P1. Ending the access deletes the policy: first "Revoke pending, access still live", then the assignment is gone and Cases is denied again. The receipt keeps the record.',
    steps: [
      s('support.requestAccess', { note: 'P1: {{castCaseP1Title}} ({{castCaseP1Account}}). I need to read the case history to fix it.', endAt: '2026-11-02T11:00:00Z' }, '{{castAName}} asks for {{castPermSet}} with a note and an end time. Privilege grants it: Salesforce now holds the assignment, so Cases lists three cases with the P1 on top.'),
      s('app.reconcile', null, 'Access Receipts shows Granted with its end date; the reconciliation reads 1 confirmed, and the mock org lists the assignment.'),
      s('policy.delete', { policyId: 'pol-0001' }, 'The P1 is fixed: delete the policy (there is no Revoke button). "Revoke pending, access still live": Cases still lists the cases for a moment.'),
      s('app.reconcile', null, 'Refresh: the assignment is gone in Salesforce and the receipt reads Revoked. Cases is denied again.'),
    ],
  },
  {
    id: 'happy-path', title: 'Connect, link, grant, revoke', preset: 'fresh',
    say: 'The whole cycle once, with nothing going wrong: connect the org, link {{castAName}}, grant {{castPermSet}} for a window, see it in Salesforce, delete the policy and see it gone.',
    steps: [
      ...keyBlock(), ...ecaBlock(), ...waitBlock(), ...keyCodeBlock(), signInOk(),
      s('app.create', { name: '{{castAppName}}' }, 'Create the application: Sync Status Ready.'),
      s('users.add', { privilegeUserId: 'pu-a' }, 'Users tab, Add Users: {{castAName}} waits for Salesforce.'),
      s('app.sync', null, 'Sync: the emails are identical, so the row links and Grant Permission becomes available.'),
      s('policy.grant', { privilegeUserId: 'pu-a', permSetId: 'ps-1', durationMin: 60 }, 'Grant {{castPermSet}} with a duration of 60 minutes.'),
      s('app.reconcile', null, 'Access Receipts shows Granted; the reconciliation reads 1 confirmed, and the mock org lists the assignment.'),
      s('policy.delete', { policyId: 'pol-0001' }, 'Active Policies, three-dot menu, Delete (there is no Revoke button): "Revoke pending, access still live".'),
      s('app.reconcile', null, 'Refresh: the assignment is gone in Salesforce and the receipt reads Revoked.'),
    ],
  },
  failThenFix('fail-client-id', 'Sign-in fails: invalid_client_id', 'The Consumer Key was copied wrongly. Salesforce answers invalid_client_id; copy it again.', 'fresh', [
    ...keyBlock(), ...ecaBlock(), ...waitBlock(), ...keyCodeBlock(),
    s('wizard.signIn', { consumerKey: '3MVG9-MOCK-typo', username: '{{castAdminUsername}}' }, 'A Consumer Key with a slip in it.', 'invalid_client_id'),
    signInOk('Copied again: signed in.'),
  ]),
  failThenFix('fail-not-propagated', 'Sign-in fails: not propagated yet', 'Everything is right, but the app is a minute old. invalid_grant, "user hasn\'t approved this consumer", until the lab clock has moved forward a few minutes.', 'fresh', [
    ...keyBlock(), ...ecaBlock(), ...keyCodeBlock(),
    s('wizard.signIn', { consumerKey: '{{castConsumerKey}}', username: '{{castAdminUsername}}' }, 'Signing in straight after creating the app.', 'not_propagated'),
    ...waitBlock(),
    signInOk('The same sign-in after the wait: signed in.'),
  ]),
  failThenFix('fail-not-preauthorized', 'Sign-in fails: not pre-authorized', 'Permitted Users was left at "All users can self-authorize", which does not work for JWT. invalid_grant.', 'fresh', [
    ...keyBlock(), ...ecaBlock({ preauth: false }), ...waitBlock(), ...keyCodeBlock(),
    s('wizard.signIn', { consumerKey: '{{castConsumerKey}}', username: '{{castAdminUsername}}' }, 'Sign in with the default Permitted Users policy.', 'not_preauthorized'),
    s('sf.setPermittedUsers', { policy: 'admin_preauthorized' }, 'Policies, Permitted Users: Admin approved users are pre-authorized.'),
    signInOk(),
  ]),
  failThenFix('fail-refresh-scope', 'Sign-in fails: refresh_token scope missing', 'Without refresh_token, offline_access Salesforce rejects the flow.', 'fresh', [
    ...keyBlock(), ...ecaBlock({ scopes: ['api'] }), ...waitBlock(), ...keyCodeBlock(),
    s('wizard.signIn', { consumerKey: '{{castConsumerKey}}', username: '{{castAdminUsername}}' }, 'Sign in with only the api scope.', 'missing_refresh_scope'),
    s('sf.setScopes', { scopes: ['api', 'refresh_token'] }, 'Add refresh_token, offline_access.'),
    signInOk(),
  ]),
  failThenFix('fail-cert-mismatch', 'Sign-in fails: certificate does not match the key', 'The wizard was refreshed (a new key), so the certificate uploaded to the app no longer matches. Upload the new .crt.', 'fresh', [
    ...keyBlock(), ...ecaBlock(), ...waitBlock(), ...keyCodeBlock(),
    s('wizard.regenerateKey', null, 'Regenerate in the wizard (or refresh it): a new key and a new certificate.'),
    s('wizard.signIn', { consumerKey: '{{castConsumerKey}}', username: '{{castAdminUsername}}' }, 'Sign in: the app still holds the old certificate.', 'signature_mismatch'),
    s('sf.setJwtBearer', { enabled: true, certId: 'cert-2' }, 'Upload the matching .crt (cert-2).'),
    signInOk(),
  ]),
  failThenFix('fail-permset-link', 'Sign-in fails: permission set not linked, then not assigned', 'Both look the same from outside: invalid_grant. The permission set must be linked to the app and assigned to the signing-in user.', 'fresh', [
    ...keyBlock(), ...ecaBlock({ link: false, assign: false }), ...waitBlock(), ...keyCodeBlock(),
    s('wizard.signIn', { consumerKey: '{{castConsumerKey}}', username: '{{castAdminUsername}}' }, 'Sign in with no permission set linked.', 'permset_not_linked'),
    s('sf.linkPermissionSet', { permSetId: 'ps-4' }, 'Link it to the app.'),
    s('wizard.signIn', { consumerKey: '{{castConsumerKey}}', username: '{{castAdminUsername}}' }, 'Sign in: linked, but nobody holds it.', 'permset_not_assigned'),
    s('sf.assignPermissionSet', { userId: 'sfu-1', permSetId: 'ps-4' }, 'Assign it to the admin.'),
    signInOk(),
  ]),
  failThenFix('duplicate-email', 'Link refused: its email matches 2 Privilege users', 'Two Privilege records share an email, so neither links. Federation ID does not help; pick a user whose email is unique.', 'connected-app', [
    s('users.add', { privilegeUserId: 'pu-dup1' }, 'Add {{castDupName1}}.'),
    s('users.add', { privilegeUserId: 'pu-dup2' }, 'Add {{castDupName2}}, who has the same email.'),
    s('app.sync', null, 'Sync: neither links; the row says its email matches 2 Privilege users.'),
    s('users.add', { privilegeUserId: 'pu-a' }, 'Add {{castAName}}, whose email is unique.'),
    s('app.sync', null, '{{castAName}} links on the first Sync.'),
  ]),
  failThenFix('link-pitfalls', 'Link pitfalls: Federation ID, duplicate username, no seats', 'A Federation ID does not rescue a mismatched email, a Salesforce username is unique across all orgs, and the observed org had 4 seats.', 'connected-app', [
    s('sf.createUser', { name: '{{castFName}}', email: '{{castFSfEmail}}', username: '{{castTakenUsername}}' }, 'Create a Salesforce user whose Username is taken in another org.', 'duplicate_username'),
    s('sf.createUser', { name: '{{castFName}}', email: '{{castFSfEmail}}', username: '{{castFUsername}}' }, 'Change the Username, keep the email: created (seat 4 of 4).'),
    s('sf.setFederationId', { userId: 'sfu-4', federationId: '{{castFFederationId}}' }, 'Set the Federation ID to the Privilege email.'),
    s('users.add', { privilegeUserId: 'pu-f' }, 'Add {{castFName}} in Privilege.'),
    s('app.sync', null, 'Sync: still waiting. Privilege matches on email; the Federation ID is not used.'),
    s('sf.createUser', { name: '{{castCName}}', email: '{{castCEmail}}', username: '{{castCUsername}}' }, 'Create a user for {{castCName}}: no Salesforce licenses left.', 'no_licenses'),
    s('sf.deactivateUser', { userId: 'sfu-4' }, 'Deactivate the unused user to free a seat.'),
    s('sf.createUser', { name: '{{castCName}}', email: '{{castCEmail}}', username: '{{castCUsername}}' }, 'Create the user again: created.'),
    s('users.add', { privilegeUserId: 'pu-c' }, 'Add {{castCName}} in Privilege.'),
    s('app.sync', null, 'Sync: the emails are identical, so {{castCName}} links.'),
  ]),
  failThenFix('grant-rules', 'Grant refused: license rules and "Already has"', 'Some permission sets need a permission set license, some belong to a different user license, and one the user already holds cannot be granted twice.', 'connected', [
    s('policy.grant', { privilegeUserId: 'pu-a', permSetId: 'ps-2', durationMin: 60 }, 'Grant {{castLicensedSet}}: it needs a permission set license.', 'needs_permission_set_license'),
    s('policy.grant', { privilegeUserId: 'pu-a', permSetId: 'ps-3', durationMin: 60 }, 'Grant {{castOtherLicenseSet}}: it belongs to a different user license (License Salesforce ≠ {{castOtherLicense}}).', 'license_mismatch'),
    s('policy.grant', { privilegeUserId: 'pu-a', permSetId: 'ps-1', durationMin: 60 }, 'Grant {{castPermSet}}, a plain permission set: granted.'),
    s('policy.grant', { privilegeUserId: 'pu-a', permSetId: 'ps-1', durationMin: 60 }, 'Grant it again: Already has this permission set.', 'already_has_permission_set'),
  ]),
  failThenFix('revoke-by-delete', 'Revoke by deleting the policy', 'There is no Revoke button: delete the policy. First "Revoke pending, access still live", then the assignment is gone in Salesforce.', 'connected', [
    s('policy.grant', { privilegeUserId: 'pu-a', permSetId: 'ps-1', durationMin: 1440 }, 'Grant {{castPermSet}} with a duration of a day.'),
    s('policy.delete', { policyId: 'pol-0001' }, 'Delete the policy: Revoke pending, access still live. The assignment is still in Salesforce.'),
    s('app.reconcile', null, 'Refresh: the assignment is gone in Salesforce and the receipt reads Revoked.'),
  ]),
];

export const scenarioList = (cast) => fillDeep(SCENARIOS.map((sc) => ({ id: sc.id, title: sc.title, say: sc.say, preset: sc.preset, presetText: PRESET_TEXT[sc.preset], steps: sc.steps.length })), cast);
export const scenarioById = (id) => SCENARIOS.find((sc) => sc.id === id) || null;

// Run a scenario on a fresh engine: the preset silently (every step must be ok), then the scenario's steps (the first `upTo`, default all).
export function runScenario(cast, sc, { upTo = Infinity } = {}) {
  const engine = new Engine(cast);
  const setup = fillDeep(PRESETS[sc.preset], cast);
  const failedSetup = [];
  for (const st of setup) { const r = tryOp(engine, st.op, st.params); if (!r.ok) failedSetup.push(`${st.op}: ${r.code}`); }
  engine.takeCalls();
  const steps = [];
  fillDeep(sc.steps, cast).slice(0, upTo).forEach((st, i) => {
    const result = tryOp(engine, st.op, st.params);
    steps.push({ index: i + 1, op: st.op, params: st.params || {}, say: st.say, expect: st.expect, result, calls: engine.takeCalls(), met: st.expect === 'ok' ? result.ok : result.code === st.expect });
  });
  return { engine, steps, failedSetup, ok: failedSetup.length === 0 && steps.every((x) => x.met) };
}
