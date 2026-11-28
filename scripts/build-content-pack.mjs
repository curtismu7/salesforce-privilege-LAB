// Builds content-pack.json for the Learning Hub from the story data, so the pack cannot drift from the lab.
//   node scripts/build-content-pack.mjs        (writes content-pack.json)
// The pack uses .invalid placeholders and no documentation URLs. Catalog id D000 is a PLACEHOLDER: the owner assigns the real one.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CAST, DEFAULT_VERTICAL } from '../server/src/cast.js';
import { buildStory } from '../server/src/story.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
export function buildPack() {
  const story = buildStory(DEFAULT_CAST, DEFAULT_VERTICAL);
  const sid = (n) => `S${String(n).padStart(2, '0')}`;
  const termsFor = (id) => (id.startsWith('fail-') ? ['jwt-signin', 'invalid-grant'] : ({ 'support-p1': ['support-p1', 'permission-set', 'policy-delete', 'receipt'], 'duplicate-email': ['email-match'], 'link-pitfalls': ['email-match', 'seats'], 'grant-rules': ['permission-set'], 'revoke-by-delete': ['policy-delete', 'receipt'], 'happy-path': ['jwt-signin', 'permission-set', 'receipt'] })[id] || ['jwt-signin']);
  return {
    schema: 'demo-content-pack/1',
    id: 'salesforce-privilege-lab',
    title: 'Salesforce Privilege LAB',
    version,
    demo: { id: 'salesforce-privilege-lab', name: 'Salesforce Privilege LAB', catalog: 'D000', baseUrl: 'http://localhost:7835', doctor: '/api/health', tags: ['salesforce', 'privilege', 'jit', 'permission-set', 'jwt-bearer', 'simulated'] },
    glossary: [
      { id: 'support-p1', term: 'Support P1', definition: 'The lab\'s story: a support engineer holds the Minimum Access profile and nothing else, so Salesforce Cases is denied. A P1 lands, the engineer asks for the Case Read Access permission set with a note and an end time, Privilege grants it, and Cases lists the P1. Ending the access deletes the policy; Cases is denied again and a receipt remains. The Cases view is the lab\'s mock; "The old way" panel is narrative, not a Privilege claim.', aliases: ['zero standing privilege'] },
      { id: 'jwt-signin', term: 'JWT-bearer sign-in', definition: 'Privilege signs in to Salesforce as one integration user with a signed JWT: no password, no consent screen. It works only when the External Client App has JWT Bearer Flow with Privilege\'s certificate and the scopes api and refresh_token, offline_access; Permitted Users is "Admin approved users are pre-authorized"; and a permission set is linked to the app and assigned to the signing-in user.', aliases: ['External Client App'] },
      { id: 'invalid-grant', term: 'invalid_grant', definition: 'The generic error ("user hasn\'t approved this consumer") Salesforce gave when pre-authorization, the permission set link or the assignment was missing, or when a change had not propagated (up to 10 minutes).', aliases: [] },
      { id: 'email-match', term: 'Email matching', definition: 'Privilege links a Salesforce user to a Privilege user only when the emails are identical; Federation ID did not override it, and an email on two Privilege records is refused ("its email matches 2 Privilege users").', aliases: ['link users'] },
      { id: 'seats', term: 'Seats and usernames', definition: 'The Developer org had 4 Salesforce user seats, and a Salesforce username is unique across all orgs ("Duplicate username").', aliases: [] },
      { id: 'permission-set', term: 'Permission set grant rules', definition: 'A grant is refused for a set that needs a permission set license, whose user license differs from the user\'s, or that the user already holds ("Already has this permission set").', aliases: [] },
      { id: 'policy-delete', term: 'Revoke by deleting the policy', definition: 'There is no Revoke button: deleting the policy shows "Revoke pending, access still live" on the policy. In the guide the removal is queued and a refresh shows it: the assignment is gone in Salesforce and the policy count drops to 0.', aliases: ['revoke pending'] },
      { id: 'receipt', term: 'Receipt and reconciliation', definition: 'Access Receipts shows user, set, end date and status Granted, and later the guide\'s Expired / Revoked counter; the reconciliation line reads 1 confirmed while Salesforce holds the assignment.', aliases: ['access receipt'] },
    ],
    sources: [
      { id: 'setup-guide', title: 'docs/setup-guide.md: connecting a Salesforce Developer org to PingOne Privilege', url: 'docs/setup-guide.md', kind: 'guide', use: 'A file in this lab\'s own repository (not a web page): every behaviour the mock models, from one real setup done once.', status: 'read', checked: '2026-11-22' },
    ],
    cards: [
      ...story.scenarios.map((sc, i) => ({ id: `try-${sc.id}`, label: `Scenario ${i + 1}: ${sc.title}`, description: sc.say, group: 'try-it', action: { type: 'route', href: i === 0 ? '/#support' : '/#scenarios' }, terms: termsFor(sc.id), story: sid(i + 1) })),
      { id: 'page-support', label: 'Support P1: the story', description: 'Three panels together: the engineer\'s Salesforce view, Privilege, and "The old way". Request access (the engineer\'s note and end time are the lab\'s own step), work the P1, End access, Refresh receipts; Cases goes from denied, to three cases, to denied again, and the receipt shows Granted then Expired / Revoked.', group: 'try-it', action: { type: 'route', href: '/#support' }, terms: ['support-p1', 'permission-set', 'policy-delete', 'receipt'] },
      { id: 'page-scenarios', label: 'Scenarios: the scripted runs', description: 'Twelve scripted scenarios run step by step by the lab\'s own engine, each step with its raw request and response.', group: 'try-it', action: { type: 'route', href: '/#scenarios' }, terms: ['jwt-signin', 'invalid-grant'] },
      { id: 'page-connect', label: 'Connect: the wizard rehearsal', description: 'Org URL, key and certificate, the External Client App, then the sign-in check: every failure comes back with its cause and the exact fix.', group: 'try-it', action: { type: 'route', href: '/#connect' }, terms: ['jwt-signin', 'invalid-grant'] },
      { id: 'page-link', label: 'Link: Add Users and Sync', description: 'Add a Privilege user and Sync: identical email only, the shared-email refusal, the four licence seats and the duplicate-username refusal.', group: 'try-it', action: { type: 'route', href: '/#link' }, terms: ['email-match', 'seats'] },
      { id: 'page-grant', label: 'Grant and revoke', description: 'Grant a permission set with a duration, watch the receipt and the reconciliation, then delete the policy: the policy reads Revoke pending, access still live, and Refresh receipts shows it gone.', group: 'try-it', action: { type: 'route', href: '/#grant' }, terms: ['permission-set', 'policy-delete', 'receipt'] },
      { id: 'page-diagram', label: 'Diagrams', description: 'Two diagrams loaded by name from the server: connect and link, and grant and revoke. Movable boxes, Simulate, speed, Reset.', group: 'concept', action: { type: 'route', href: '/#diagram' }, terms: ['jwt-signin', 'policy-delete'] },
      { id: 'page-real', label: 'Real: one read of your own org (owner only)', description: 'Run scripts/setup-real.sh once, switch to Real, type the org host to confirm, and read one org\'s permission sets and users. Read-only, one origin, the key and the token are never shown.', group: 'reference', action: { type: 'route', href: '/#real' }, terms: ['jwt-signin'] },
      { id: 'concept-presenter', label: 'Presenter mode and the talk track', description: 'Press P for presenter mode and open the talk track: the three beats of the Support P1 story, then one part per page.', group: 'concept', action: { type: 'route', href: '/#support' }, terms: ['support-p1'] },
      { id: 'ref-doctor', label: 'Doctor and health', description: 'Preflight checks and the demo-health/1 endpoint.', group: 'setup', action: { type: 'route', href: '/api/health' } },
    ],
    diagrams: [{ id: 'connect-and-link', label: 'Connect an org and link a user', href: '/#diagram/connect-and-link' }, { id: 'grant-and-revoke', label: 'Grant and revoke', href: '/#diagram/grant-and-revoke' }],
    stories: story.scenarios.map((sc, i) => ({ id: sid(i + 1), title: sc.title, say: sc.say })),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(path.join(ROOT, 'content-pack.json'), `${JSON.stringify(buildPack(), null, 2)}\n`);
  console.log('wrote content-pack.json');
}
