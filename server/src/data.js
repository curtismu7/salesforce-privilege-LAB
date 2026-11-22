// Story data. Every string may carry {{cast}} tokens; cast.js fills them from a vertical pack.
// Everything the lab says about how Salesforce or PingOne Privilege behaves was seen in ONE real setup and run (docs/setup-guide.md). A behaviour that
// was not seen is not in this file. The wording of an error that was not captured is left null rather than invented.
export const TITLE = 'Salesforce Privilege LAB';
export const GUIDE_SOURCE = 'docs/setup-guide.md (one real Privilege and Salesforce setup and run)';

export const INTRO = 'Support P1: a support engineer starts with no access to Salesforce Cases, asks for access for the job, works the P1, and the access ends and leaves a receipt. The other pages show how Privilege is connected to the org, how a person is linked, and what a grant and a revoke look like. Everything runs against a mock org in this process.';

// The ONLY honesty text in the lab (Mock). Real mode has its own banner: it says what the read does.
export const BANNER = {
  mock: 'Simulated: every behaviour shown was recorded in one real Privilege and Salesforce run.',
  real: 'REAL mode: read-only. One sign-in (a signed JWT, RS256) to the one Salesforce origin named in this lab\'s own .env, then a list of that org\'s permission sets and users. Nothing is granted, changed or deleted. Owner-run only; the private key is write-only and is never shown or logged.',
};

// The cases the engineer works. Titles and accounts are fictional and come from the vertical pack; the numbers and priorities do not change.
export const CASES = [
  { id: 'case-1', number: '00001041', priority: 'P1', status: 'Escalated', title: '{{castCaseP1Title}}', account: '{{castCaseP1Account}}' },
  { id: 'case-2', number: '00001042', priority: 'P2', status: 'Working', title: '{{castCase2Title}}', account: '{{castCase2Account}}' },
  { id: 'case-3', number: '00001043', priority: 'P3', status: 'New', title: '{{castCase3Title}}', account: '{{castCase3Account}}' },
];

// Every sign-in outcome the guide records: what Salesforce answered (null where the guide did not capture the wording), the cause and the exact fix.
// `not_modelled` is the lab's own refusal for a setup the guide did not record a failure for: it says nothing about what Salesforce does.
export const OUTCOMES = {
  signed_in: { sfError: null, sfDescription: null, cause: 'Key, certificate, pre-authorization and permission set link are all correct.', fix: 'Nothing to fix. Continue, name the application (at least 4 characters) and Create Application.' },
  invalid_client_id: { sfError: 'invalid_client_id', sfDescription: null, cause: 'Consumer Key copied wrongly.', fix: 'Copy it again: in the app, Settings, OAuth Settings, Consumer Key and Secret (Salesforce emails a verification code first). Copy only the Consumer Key; the Consumer Secret is not used.' },
  not_propagated: { sfError: 'invalid_grant', sfDescription: 'user hasn\'t approved this consumer', cause: 'A new External Client App can take up to 10 minutes to activate; the change has not propagated yet.', fix: 'Wait 2 to 10 minutes (here: move the lab clock forward a few minutes after the app was created), then sign in again.' },
  missing_refresh_scope: { sfError: null, sfDescription: null, cause: 'The app lacks the refresh_token, offline_access scope; Salesforce rejects the flow without it.', fix: 'Add refresh_token, offline_access to the app\'s OAuth scopes (alongside api).' },
  signature_mismatch: { sfError: null, sfDescription: null, cause: 'The certificate uploaded to the app does not match the key in the wizard form (a Regenerate, or a refresh of the wizard, makes a new key).', fix: 'Upload the matching .crt: the one from the current key. Keep the wizard open; its private key lives only in that form.' },
  not_preauthorized: { sfError: 'invalid_grant', sfDescription: 'user hasn\'t approved this consumer', cause: 'Permitted Users is still "All users can self-authorize", which does not work for JWT.', fix: 'App, Policies, Edit, OAuth Policies, Permitted Users: "Admin approved users are pre-authorized", Save. Then wait 2 to 10 minutes.' },
  permset_not_linked: { sfError: 'invalid_grant', sfDescription: 'user hasn\'t approved this consumer', cause: 'No permission set is linked to the app.', fix: 'App, Policies, Edit, App Policies, Select Permission Sets: move the permission set to Selected, Save.' },
  permset_not_assigned: { sfError: 'invalid_grant', sfDescription: 'user hasn\'t approved this consumer', cause: 'The user Privilege signs in as does not hold a permission set linked to the app.', fix: 'Permission set, Manage Assignments, Add Assignment, the user Privilege signs in as, Assign.' },
  not_modelled: { sfError: null, sfDescription: null, cause: 'The setup is incomplete in a way this lab does not model (for example JWT Bearer Flow off, the api scope missing, or a Username that is not a Salesforce-licensed active user).', fix: 'Follow the setup steps in docs/setup-guide.md: JWT Bearer Flow with the certificate, the scopes api and refresh_token, offline_access, and the exact Username of a Salesforce-licensed active user.' },
};

// The guide's troubleshooting table, one row per symptom. `outcomes` ties a row to a sign-in outcome, `rule` to a rule the engine produces.
export const TROUBLESHOOTING = [
  { symptom: 'invalid_grant or "user hasn\'t approved this consumer"', cause: 'Pre-authorization, permission set link or assignment missing, or a change has not propagated', fix: 'Recheck pre-authorization, the permission set link and the assignment; wait 2 to 10 minutes', outcomes: ['not_propagated', 'not_preauthorized', 'permset_not_linked', 'permset_not_assigned'] },
  { symptom: 'Salesforce rejects the flow', cause: 'refresh_token scope missing', fix: 'Add refresh_token, offline_access to the app', outcomes: ['missing_refresh_scope'] },
  { symptom: 'invalid_client_id', cause: 'Consumer Key copied wrongly', fix: 'Copy it again', outcomes: ['invalid_client_id'] },
  { symptom: 'Signature or certificate error', cause: 'Uploaded certificate does not match the key in the form', fix: 'Upload the matching .crt', outcomes: ['signature_mismatch'] },
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

export const LIMITS_TEXT = 'Limits: a lab clock move is at most 800 days; a grant lasts 1 minute to 366 days; a request note is at most 200 characters; names and emails are at most 80 and 120 characters; 200 policies, 400 receipts and 500 audit entries per workspace.';

// The talk track: three beats for the Support P1 story, then one part per other page. Each item is { id, title, say }.
export const TALK_TRACK = [
  { id: 'beat-1', title: 'Beat 1: no access', say: '{{castAName}} is a support engineer at {{castBrand}} with the Minimum Access profile and nothing else. Open Cases in the mock Salesforce: "You don\'t have access to Cases" (the lab\'s mock wording). No case titles, no counts. Case Read Access is the lab\'s example permission set, with the same mechanics as the guide\'s Account Read Access. Nobody has to remember to take anything away, because nothing was given.' },
  { id: 'beat-2', title: 'Beat 2: access for the job', say: 'A P1 lands. {{castAName}} makes a request in the lab with a note and an end time (the lab\'s own step; the lab does not claim Privilege stores the note), and Privilege grants {{castPermSet}} with that end date. Cases now shows three cases with the P1 on top, because the mock Salesforce really holds the assignment. The receipt says Granted and the reconciliation reads 1 confirmed. When the P1 is fixed, End access deletes the policy: it reads "Revoke pending, access still live", the cases are still listed and the reconciliation line is still the last refresh. We are still in beat 2 until you press Refresh receipts: in the guide the removal is queued and a refresh shows it.' },
  { id: 'beat-3', title: 'Beat 3: no access again, and a receipt', say: 'After Refresh receipts the assignment is gone, Cases is denied again, and the receipt reads Expired / Revoked (the reconciliation now reads 0 confirmed). Nothing ended the access by itself: the end time is only the "until" date on the receipt. Compare "The old way": a permanent set an admin assigned and nobody removed. That panel is a narrative, not something Privilege says.' },
  { id: 'connect', title: 'Connect: three things that all have to be true', say: 'Privilege signs in as one integration user with a signed JWT. That works only if the External Client App has JWT enabled with the right certificate and scopes, is pre-authorized for admin-approved users, and has a permission set linked to the app and assigned to the signing-in user. Break each one in turn and show the cause and the fix.' },
  { id: 'link', title: 'Link: the email is the key', say: 'Privilege links a person only when the email is identical, and refuses when two Privilege records share it ("its email matches 2 Privilege users"). {{castDupName1}} and {{castDupName2}} share an email, so neither links; {{castAName}} is unique and links on the first Sync. A Federation ID did not rescue it in the one test run.' },
  { id: 'grant', title: 'Grant and revoke', say: 'Grant {{castPermSet}} to {{castAName}} with a duration. The receipt says Granted and the reconciliation reads 1 confirmed. The grant dialog showed four things: a plain set, one that needs a permission set license, one the user already holds, and one under a different user licence (License Salesforce ≠ Cloud Integration User). To revoke, delete the policy: there is no Revoke button. The policy reads "Revoke pending, access still live" until the receipts are refreshed, then the receipt reads Expired / Revoked.' },
];
