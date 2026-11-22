// Story data. Every string may carry {{cast}} tokens; cast.js fills them from a vertical pack.
// Every statement about how Salesforce or PingOne Privilege behaves comes from ONE setup done once, on one Developer org and one Privilege
// build (docs/setup-guide.md). It is labelled OBSERVED below and is never a Ping statement. Wording of an error that was not captured is
// left null rather than invented.
export const TITLE = 'Salesforce Privilege LAB';
export const OBSERVED = 'observed on one org and one Privilege build, UNVERIFIED as a product claim';
// Three label states, additive: `observed` (the guide records it, from one real setup), `lab-inferred` (the guide records the advice or the symptom but
// not this exact failure, so the lab inferred it) and `lab-invented` (the lab made it up to have something to show). Every claim, outcome and
// troubleshooting row carries `basis` and a `label` text for its state; the UI shows the label as given.
export const LAB_INFERRED = 'lab-inferred: the guide gives the advice or the symptom, not this exact failure; UNVERIFIED as a product claim';
export const LAB_INVENTED = 'lab-invented: not observed anywhere, only here so the demo has something to show; UNVERIFIED as a product claim';
// A fourth state for LIVE data: what a Real read returned from the owner's own org. It is not a statement about the product, so it is not UNVERIFIED-labelled.
export const LIVE_LABEL = 'read from your org, read-only';
export const labelFor = (basis) => (basis === 'observed' ? OBSERVED : basis === 'lab-inferred' ? LAB_INFERRED : basis === 'live' ? LIVE_LABEL : LAB_INVENTED);
export const GUIDE_SOURCE = 'docs/setup-guide.md (a real setup done once by the lab owner; nothing here ran against a Ping statement)';

export const INTRO = 'Connect a Salesforce Developer org to PingOne Privilege, then let Privilege grant a permission set to one person for a time window and take it away again. The product part is easy to demo; the connecting is where it goes wrong, and each way it goes wrong has a cause and a fix. Everything runs against a mock org on a lab clock you move yourself.';

export const BANNER = {
  mock: `SIMULATED, MOCK mode: a mock Salesforce org and a mock Privilege app in this process, on a lab clock that only moves forward. Nothing leaves the machine. What the mock does about connecting, linking, granting and revoking is ${OBSERVED}.`,
  real: `REAL mode: read-only. One sign-in (a signed JWT, RS256) to the one Salesforce origin named in this lab's own .env, then a list of that org's permission sets and users. Nothing is granted, changed or deleted. Owner-run only; the private key is write-only and is never shown or logged.`,
};

// How to read a claim: each one carries the OBSERVED label so a presenter cannot read it out as a Ping statement.
export const CLAIMS = [
  { id: 'jwt-signin', claim: 'Privilege signs in to Salesforce as one integration user with a signed JWT: no password and no consent screen. It only works when three things are true in Salesforce: the External Client App has JWT Bearer Flow enabled with Privilege\'s certificate and the scopes api and refresh_token, offline_access; its Permitted Users policy is "Admin approved users are pre-authorized"; and a permission set is linked to the app and assigned to the user Privilege signs in as.' },
  { id: 'generic-errors', claim: 'Missing any one of the three makes Salesforce refuse with a generic error (invalid_grant, "user hasn\'t approved this consumer"), which is why the setup is the hard part and the demo itself is easy.' },
  { id: 'propagation', claim: 'A new External Client App can take up to 10 minutes to activate; a change that has not propagated looks the same as a missing setting. Waiting 2 to 10 minutes is the fix.' },
  { id: 'email-match', claim: 'Privilege links a Salesforce user to a Privilege user only when their email addresses are identical. Federation ID on the Salesforce user did not override this in the one test run (so the lab does not use it either).' },
  { id: 'duplicate-email', claim: 'When two Privilege records share an email, neither links: the refusal reads "its email matches 2 Privilege users". The records were read-only in the observed environment, so the fix is a user whose email is unique.' },
  { id: 'never-creates', claim: 'Privilege syncs users, profiles, permission sets and permission set groups and assigns or removes permission sets. It never creates Salesforce users. The Add Users dialog read: "Privilege doesn\'t create Salesforce users. Each user you add waits here with a Create in Salesforce link that opens the prefilled New User form; after you create them in Salesforce, the next Sync links them." So the link only opens a prefilled New User form in Salesforce; an admin creates the user.' },
  { id: 'licences', claim: 'The observed Developer org had 4 Salesforce user seats; once four users existed a new Salesforce-licensed user was refused until one was deactivated. Salesforce usernames are unique across all orgs ("Duplicate username").' },
  { id: 'grant-rules', claim: 'The grant dialog showed four things in one real run (names left out): a set under the Salesforce user licence with a seats line ("Permission set · Salesforce · 0 of 4 seats free"); a set that "Needs a permission set license"; a set the user already holds ("Already has this permission set", greyed out); and a set under another user licence ("Permission set · Cloud Integration User · 1 of 1 seats free") refused with "License Salesforce ≠ Cloud Integration User". What a full seat count does to a grant was not recorded.' },
  { id: 'default-duration', claim: 'The default grant duration was about a year, so a demo should pick the shortest duration offered to show expiry.' },
  { id: 'revoke-by-delete', claim: 'Access is granted through a policy on the app and removed by deleting that policy; there is no Revoke button. Expect "Revoke pending, access still live" briefly, then the policy count drops to 0 and Expired / Revoked shows 1. The removal is confirmed in Salesforce by reloading the user\'s Permission Set Assignments.' },
  { id: 'two-deletes', claim: 'Two different Deletes exist: the policy\'s three-dot menu removes only that policy and its grant; the red Delete on the app removes the whole Salesforce connection. The lab models only the first.' },
  { id: 'reconcile', claim: 'Access Receipts shows user, set, end date and status Granted; the reconciliation line reads 1 confirmed when Salesforce agrees.' },
  { id: 'certificate', claim: 'The wizard\'s certificate is valid two years; regenerating the key (or refreshing the wizard) means uploading a new .crt, and the old one then fails with a signature or certificate error.' },
];

// Everything in CLAIMS is `observed`. What the lab made up so the demo has something to show is listed here, labelled lab-invented:
export const LAB_INVENTED_ITEMS = [
  { id: 'reaper', text: 'Automatic expiry by a reaper: when the window closes the lab removes the assignment by itself. The guide observed removal only by deleting the policy, and that the default grant lasted about a year.' },
  { id: 'reconcile-clears', text: '"The next reconcile or Sync clears Revoke pending": the guide observed it clearing after a wait; which action clears it is the lab\'s reading.' },
  { id: 'case-sensitive', text: 'Case-sensitive email matching: the guide says the emails must be identical; whether Privilege folds case was not tested.' },
  { id: 'drift-names', text: '"Discovered" and "orphaned" for access assigned by hand in Salesforce, and revoking it from Privilege: how the product classifies and handles it was not observed.' },
  { id: 'authorized-user-rights', text: 'The authorized user\'s required permissions (System Administrator, or API Enabled and the others) are not checked: any Salesforce-licensed active user who holds the linked permission set signs in.' },
  { id: 'durations', text: 'The list of durations offered when granting.' },
];

export const NOT_DEMONSTRATED = [
  'Anything the real console, a real Salesforce org or a real Privilege build does that was not seen in the one setup the guide records: nothing here ran against one.',
  'Granting profiles or permission set groups, approval flows and Set Up SSO: not tested.',
  'The exact wording of the errors for a missing refresh_token scope, a mismatched certificate, an expired certificate, a wrong username and an inactive or unlicensed user: the guide records the symptom and the fix, not Salesforce\'s own words, so the lab shows the cause and the fix and leaves the wording empty.',
  'Whether email matching ignores case (the lab is case-sensitive, lab-invented), and what Privilege does with a Salesforce user that has no email.',
  'Lab-invented: automatic expiry by a reaper (the guide observed removal only by deleting the policy), and "the next reconcile or Sync clears Revoke pending" (the guide observed it clearing after a wait).',
  'Lab-invented: the authorized user\'s required permissions are not checked.',
  'The seats line the grant dialog shows beside a permission set ("0 of 4 seats free") is recorded but not modelled, and what a full count does to a grant is not known.',
  'How the product classifies access assigned by hand in Salesforce: "discovered" and "orphaned" are the lab\'s own names for it (lab-invented).',
  'The durations Privilege offers: the lab offers a list of its own.',
];

// Every sign-in outcome (`basis`: observed in the guide, or lab-inferred; the 10-minute boundary and the ORDER the checks run in are lab-chosen): what Salesforce answered (null where the guide did not capture the wording), the cause and the exact fix from the guide.
export const OUTCOMES = {
  signed_in: { basis: 'observed', sfError: null, sfDescription: null, cause: 'Key, certificate, pre-authorization and permission set link are all correct.', fix: 'Nothing to fix. Continue, name the application (at least 4 characters) and Create Application.', wording: 'observed' },
  invalid_client_id: { basis: 'observed', sfError: 'invalid_client_id', sfDescription: null, cause: 'Consumer Key copied wrongly.', fix: 'Copy it again: in the app, Settings, OAuth Settings, Consumer Key and Secret (Salesforce emails a verification code first). Copy only the Consumer Key; the Consumer Secret is not used.', wording: 'error code observed, description not captured' },
  not_propagated: { basis: 'observed', sfError: 'invalid_grant', sfDescription: 'user hasn\'t approved this consumer', cause: 'A new External Client App can take up to 10 minutes to activate; the change has not propagated yet.', fix: 'Wait 2 to 10 minutes (here: move the lab clock past 10 minutes after the app was created), then sign in again.', wording: 'observed' },
  jwt_not_enabled: { basis: 'lab-inferred', sfError: null, sfDescription: null, cause: 'JWT Bearer Flow is not enabled on the app, or no certificate was uploaded.', fix: 'Flow Enablement: Enable JWT Bearer Flow and upload the .crt. The app then lists the certificate with its common name and expiry date.', wording: 'not captured' },
  missing_api_scope: { basis: 'lab-inferred', sfError: null, sfDescription: null, cause: 'The app\'s OAuth scopes do not include api.', fix: 'Add the api scope (and refresh_token, offline_access) to the app.', wording: 'not captured' },
  missing_refresh_scope: { basis: 'observed', sfError: null, sfDescription: null, cause: 'The app lacks the refresh_token, offline_access scope; Salesforce rejects the flow without it.', fix: 'Add refresh_token, offline_access to the app\'s OAuth scopes (alongside api).', wording: 'symptom observed, wording not captured' },
  signature_mismatch: { basis: 'observed', sfError: null, sfDescription: null, cause: 'The certificate uploaded to the app does not match the key in the wizard form (a Regenerate, or a refresh of the wizard, makes a new key).', fix: 'Upload the matching .crt: the one from the current key. Keep the wizard open; its private key lives only in that form.', wording: 'symptom observed, wording not captured' },
  certificate_expired: { basis: 'lab-inferred', sfError: null, sfDescription: null, cause: 'The certificate uploaded to the app has passed its expiry date (the wizard\'s is valid two years).', fix: 'Regenerate the key and certificate in the wizard and upload the new .crt.', wording: 'not captured' },
  wrong_username: { basis: 'lab-inferred', sfError: null, sfDescription: null, cause: 'An email address was given instead of the Salesforce Username.', fix: 'Use the exact Username from Setup, Users (in a Developer org it often looks like name.<random>@<some-domain>), not the email.', wording: 'not captured' },
  unknown_username: { basis: 'lab-inferred', sfError: null, sfDescription: null, cause: 'No Salesforce user has this Username.', fix: 'Copy the exact Username from Setup, Users.', wording: 'not captured' },
  user_inactive: { basis: 'lab-inferred', sfError: null, sfDescription: null, cause: 'The authorized user is deactivated.', fix: 'Use an active Salesforce-licensed user, normally the org admin.', wording: 'not captured' },
  user_not_licensed: { basis: 'lab-inferred', sfError: null, sfDescription: null, cause: 'The authorized user is not Salesforce-licensed (for example the built-in Integration User).', fix: 'Use a Salesforce-licensed user, normally the org admin, not the built-in Integration User.', wording: 'guide advice, not captured as a failure' },
  not_preauthorized: { basis: 'observed', sfError: 'invalid_grant', sfDescription: 'user hasn\'t approved this consumer', cause: 'Permitted Users is still "All users can self-authorize", which does not work for JWT.', fix: 'App, Policies, Edit, OAuth Policies, Permitted Users: "Admin approved users are pre-authorized", Save. Then wait 2 to 10 minutes.', wording: 'observed' },
  permset_not_linked: { basis: 'observed', sfError: 'invalid_grant', sfDescription: 'user hasn\'t approved this consumer', cause: 'No permission set is linked to the app.', fix: 'App, Policies, Edit, App Policies, Select Permission Sets: move the permission set to Selected, Save.', wording: 'observed' },
  permset_not_assigned: { basis: 'observed', sfError: 'invalid_grant', sfDescription: 'user hasn\'t approved this consumer', cause: 'The user Privilege signs in as does not hold a permission set linked to the app.', fix: 'Permission set, Manage Assignments, Add Assignment, the user Privilege signs in as, Assign.', wording: 'observed' },
};

// The guide's troubleshooting table, one row per symptom. `outcome` ties a row to a sign-in outcome or a rule the engine produces.
export const TROUBLESHOOTING = [
  { symptom: 'invalid_grant or "user hasn\'t approved this consumer"', cause: 'Pre-authorization, permission set link or assignment missing, or a change has not propagated', fix: 'Recheck pre-authorization, the permission set link and the assignment; wait 2 to 10 minutes', outcomes: ['not_propagated', 'not_preauthorized', 'permset_not_linked', 'permset_not_assigned'] },
  { symptom: 'Salesforce rejects the flow', cause: 'refresh_token scope missing', fix: 'Add refresh_token, offline_access to the app', outcomes: ['missing_refresh_scope'] },
  { symptom: 'invalid_client_id', cause: 'Consumer Key copied wrongly', fix: 'Copy it again', outcomes: ['invalid_client_id'] },
  { symptom: 'Signature or certificate error', cause: 'Uploaded certificate does not match the key in the form', fix: 'Upload the matching .crt', outcomes: ['signature_mismatch', 'certificate_expired'] },
  { symptom: 'Sign-in fails with an email as the user', cause: 'The Authorized User must be the Username, not the email', fix: 'Use the exact Username from Setup, Users', outcomes: ['wrong_username', 'unknown_username'], basis: 'lab-inferred' },
  { symptom: 'Permission Sets list looks empty', cause: 'List filtered by one letter', fix: 'Click All', outcomes: [] },
  { symptom: 'Users (0) after a Sync', cause: 'No user added, or no Salesforce email matches', fix: 'Add Users; make the emails identical', outcomes: [], rule: 'waiting' },
  { symptom: '"its email matches 2 Privilege users"', cause: 'Two Privilege records share that email', fix: 'Use a user with a unique email', outcomes: [], rule: 'duplicate_email' },
  { symptom: 'Federation ID set but still waiting', cause: 'Privilege matches on email (the Federation ID did not override it in the one test run)', fix: 'Use a unique email', outcomes: [], rule: 'federation_id' },
  { symptom: '"Already has this permission set"', cause: 'The user already holds it', fix: 'Check Active Policies and Access Receipts', outcomes: [], rule: 'already_has_permission_set' },
  { symptom: '"Needs a permission set license"', cause: 'The set requires a license the user lacks', fix: 'Choose a plain permission set', outcomes: [], rule: 'needs_permission_set_license' },
  { symptom: '"License Salesforce ≠ <other>"', cause: 'The set belongs to a different user licence than the user holds', fix: 'Choose a set under the user\'s own licence', outcomes: [], rule: 'license_mismatch' },
  { symptom: '"Duplicate username" on a new Salesforce user', cause: 'Usernames are unique across all orgs', fix: 'Change the Username, keep the Email', outcomes: [], rule: 'duplicate_username' },
  { symptom: 'No Salesforce licenses available', cause: 'Developer org seats used up (4)', fix: 'Deactivate an unused user', outcomes: [], rule: 'no_licenses' },
  { symptom: '"Revoke pending, access still live"', cause: 'The removal is queued', fix: 'Wait, refresh, check Activity Logs', outcomes: [], rule: 'revoke_pending' },
  { symptom: 'No Sync button', cause: 'On the card list, or the header is cut off', fix: 'Open More Info on the card, zoom out, or Refresh on Access Receipts', outcomes: [] },
];

// Durations the lab offers when granting (lab-invented list; the guide records only that the default was about a year).
export const DURATIONS = [
  { label: '15 minutes', min: 15 }, { label: '1 hour', min: 60 }, { label: '1 day', min: 1440 }, { label: '7 days', min: 10080 },
  { label: '30 days', min: 43200 }, { label: 'about a year (the observed default)', min: 525600 },
];

export const LIMITS_TEXT = 'Limits: a lab clock move is at most 800 days (so the two-year certificate can be seen to expire); a grant lasts 1 minute to 366 days; names and emails are at most 80 and 120 characters; 200 policies, 400 receipts and 500 audit entries per workspace.';

export const TALK_TRACK = [
  { id: 'say-first', basis: 'observed', title: 'Start with the honest part', say: 'This is a rehearsal of something that really went wrong several times on the way to working. {{castBrand}}\'s admin {{castAdminName}} connects a Salesforce Developer org to PingOne Privilege. The mock is built from one real setup, so every behaviour is labelled: observed on one org and one Privilege build, not a Ping statement.' },
  { id: 'connect', basis: 'observed', title: 'Connect: three things that all have to be true', say: 'Privilege signs in as one integration user with a signed JWT. That works only if the External Client App has JWT enabled with the right certificate and scopes, is pre-authorized for admin-approved users, and has a permission set linked to the app and assigned to the signing-in user. Break each one in turn and show the cause and the fix.' },
  { id: 'propagation', basis: 'lab-inferred', title: 'Wait for it', say: 'A new app can take up to 10 minutes to activate. Move the lab clock: the same sign-in that failed with invalid_grant works once the clock passes ten minutes.' },
  { id: 'link', basis: 'observed', title: 'Link: the email is the key', say: 'Privilege links a person only when the email is identical, and refuses when two Privilege records share it ("its email matches 2 Privilege users"). {{castDupName1}} and {{castDupName2}} share an email, so neither links; {{castAName}} is unique and links on the first Sync. A Federation ID did not rescue it in the one test run.' },
  { id: 'grant', basis: 'observed', title: 'Grant for a window', say: 'Grant {{castPermSet}} to {{castAName}} for 60 minutes. The receipt says Granted and the reconciliation reads 1 confirmed; in the mock org the assignment is really there. The grant dialog showed four things in the real run: a plain set, one that needs a permission set license, one the user already holds, and one under a different user licence (License Salesforce ≠ Cloud Integration User).' },
  { id: 'expire', basis: 'lab-invented', title: 'Expire by itself, or revoke by deleting the policy', say: 'Delete the policy: it first reads "Revoke pending, access still live", then the assignment is gone (observed). Which action clears it, and the automatic expiry when you move the clock past the window, are lab-invented: say so. Two Deletes exist and only the policy one is modelled here.' },
  { id: 'drift', basis: 'lab-invented', title: 'Drift', say: 'Assign a permission set by hand in the org. Everything here is lab-invented: the lab\'s reconcile finds it outside any policy, calls it discovered, or orphaned if Privilege once granted it, and lets you revoke it.' },
];
