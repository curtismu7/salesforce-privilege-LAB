// Builds content-pack.json for the Learning Hub from the story data, so the pack cannot drift from the lab.
//   node scripts/build-content-pack.mjs        (writes content-pack.json)
// The pack uses .invalid placeholders and no documentation URLs. Catalog id D000 is a PLACEHOLDER: the owner assigns the real one.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CAST } from '../server/src/cast.js';
import { buildStory } from '../server/src/story.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const OBS = 'Observed on one org and one Privilege build, UNVERIFIED as a product claim.';

export function buildPack() {
  const story = buildStory(DEFAULT_CAST, 'finance');
  const sid = (n) => `S${String(n).padStart(2, '0')}`;
  const termsFor = (id) => (id.startsWith('fail-') ? ['jwt-signin', 'invalid-grant'] : ({ 'duplicate-email': ['email-match'], 'link-pitfalls': ['email-match', 'seats'], 'grant-rules': ['permission-set'], 'grant-expires': ['reaper', 'receipt'], 'revoke-by-delete': ['policy-delete', 'receipt'], 'hand-assigned-drift': ['drift'], 'sign-in-breaks-later': ['jwt-signin'], 'happy-path': ['jwt-signin', 'permission-set', 'receipt'] })[id] || ['jwt-signin']);
  return {
    schema: 'demo-content-pack/1',
    id: 'salesforce-privilege-lab',
    title: 'Salesforce Privilege LAB',
    version,
    demo: { id: 'salesforce-privilege-lab', name: 'Salesforce Privilege LAB', catalog: 'D000', baseUrl: 'http://localhost:7835', doctor: '/api/health', tags: ['salesforce', 'privilege', 'jit', 'permission-set', 'jwt-bearer', 'simulated'] },
    glossary: [
      { id: 'jwt-signin', term: 'JWT-bearer sign-in', definition: `Privilege signs in to Salesforce as one integration user with a signed JWT: no password, no consent screen. It works only when the External Client App has JWT Bearer Flow with Privilege's certificate and the scopes api and refresh_token, offline_access; Permitted Users is "Admin approved users are pre-authorized"; and a permission set is linked to the app and assigned to the signing-in user. ${OBS}`, aliases: ['External Client App'] },
      { id: 'invalid-grant', term: 'invalid_grant', definition: `The generic error ("user hasn't approved this consumer") Salesforce gave when pre-authorization, the permission set link or the assignment was missing, or when a change had not propagated (up to 10 minutes). ${OBS}`, aliases: [] },
      { id: 'email-match', term: 'Email matching', definition: `Privilege links a Salesforce user to a Privilege user only when the emails are identical; Federation ID did not override it, and an email on two Privilege records is refused ("its email matches 2 Privilege users"). ${OBS}`, aliases: ['link users'] },
      { id: 'seats', term: 'Seats and usernames', definition: `The observed Developer org had 4 Salesforce user seats, and a Salesforce username is unique across all orgs ("Duplicate username"). ${OBS}`, aliases: [] },
      { id: 'permission-set', term: 'Permission set grant rules', definition: `A grant is refused for a set that needs a permission set license, whose user license differs from the user's, or that the user already holds. ${OBS}`, aliases: [] },
      { id: 'policy-delete', term: 'Revoke by deleting the policy', definition: `There is no Revoke button: deleting the policy shows "Revoke pending, access still live" until the next reconcile or Sync removes the assignment. ${OBS}`, aliases: ['revoke pending'] },
      { id: 'reaper', term: 'Expiry', definition: `A grant carries a window on the lab clock; when it closes the mock removes the assignment. The lab's removal timing is lab-invented. ${OBS}`, aliases: ['time-bound access'] },
      { id: 'receipt', term: 'Receipt and reconciliation', definition: `Access Receipts shows user, set, end date and status (Granted, then Expired or Revoked); reconciliation reads observed, confirmed, discovered and orphaned. Discovered and orphaned are the lab's own names for access assigned by hand. ${OBS}`, aliases: ['access receipt'] },
      { id: 'drift', term: 'Drift', definition: `Access assigned by hand in Salesforce, outside any policy. How the product classifies it was not observed: the lab's reading is lab-invented. ${OBS}`, aliases: ['discovered', 'orphaned'] },
    ],
    sources: [
      { id: 'setup-guide', title: 'docs/setup-guide.md: connecting a Salesforce Developer org to PingOne Privilege', url: 'docs/setup-guide.md', kind: 'guide', use: 'A file in this lab\'s own repository (not a web page): every behaviour the mock models, from one real setup done once.', status: 'read', checked: '2026-11-22' },
    ],
    cards: [
      ...story.scenarios.map((sc, i) => ({ id: `try-${sc.id}`, label: `Scenario ${i + 1}: ${sc.title}`, description: sc.say, group: 'try-it', action: { type: 'route', href: '/#story' }, terms: termsFor(sc.id), story: sid(i + 1) })),
      { id: 'page-connect', label: 'Connect: the wizard rehearsal', description: 'Org URL, key and certificate, the External Client App, then the sign-in check: every failure comes back with its cause and the exact fix. Each outcome says whether it was observed or lab-inferred.', group: 'try-it', action: { type: 'route', href: '/#connect' }, terms: ['jwt-signin', 'invalid-grant'] },
      { id: 'page-link', label: 'Link: Add Users and Sync', description: 'Add a Privilege user and Sync: identical email only, the shared-email refusal, the four licence seats and the duplicate-username refusal.', group: 'try-it', action: { type: 'route', href: '/#link' }, terms: ['email-match', 'seats'] },
      { id: 'page-grant', label: 'Grant and revoke', description: 'Grant a permission set for a window on the lab clock, watch the receipt and the reconciliation, delete the policy (Revoke pending), move the clock, assign one by hand and see the drift. Expiry by itself and the drift names are lab-invented and marked.', group: 'try-it', action: { type: 'route', href: '/#grant' }, terms: ['permission-set', 'policy-delete', 'reaper', 'receipt', 'drift'] },
      { id: 'page-diagram', label: 'Diagrams', description: 'Two diagrams loaded by name from the server: connect and link, and grant, expire and revoke. Movable boxes, Simulate, speed, Reset. Lab-invented arrows are marked.', group: 'concept', action: { type: 'route', href: '/#diagram' }, terms: ['jwt-signin', 'policy-delete', 'reaper'] },
      { id: 'page-real', label: 'Real: one read of your own org (owner only)', description: 'Switch to Real, type the org host to confirm, and read one org\'s permission sets and users. Read-only, one origin, the key and the token are never shown.', group: 'reference', action: { type: 'route', href: '/#real' }, terms: ['jwt-signin'] },
      { id: 'concept-presenter', label: 'Presenter mode and the talk track', description: 'Press P for presenter mode (the simulation banner stays) and open the talk track: seven parts, each marked observed or lab-invented.', group: 'concept', action: { type: 'route', href: '/#story' }, terms: ['reaper', 'drift'] },
      { id: 'ref-doctor', label: 'Doctor and health', description: 'Preflight checks and the demo-health/1 endpoint.', group: 'setup', action: { type: 'route', href: '/api/health' } },
    ],
    diagrams: [{ id: 'connect-and-link', label: 'Connect an org and link a user', href: '/#diagram/connect-and-link' }, { id: 'grant-expire-revoke', label: 'Grant, expire or revoke a permission set', href: '/#diagram/grant-expire-revoke' }],
    stories: story.scenarios.map((sc, i) => ({ id: sid(i + 1), title: sc.title, say: sc.say })),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(path.join(ROOT, 'content-pack.json'), `${JSON.stringify(buildPack(), null, 2)}\n`);
  console.log('wrote content-pack.json');
}
