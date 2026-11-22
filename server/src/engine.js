// The mock world: one Salesforce Developer org and one PingOne Privilege app on top of it, on a lab clock that only moves forward.
// Deterministic, no I/O, no network. One Engine per workspace and vertical. Every behaviour rule below is taken from docs/setup-guide.md (one real
// setup and run); a behaviour that was not seen there is not modelled. Nothing here ends a grant by itself: access ends when the policy is deleted.
import { createHash } from 'node:crypto';
import { refuse } from './errors.js';
import { maskText } from './shared/mask.js';
import { CASES, OUTCOMES } from './data.js';
import { fillDeep } from './cast.js';

export const LAB_START = Date.UTC(2026, 10, 2, 9, 0, 0); // the lab clock starts here
// activateMin: the guide says a new app can take up to 10 minutes to activate and that waiting 2 to 10 minutes is the fix; the mock is active after 2.
export const LIMITS = Object.freeze({ advanceMaxMin: 800 * 1440, clockMaxMin: 3650 * 1440, mailbox: 20, keys: 20, grantMaxMin: 366 * 1440, policies: 200, receipts: 400, audit: 500, calls: 40, name: 80, email: 120, note: 200, requests: 100, seats: 4, activateMin: 2, certDays: 730 });
export const SCOPES = ['api', 'refresh_token']; // the two scopes the guide names (refresh_token is offline access too)
export const SF_API = 'v62.0'; // illustrative path version on a .example host; not a claim about any real release
const iso = (min) => new Date(LAB_START + min * 60000).toISOString();
const sha = (s) => createHash('sha256').update(s).digest('hex');
const CTRL = /\p{Cc}/gu; // control characters become a space
const FORMAT = /\p{Cf}/gu; // every format character (bidi controls, zero-width, joiners, BOM) is deleted
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Typed text: control and bidi characters become spaces, the length is bounded, and anything the shared masker would change (a credential-shaped
// value) is refused whole. The refusal never echoes the text.
export function typed(value, field, max = LIMITS.name) {
  if (typeof value !== 'string') throw refuse('bad_field', `${field} must be a text`);
  if (value.length > max * 4) throw refuse('too_long', `${field} is over ${max} characters`);
  const t = value.replace(FORMAT, '').replace(CTRL, ' ').replace(/\s+/g, ' ').trim();
  if (!t) throw refuse('bad_field', `${field} is required`);
  if (t.length > max) throw refuse('too_long', `${field} is over ${max} characters`);
  if (maskText(t) !== t) throw refuse('credential_like_text', `${field} looks like a credential; the lab never takes one`);
  return t;
}
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,120}$/;
export function typedEmail(value, field = 'email') {
  const t = typed(value, field, LIMITS.email);
  if (!EMAIL.test(t)) throw refuse('bad_email', `${field} is not an email address`);
  return t;
}
const intIn = (v, lo, hi, field) => {
  if (!Number.isInteger(v) || v < lo || v > hi) throw refuse('bad_number', `${field} must be a whole number from ${lo} to ${hi}`);
  return v;
};
const idOf = (v, field) => {
  if (typeof v !== 'string' || !/^[a-z0-9-]{1,40}$/.test(v)) throw refuse('bad_id', `${field} is not a known id`);
  return v;
};
const detail = (id) => ({ id, ...OUTCOMES[id] });
// The support engineer of the Support P1 story: the demo user A (Salesforce user sfu-2, Privilege user pu-a), on the Minimum Access profile.
// The receipt status the guide records once the policy count has dropped to 0 (its "Expired / Revoked" counter).
export const RECEIPT_ENDED = 'Expired / Revoked';
const ISO_8601 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/;
// A strict ISO 8601 instant (Z or an offset): every component is checked, so 2026-02-31, T24:00, :60 and an offset over 23:59 are NaN, never rolled over.
export function parseIsoInstant(text) {
  const m = typeof text === 'string' && text.length <= 40 ? ISO_8601.exec(text) : null;
  if (!m) return NaN;
  const [y, mo, d, h, mi, s, ms] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? '0', (m[7] ?? '0').padEnd(3, '0')].map(Number);
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  if (mo < 1 || mo > 12 || d < 1 || d > days || h > 23 || mi > 59 || s > 59) return NaN;
  let offMin = 0;
  if (m[8] !== 'Z') { const oh = Number(m[8].slice(1, 3)); const om = Number(m[8].slice(4, 6)); if (oh > 23 || om > 59) return NaN; offMin = (m[8][0] === '-' ? -1 : 1) * (oh * 60 + om); }
  return Date.UTC(y, mo - 1, d, h, mi, s, ms) - offMin * 60000;
}
const ENGINEER = Object.freeze({ privilegeUserId: 'pu-a', requestMax: LIMITS.requests });

export class Engine {
  constructor(cast) { this.cast = cast; this.reset(); }

  reset() {
    const c = this.cast;
    this.nowMin = 0;
    this.n = { user: 0, set: 0, pol: 0, rcpt: 0, key: 0, audit: 0, mail: 0, asg: 0, tok: 0 };
    this.audit = [];
    this.calls = [];
    this.sf = { host: c.castOrgHost, loginUrl: c.castLoginUrl, takenElsewhere: new Set([c.castTakenUsername]), users: [], sets: [], assignments: [], eca: null, mailbox: [] };
    this._sfUser({ name: c.castAdminName, email: c.castAdminEmail, username: c.castAdminUsername, profile: 'System Administrator' });
    this._sfUser({ name: c.castAName, email: c.castAEmail, username: c.castAUsername, profile: 'Minimum Access - Salesforce' });
    this._sfUser({ name: c.castDupName1, email: c.castDupEmail, username: c.castDupUsername, profile: 'Minimum Access - Salesforce' });
    this._sfSet({ label: c.castPermSet });
    this._sfSet({ label: c.castLicensedSet, needsPsl: `${c.castLicensedSet} PSL` });
    this._sfSet({ label: c.castOtherLicenseSet, userLicense: c.castOtherLicense });
    const pu = (id, p) => ({ id, name: p[0], email: p[1], readOnly: true });
    this.support = { requests: [] };
    this.pv = {
      wizard: { orgUrl: null, instanceUrl: null, keys: [], certs: [], current: null, signedIn: null },
      app: null,
      users: [pu('pu-admin', [c.castAdminName, c.castAdminEmail]), pu('pu-a', [c.castAName, c.castAEmail]), pu('pu-dup1', [c.castDupName1, c.castDupEmail]),
        pu('pu-dup2', [c.castDupName2, c.castDupEmail]), pu('pu-c', [c.castCName, c.castCEmail]), pu('pu-f', [c.castFName, c.castFEmail])],
      rows: [], policies: [], receipts: [], reconcile: null,
    };
    this._log('lab', 'reset', 'A mock Salesforce org and an empty Privilege app: nothing connected yet');
  }

  // ---- bookkeeping ------------------------------------------------------------------------------------------------------------------------------
  _log(actor, kind, text) {
    this.audit.push({ n: ++this.n.audit, at: iso(this.nowMin), actor, kind, text });
    if (this.audit.length > LIMITS.audit) this.audit.shift();
  }
  // Every hop Privilege (or the wizard) makes to Salesforce, recorded for the trace. All hosts are .example; the bodies are the lab's reading.
  _call(method, path, request, status, response) {
    if (this.calls.length < LIMITS.calls) this.calls.push({ to: 'salesforce', host: this.sf.host, method, path, request, status, response });
  }
  takeCalls() { const c = this.calls; this.calls = []; return c; }

  // ---- the mock Salesforce org ------------------------------------------------------------------------------------------------------------------
  _sfUser({ name, email, username, profile, federationId = null }) {
    const u = { id: `sfu-${++this.n.user}`, name, email, username, profile, license: 'Salesforce', active: true, federationId, psls: [] };
    this.sf.users.push(u);
    return u;
  }
  _sfSet({ label, userLicense = null, needsPsl = null }) {
    const s = { id: `ps-${++this.n.set}`, label, userLicense, needsPsl, createdAt: this.nowMin };
    this.sf.sets.push(s);
    return s;
  }
  _user(id) { return this.sf.users.find((u) => u.id === id) || null; }
  _set(id) { return this.sf.sets.find((s) => s.id === id) || null; }
  _seatsUsed() { return this.sf.users.filter((u) => u.active && u.license === 'Salesforce').length; }
  _eca() { if (!this.sf.eca) throw refuse('no_external_client_app', 'Create the External Client App in Salesforce first', 409); return this.sf.eca; }

  // Why a permission set cannot be given to this user. The guide's three rules, in this order.
  _setBlock(user, set) {
    if (this.sf.assignments.some((a) => a.userId === user.id && a.setId === set.id)) return ['already_has_permission_set', 'Already has this permission set'];
    if (set.needsPsl && !user.psls.includes(set.needsPsl)) return ['needs_permission_set_license', 'Needs a permission set license'];
    if (set.userLicense && set.userLicense !== user.license) return ['license_mismatch', `License ${user.license} ≠ ${set.userLicense}`];
    return null;
  }

  sfCreateApp({ name }) {
    if (this.sf.eca) throw refuse('eca_exists', 'This org already has the External Client App (the lab models one)', 409);
    const n = typed(name, 'name');
    const eca = { name: n, distribution: 'Local', oauth: true, callbackUrl: 'https://login.salesforce.example', scopes: [], jwtBearer: false, cert: null, permitted: 'self_authorize', linkedSets: [], createdAt: this.nowMin, consumerKey: this.cast.castConsumerKey, keyRevealed: false, codeSent: null };
    this.sf.eca = eca;
    this._log('visitor', 'sf.createApp', `External Client App "${n}" created in Salesforce (can take up to 10 minutes to activate)`);
    return { name: n, activeAtMin: eca.createdAt + LIMITS.activateMin, activeAt: iso(eca.createdAt + LIMITS.activateMin), note: 'A new External Client App can take up to 10 minutes to activate' };
  }
  sfSetScopes({ scopes }) {
    const e = this._eca();
    if (!Array.isArray(scopes) || scopes.length > 10 || !scopes.every((s) => typeof s === 'string' && SCOPES.includes(s))) throw refuse('bad_scopes', `scopes must be a list drawn from: ${SCOPES.join(', ')}`);
    e.scopes = [...new Set(scopes)];
    this._log('visitor', 'sf.setScopes', `OAuth scopes: ${e.scopes.join(', ') || '(none)'}`);
    return { scopes: e.scopes };
  }
  sfSetJwtBearer({ enabled, certId }) {
    const e = this._eca();
    if (typeof enabled !== 'boolean') throw refuse('bad_field', 'enabled must be true or false');
    if (enabled) {
      if (certId !== undefined) {
        const id = idOf(certId, 'certId');
        const w = this.pv.wizard.certs.find((c) => c.id === id);
        if (w) e.cert = { id: w.id, fingerprint: w.fingerprint, commonName: w.commonName, notAfter: w.notAfter };
        else if (id === 'cert-stranger') e.cert = { id: id, fingerprint: sha(`${this.cast.castOrg}|stranger`), commonName: 'some other key', notAfter: this.nowMin + LIMITS.certDays * 1440 };
        else throw refuse('unknown_certificate', 'That certificate file is not one the wizard produced');
      } else if (!e.cert) throw refuse('certificate_required', 'Upload the .crt the wizard downloaded', 400);
    }
    e.jwtBearer = enabled;
    this._log('visitor', 'sf.setJwtBearer', enabled ? `JWT Bearer Flow enabled with certificate ${e.cert.id}` : 'JWT Bearer Flow disabled');
    return { jwtBearer: e.jwtBearer, certificate: e.cert && { ...e.cert, notAfterAt: iso(e.cert.notAfter) } };
  }
  sfSetPermittedUsers({ policy }) {
    const e = this._eca();
    if (policy !== 'self_authorize' && policy !== 'admin_preauthorized') throw refuse('bad_policy', 'policy must be self_authorize or admin_preauthorized');
    e.permitted = policy;
    this._log('visitor', 'sf.setPermittedUsers', policy === 'admin_preauthorized' ? 'Permitted Users: Admin approved users are pre-authorized' : 'Permitted Users: All users can self-authorize');
    return { permitted: policy };
  }
  sfCreatePermissionSet({ label, userLicense, needsPsl }) {
    const l = typed(label, 'label');
    if (this.sf.sets.length >= 40) throw refuse('workspace_full', 'The mock org holds at most 40 permission sets (Reset)', 409);
    if (this.sf.sets.some((s) => s.label === l)) throw refuse('duplicate_label', 'A permission set with that label exists', 409);
    const s = this._sfSet({ label: l, userLicense: userLicense === undefined ? null : typed(userLicense, 'userLicense'), needsPsl: needsPsl === undefined ? null : typed(needsPsl, 'needsPsl') });
    this._log('visitor', 'sf.createPermissionSet', `Permission set "${l}" created in Salesforce`);
    return { id: s.id, label: s.label };
  }
  sfLinkPermissionSet({ permSetId }) {
    const e = this._eca();
    const s = this._set(idOf(permSetId, 'permSetId'));
    if (!s) throw refuse('unknown_permission_set', 'No such permission set in the org', 404);
    if (!e.linkedSets.includes(s.id)) e.linkedSets.push(s.id);
    this._log('visitor', 'sf.linkPermissionSet', `"${s.label}" linked to the External Client App`);
    return { linkedSets: [...e.linkedSets] };
  }
  // An admin assigns by hand in Salesforce (how the integration user gets its permission set).
  sfAssignPermissionSet({ userId, permSetId }) {
    const u = this._user(idOf(userId, 'userId')); const s = this._set(idOf(permSetId, 'permSetId'));
    if (!u || !s) throw refuse('not_found', 'No such user or permission set in the org', 404);
    const b = this._setBlock(u, s);
    if (b) throw refuse(b[0], b[1], 422);
    this._assign(u, s, 'manual', null);
    this._log('visitor', 'sf.assignPermissionSet', `"${s.label}" assigned to ${u.name} by hand in Salesforce`);
    return { assigned: true };
  }
  sfRemoveAssignment({ userId, permSetId }) {
    const i = this.sf.assignments.findIndex((a) => a.userId === idOf(userId, 'userId') && a.setId === idOf(permSetId, 'permSetId'));
    if (i < 0) throw refuse('not_found', 'No such assignment', 404);
    this.sf.assignments.splice(i, 1);
    this._log('visitor', 'sf.removeAssignment', 'An assignment was removed by hand in Salesforce');
    return { removed: true };
  }
  _assign(user, set, source, policyId) {
    const a = { id: `psa-${++this.n.asg}`, userId: user.id, setId: set.id, source, policyId, at: this.nowMin };
    this.sf.assignments.push(a);
    return a;
  }
  sfCreateUser({ name, email, username, profile }) {
    const nm = typed(name, 'name'); const em = typedEmail(email); const un = typed(username, 'username', LIMITS.email);
    const pf = profile === undefined ? 'Minimum Access - Salesforce' : typed(profile, 'profile');
    if (this.sf.users.length >= 20) throw refuse('workspace_full', 'The mock org holds at most 20 users (Reset)', 409);
    if (this.sf.users.some((u) => u.username === un) || this.sf.takenElsewhere.has(un)) throw refuse('duplicate_username', 'Duplicate username', 422);
    if (this._seatsUsed() >= LIMITS.seats) throw refuse('no_licenses', 'No Salesforce licenses available', 422);
    const u = this._sfUser({ name: nm, email: em, username: un, profile: pf, federationId: null });
    this._log('visitor', 'sf.createUser', `Salesforce user ${nm} created (License: Salesforce)`);
    return { id: u.id, seatsUsed: this._seatsUsed(), seats: LIMITS.seats };
  }
  sfSetFederationId({ userId, federationId }) {
    const u = this._user(idOf(userId, 'userId'));
    if (!u) throw refuse('not_found', 'No such user', 404);
    u.federationId = typed(federationId, 'federationId', LIMITS.email);
    this._log('visitor', 'sf.setFederationId', `Federation ID set on ${u.name}`);
    return { id: u.id };
  }
  sfDeactivateUser({ userId }) {
    const u = this._user(idOf(userId, 'userId'));
    if (!u) throw refuse('not_found', 'No such user', 404);
    u.active = false;
    this._log('visitor', 'sf.deactivateUser', `Salesforce user ${u.name} deactivated (frees a seat)`);
    return { seatsUsed: this._seatsUsed(), seats: LIMITS.seats };
  }
  // Salesforce emails a verification code to the app's contact email before it shows the Consumer Key.
  sfRequestKeyCode() {
    const e = this._eca();
    e.codeSent = this.cast.castKeyCode;
    if (this.sf.mailbox.length >= LIMITS.mailbox) throw refuse('workspace_full', 'The mock mailbox holds at most 20 messages (Reset)', 409);
    this.sf.mailbox.push({ n: ++this.n.mail, at: iso(this.nowMin), to: this.cast.castAdminEmail, subject: 'Verification code for the Consumer Key (MOCK email, never sent)', code: e.codeSent });
    this._log('visitor', 'sf.requestKeyCode', 'Salesforce emailed a verification code to the app\'s contact email (a mock mailbox entry)');
    return { sentTo: this.cast.castAdminEmail, mock: true, note: 'MOCK mailbox: no email was sent' };
  }
  sfRevealConsumerKey({ code }) {
    const e = this._eca();
    const c = typed(code, 'code', 12);
    if (!e.codeSent || c !== e.codeSent) throw refuse('bad_verification_code', 'That verification code is not the one Salesforce sent', 422);
    e.keyRevealed = true;
    this._log('visitor', 'sf.revealConsumerKey', 'Consumer Key shown');
    return { consumerKey: e.consumerKey, label: 'MOCK consumer key issued by this lab, not a Salesforce key' };
  }

  // The JWT-bearer sign-in check. `consumerKey` and `username` are what the wizard form holds; `keyFingerprint` is the key Privilege signs with.
  // A failure is an outcome with a cause and the fix (data.js OUTCOMES). The guide records the causes in OUTCOMES; any other incomplete setup is the
  // lab's own `not_modelled` refusal, which says nothing about what Salesforce answers.
  _signIn({ consumerKey, username, keyFingerprint }) {
    const e = this.sf.eca;
    const known = e && consumerKey === e.consumerKey;
    const req = { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: { header: { alg: 'RS256' }, claims: { iss: known ? consumerKey : '(typed value, not echoed)', sub: username, aud: this.sf.loginUrl, exp: iso(this.nowMin + 3) }, signature: `(RS256 over the claims, key ${keyFingerprint.slice(0, 12)}, mock)` } };
    const fail = (id) => {
      const d = OUTCOMES[id];
      this._call('POST', '/services/oauth2/token', req, 400, { error: d.sfError || undefined, error_description: d.sfDescription || undefined, note: d.sfError ? undefined : 'Salesforce\'s own wording for this failure was not captured; the lab shows the cause and the fix only' });
      return { ok: false, outcome: id };
    };
    if (!known) return fail('invalid_client_id');
    if (this.nowMin < e.createdAt + LIMITS.activateMin) return fail('not_propagated');
    if (!e.jwtBearer || !e.cert || !e.scopes.includes('api')) return fail('not_modelled');
    if (!e.scopes.includes('refresh_token')) return fail('missing_refresh_scope');
    if (e.cert.fingerprint !== keyFingerprint) return fail('signature_mismatch');
    const user = this.sf.users.find((u) => u.username === username);
    if (!user || !user.active || user.license !== 'Salesforce') return fail('not_modelled');
    if (e.permitted !== 'admin_preauthorized') return fail('not_preauthorized');
    if (!e.linkedSets.length) return fail('permset_not_linked');
    if (!this.sf.assignments.some((a) => a.userId === user.id && e.linkedSets.includes(a.setId))) return fail('permset_not_assigned');
    const token = `mock-sf-access-${++this.n.tok}`;
    this._call('POST', '/services/oauth2/token', req, 200, { access_token: token, token_type: 'Bearer', instance_url: this.sf.loginUrl, scope: e.scopes.join(' '), note: 'MOCK token issued by this lab, not a Salesforce token' });
    return { ok: true, user, token };
  }
  _outcomeError(id, status, code, message) { return refuse(code, message, status, { outcome: detail(id) }); }

  // ---- the Privilege wizard ---------------------------------------------------------------------------------------------------------------------
  wizardOrgUrl({ url }) {
    const raw = typed(url, 'url', 200);
    let u; try { u = new URL(raw); } catch { throw refuse('not_an_org_url', 'That is not a web address'); }
    const host = u.hostname.toLowerCase();
    if (u.protocol !== 'https:' || !/\.(salesforce|force|salesforce-setup)\.example$/.test(host)) throw refuse('not_an_org_url', 'Paste any address from the signed-in org (Lightning or Setup); the lab accepts only the mock org\'s .example hosts');
    if (host.split('.')[0] !== `${this.cast.castOrg}-dev-ed`) throw refuse('not_an_org_url', 'The lab has one mock org: paste an address from it');
    this.pv.wizard.orgUrl = this.sf.host; this.pv.wizard.instanceUrl = this.sf.loginUrl;
    this._log('visitor', 'wizard.orgUrl', `Org URL converted to the My Domain URL ${this.sf.loginUrl}`);
    return { instanceUrl: this.sf.loginUrl };
  }
  _newKey() {
    const w = this.pv.wizard;
    if (w.keys.length >= LIMITS.keys) throw refuse('workspace_full', 'The wizard holds at most 20 keys (Reset)', 409);
    const k = ++this.n.key;
    const fingerprint = sha(`${this.cast.castOrg}|wizard-key|${k}`);
    w.keys.push({ id: `key-${k}`, fingerprint });
    const cert = { id: `cert-${k}`, keyId: `key-${k}`, fingerprint, commonName: this.cast.castEccName, notAfter: this.nowMin + LIMITS.certDays * 1440, file: `privilege-${k}.crt` };
    w.certs.push(cert); w.current = `key-${k}`; w.signedIn = null;
    return cert;
  }
  wizardGenerateKey() {
    if (!this.pv.wizard.orgUrl) throw refuse('org_url_first', 'Paste the org URL first (step 1)', 409);
    if (this.pv.wizard.current) throw refuse('key_exists', 'A key exists; use regenerate (and upload the new certificate)', 409);
    const c = this._newKey();
    this._log('visitor', 'wizard.generateKey', `Key and certificate generated (${c.file}, valid two years); the private key stays in the wizard form only`);
    return { certFile: { ...c, notAfterAt: iso(c.notAfter) }, note: 'Keep the wizard open: the private key exists only in that form' };
  }
  wizardRegenerateKey() {
    if (!this.pv.wizard.current) throw refuse('key_first', 'Generate the key first', 409);
    const c = this._newKey();
    this._log('visitor', 'wizard.regenerateKey', `Key regenerated (${c.file}); the certificate already uploaded to the app no longer matches`);
    return { certFile: { ...c, notAfterAt: iso(c.notAfter) }, note: 'Upload this new certificate to the app, or sign-in fails with a certificate error' };
  }
  wizardSignIn({ consumerKey, username }) {
    const w = this.pv.wizard;
    if (!w.current) throw refuse('key_first', 'Generate the key and certificate first', 409);
    const un = typed(username, 'username', LIMITS.email);
    const ck = typeof consumerKey === 'string' && consumerKey.length <= 120 ? consumerKey.trim() : '';
    if (!ck) throw refuse('bad_field', 'consumerKey is required');
    const key = w.keys.find((k) => k.id === w.current);
    const r = this._signIn({ consumerKey: ck, username: un, keyFingerprint: key.fingerprint });
    if (!r.ok) {
      w.signedIn = null;
      this._log('visitor', 'wizard.signIn', `Sign-in refused: ${r.outcome}`);
      throw this._outcomeError(r.outcome, 422, r.outcome, `Sign-in refused: ${OUTCOMES[r.outcome].cause}`);
    }
    w.signedIn = { username: un, host: this.sf.host, consumerKey: ck, keyFingerprint: key.fingerprint, at: this.nowMin };
    this._log('visitor', 'wizard.signIn', `Signed in to ${this.sf.host} as ${un}`);
    return { message: `Signed in to ${this.sf.host} as ${un}`, outcome: detail('signed_in'), token: { value: r.token, label: 'MOCK token issued by this lab, not a Salesforce token' } };
  }

  // ---- the Privilege app ------------------------------------------------------------------------------------------------------------------------
  _app() { if (!this.pv.app) throw refuse('no_application', 'Create the application first (wizard step 3)', 409); return this.pv.app; }
  appCreate({ name }) {
    const w = this.pv.wizard;
    if (!w.signedIn) throw refuse('sign_in_first', 'Sign in to Salesforce in the wizard first (the green "Signed in to ... as ..." line)', 409);
    const n = typed(name, 'name');
    if (n.length < 4) throw refuse('name_too_short', 'The application name needs at least 4 characters');
    if (this.pv.app) throw refuse('app_exists', 'One application per Salesforce org', 409);
    this.pv.app = { id: 'app-1', name: n, host: this.sf.host, consumerKey: w.signedIn.consumerKey, username: w.signedIn.username, createdAt: this.nowMin, syncStatus: 'Ready', permissions: [], sfUsers: [], lastSyncAt: null };
    this._log('visitor', 'app.create', `Application "${n}" created (Sync Status Ready)`);
    const s = this._sync();
    return { app: n, syncStatus: 'Ready', permissions: s.permissions };
  }
  // Privilege signs in as the integration user for every action it takes in Salesforce. A failure here is a DOWNSTREAM failure: 502, structured.
  _connect() {
    const a = this._app();
    const w = this.pv.wizard; // Privilege signs with the wizard's CURRENT key: a regenerate makes the uploaded certificate stale
    const r = this._signIn({ consumerKey: a.consumerKey, username: a.username, keyFingerprint: w.keys.find((k) => k.id === w.current).fingerprint });
    if (!r.ok) {
      a.syncStatus = 'Error';
      throw this._outcomeError(r.outcome, 502, 'salesforce_sign_in_failed', `Privilege could not sign in to Salesforce: ${OUTCOMES[r.outcome].cause}`);
    }
    a.syncStatus = 'Ready';
    return r;
  }
  usersAdd({ privilegeUserId }) {
    const a = this._app();
    const pu = this.pv.users.find((u) => u.id === idOf(privilegeUserId, 'privilegeUserId'));
    if (!pu) throw refuse('unknown_privilege_user', 'No such Privilege user', 404);
    if (this.pv.rows.some((r) => r.privilegeUserId === pu.id)) throw refuse('already_added', 'That user is already on the app', 409);
    this.pv.rows.push({ privilegeUserId: pu.id, status: 'waiting', reason: 'Waiting for Salesforce', sfUserId: null, profile: null });
    this._log('visitor', 'users.add', `${pu.name} added to ${a.name}: waiting for Salesforce`);
    return { status: 'waiting' };
  }
  _link() {
    const a = this.pv.app; const out = { linked: [], refused: [], waiting: [] };
    for (const row of this.pv.rows) {
      if (row.status === 'linked') continue;
      const pu = this.pv.users.find((u) => u.id === row.privilegeUserId);
      const same = this.pv.users.filter((u) => u.email === pu.email).length;
      if (same > 1) { row.reason = `Not linked: its email matches ${same} Privilege users`; out.refused.push(row.privilegeUserId); continue; }
      const sfu = a.sfUsers.find((u) => u.email === pu.email); // exactly identical email; Federation ID is not used
      if (!sfu) {
        const fed = a.sfUsers.find((u) => u.federationId === pu.email);
        row.reason = fed ? 'Waiting for Salesforce: no Salesforce user has this exact email (the guide\'s one test run showed a Federation ID did not override this, so the lab does not use it)' : 'Waiting for Salesforce: no Salesforce user has this exact email';
        out.waiting.push(row.privilegeUserId); continue;
      }
      row.status = 'linked'; row.reason = null; row.sfUserId = sfu.id; row.profile = sfu.profile;
      out.linked.push(row.privilegeUserId);
    }
    return out;
  }
  _sync() {
    const a = this._app();
    this._connect();
    this._call('GET', `/services/data/${SF_API}/query?q=SELECT Id, Label FROM PermissionSet WHERE IsOwnedByProfile = false`, null, 200, { totalSize: this.sf.sets.length, records: this.sf.sets.map((s) => ({ Id: s.id, Label: s.label })) });
    this._call('GET', `/services/data/${SF_API}/query?q=SELECT Id, Username, Email, Profile.Name, IsActive FROM User`, null, 200, { totalSize: this.sf.users.length, records: this.sf.users.map((u) => ({ Id: u.id, Username: u.username, Email: u.email, IsActive: u.active })) });
    a.permissions = this.sf.sets.map((s) => ({ id: s.id, label: s.label, userLicense: s.userLicense, needsPsl: s.needsPsl }));
    a.sfUsers = this.sf.users.map((u) => ({ id: u.id, email: u.email, username: u.username, profile: u.profile, active: u.active, federationId: u.federationId }));
    a.lastSyncAt = this.nowMin;
    const link = this._link();
    const refusals = this.pv.rows.filter((r) => link.refused.includes(r.privilegeUserId) || link.waiting.includes(r.privilegeUserId)).map((r) => ({ privilegeUserId: r.privilegeUserId, reason: r.reason }));
    return { permissions: a.permissions.length, ...link, refusals };
  }
  appSync() {
    const s = this._sync();
    this._reconcile();
    this._log('visitor', 'app.sync', `Sync: ${s.linked.length} linked, ${s.refused.length} refused, ${s.waiting.length} waiting`);
    return { ...s, reconcile: this._reconcileView() };
  }
  appReconcile() {
    this._connect();
    this._call('GET', `/services/data/${SF_API}/query?q=SELECT Id, AssigneeId, PermissionSetId FROM PermissionSetAssignment`, null, 200, { totalSize: this.sf.assignments.length, records: this.sf.assignments.map((x) => ({ Id: x.id, AssigneeId: x.userId, PermissionSetId: x.setId })) });
    const done = this._processRevocations();
    this._reconcile(true);
    this._log('visitor', 'app.reconcile', `Receipts refreshed: ${done.length} removal(s) done`);
    return { removed: done, reconcile: this._reconcileView() };
  }

  // ---- grant, revoke, reconcile ---------------------------------------------------------------------------------------------------------
  policyGrant({ privilegeUserId, permSetId, durationMin }) {
    const a = this._app();
    const row = this.pv.rows.find((r) => r.privilegeUserId === idOf(privilegeUserId, 'privilegeUserId'));
    if (!row || row.status !== 'linked') throw refuse('user_not_linked', 'Only a linked user can be granted a permission (Add Users, then Sync)', 409);
    const listed = a.permissions.find((p) => p.id === idOf(permSetId, 'permSetId'));
    if (!listed) throw refuse('unknown_permission', 'That permission set is not in the Permissions list: Sync after creating it in Salesforce', 404);
    const mins = intIn(durationMin, 1, LIMITS.grantMaxMin, 'durationMin');
    if (this.pv.policies.length >= LIMITS.policies || this.pv.receipts.length >= LIMITS.receipts) throw refuse('workspace_full', 'This workspace is full (Reset)', 409);
    const user = this._user(row.sfUserId); const set = this._set(listed.id);
    const b = this._setBlock(user, set);
    if (b) throw refuse(b[0], b[1], 422);
    this._connect();
    const asg = this._assign(user, set, 'privilege', null);
    this._call('POST', `/services/data/${SF_API}/sobjects/PermissionSetAssignment`, { AssigneeId: user.id, PermissionSetId: set.id }, 201, { id: asg.id, success: true });
    const pol = { id: `pol-${String(++this.n.pol).padStart(4, '0')}`, privilegeUserId: row.privilegeUserId, sfUserId: user.id, setId: set.id, setLabel: set.label, startAt: this.nowMin, endAt: this.nowMin + mins, status: 'active', assignmentId: asg.id };
    asg.policyId = pol.id;
    this.pv.policies.push(pol);
    this.pv.receipts.push({ id: `rcpt-${String(++this.n.rcpt).padStart(4, '0')}`, policyId: pol.id, privilegeUserId: pol.privilegeUserId, sfUserId: user.id, setId: set.id, setLabel: set.label, startAt: pol.startAt, endAt: pol.endAt, status: 'Granted', history: [{ at: this.nowMin, status: 'Granted' }] });
    this._reconcile(true);
    this._log('visitor', 'policy.grant', `${set.label} granted to ${user.name} until ${iso(pol.endAt)}`);
    return { policyId: pol.id, endAt: iso(pol.endAt), receipt: 'Granted' };
  }
  _receipt(policyId) { return this.pv.receipts.find((r) => r.policyId === policyId); }
  _setReceipt(r, status) { r.status = status; r.history.push({ at: this.nowMin, status }); }
  // Deleting the policy queues the removal: the POLICY reads "Revoke pending, access still live" and the assignment is still in Salesforce until the visitor
  // refreshes the receipts (app.reconcile, the only thing that completes it). The receipt keeps reading Granted until then.
  policyDelete({ policyId }) {
    this._app();
    const p = this.pv.policies.find((x) => x.id === idOf(policyId, 'policyId'));
    if (!p) throw refuse('unknown_policy', 'No such policy', 404);
    if (p.status !== 'active') throw refuse('policy_not_active', 'That policy is already ended or being revoked', 409);
    p.status = 'revoke_pending';
    this._log('visitor', 'policy.delete', `Policy ${p.id} deleted: revoke pending, access still live`);
    return { status: 'Revoke pending, access still live' };
  }
  // Removes the Salesforce assignment of every queued policy (the caller has already signed in). The receipt then reads the guide's "Expired / Revoked".
  _processRevocations() {
    const done = [];
    for (const p of this.pv.policies.filter((x) => x.status === 'revoke_pending')) {
      const i = this.sf.assignments.findIndex((x) => x.id === p.assignmentId);
      if (i >= 0) this.sf.assignments.splice(i, 1);
      this._call('DELETE', `/services/data/${SF_API}/sobjects/PermissionSetAssignment/${p.assignmentId}`, null, 204, null);
      p.status = 'ended';
      this._setReceipt(this._receipt(p.id), RECEIPT_ENDED);
      done.push(p.id);
    }
    return done;
  }
  clockAdvance({ minutes }) {
    const m = intIn(minutes, 1, LIMITS.advanceMaxMin, 'minutes');
    if (this.nowMin + m > LIMITS.clockMaxMin) throw refuse('clock_limit', 'The lab clock stops at ten years after its start (Reset)', 409);
    this.nowMin += m;
    this._log('visitor', 'clock.advance', `Lab clock moved forward ${m} minute(s)`);
    if (this.pv.app) this._reconcile();
    return { now: iso(this.nowMin) };
  }

  // What Privilege believes after a reconcile: of the assignments Salesforce reports for the app's linked users (apart from the permission set linked to the
  // app itself), `confirmed` are the ones an active policy accounts for.
  // "1 confirmed" therefore holds only while the Salesforce assignment really exists.
  // While a deleted policy's removal is queued the last refresh stays as it was (the guide says nothing about reconciliation then); only a grant or
  // Refresh receipts (`force`) recomputes it.
  _reconcile(force = false) {
    const a = this.pv.app; if (!a) return;
    if (!force && this.pv.policies.some((p) => p.status === 'revoke_pending')) return;
    const eca = this.sf.eca;
    const linked = new Set(this.pv.rows.filter((r) => r.status === 'linked').map((r) => r.sfUserId));
    const counts = { confirmed: 0 };
    for (const asg of this.sf.assignments) {
      if (!linked.has(asg.userId) || (eca && eca.linkedSets.includes(asg.setId))) continue;
      const pol = asg.policyId ? this.pv.policies.find((p) => p.id === asg.policyId) : null;
      if (pol && pol.status === 'active') counts.confirmed++;
    }
    const pols = this.pv.policies;
    a.reconcileAt = this.nowMin;
    this.pv.reconcile = { at: this.nowMin, atIso: iso(this.nowMin), counts, policies: { active: pols.filter((p) => p.status === 'active').length, expiredRevoked: pols.filter((p) => p.status === 'ended').length } };
  }
  _reconcileView() { return this.pv.reconcile; }

  // ---- the Support P1 story ---------------------------------------------------------------------------------------------------------------------
  // The engineer asks for access with a note and an end time; Privilege grants the Case Read Access set through the same policy.grant as the Grant page.
  // The note is the lab's own request step (nothing here claims Privilege stores it) and the end time is only the "until" date the policy records:
  // nothing ends the access by itself, End access (deleting the policy) does.
  supportRequestAccess({ note, endAt }) {
    this._app();
    const n = typed(note, 'note', LIMITS.note);
    const t = parseIsoInstant(endAt);
    if (Number.isNaN(t) && !(typeof endAt === 'string' && ISO_8601.test(endAt))) throw refuse('bad_end_time', 'The end time must be an ISO 8601 date and time with Z or an offset, for example 2026-11-02T11:00:00Z');
    if (!Number.isFinite(t) || (t - LAB_START) % 60000 !== 0) throw refuse('bad_end_time', 'The end time must be a real date and time on a whole minute');
    const mins = (t - LAB_START) / 60000 - this.nowMin;
    if (mins < 1 || mins > LIMITS.grantMaxMin) throw refuse('bad_end_time', 'The end time must be after the lab clock now and within 366 days');
    if (this.support.requests.length >= ENGINEER.requestMax) throw refuse('workspace_full', 'This workspace is full (Reset)', 409);
    const set = this.sf.sets.find((x) => x.label === this.cast.castPermSet);
    const r = this.policyGrant({ privilegeUserId: ENGINEER.privilegeUserId, permSetId: set.id, durationMin: mins });
    const req = { id: `req-${String(this.support.requests.length + 1).padStart(4, '0')}`, by: this._engineer().name, note: n, requestedAt: iso(this.nowMin), endAt: r.endAt, policyId: r.policyId };
    this.support.requests.push(req);
    this._log('visitor', 'support.requestAccess', `${req.by} asked for ${set.label} until ${req.endAt}`);
    return { ...r, request: req };
  }
  _engineer() { return this.sf.users.find((u) => u.username === this.cast.castAUsername); }
  // Visibility of Cases is DERIVED, never stored: the engineer sees them if and only if the Salesforce user holds the Case Read Access assignment.
  // While access is denied the answer carries no title and no count.
  _support() {
    const u = this._engineer(); const set = this.sf.sets.find((x) => x.label === this.cast.castPermSet);
    const canSeeCases = Boolean(u && set && this.sf.assignments.some((a) => a.userId === u.id && a.setId === set.id));
    const row = this.pv.rows.find((r) => r.privilegeUserId === ENGINEER.privilegeUserId);
    const ready = Boolean(this.pv.app && row && row.status === 'linked');
    const pol = this.pv.policies.find((p) => p.privilegeUserId === ENGINEER.privilegeUserId && p.setId === set?.id && p.status !== 'ended') || null;
    return {
      ready, permissionSet: set?.label, engineer: u && { name: u.name, email: u.email, username: u.username, profile: u.profile },
      canSeeCases, cases: canSeeCases ? fillDeep(CASES, this.cast) : null,
      access: pol && { policyId: pol.id, status: pol.status, endAt: iso(pol.endAt) },
      requests: this.support.requests.map((r) => ({ ...r })),
    };
  }

  // ---- the whole state, for the page ------------------------------------------------------------------------------------------------------------
  snapshot() {
    const e = this.sf.eca; const w = this.pv.wizard; const a = this.pv.app;
    const name = (id) => this.pv.users.find((u) => u.id === id)?.name;
    const checklist = [
      { id: 'org-url', label: 'Org URL converted to My Domain', done: Boolean(w.orgUrl) },
      { id: 'key-cert', label: 'Key and certificate generated', done: Boolean(w.current) },
      { id: 'create-app', label: 'External Client App created, scopes and JWT set', done: Boolean(e && e.scopes.length && e.jwtBearer && e.cert) },
      { id: 'pre-authorize', label: 'Admin approved users are pre-authorized', done: Boolean(e && e.permitted === 'admin_preauthorized') },
      { id: 'permission-set', label: 'Permission set linked to the app', done: Boolean(e && e.linkedSets.length) },
      { id: 'assign', label: 'Permission set assigned to the signing-in user', done: Boolean(e && this.sf.assignments.some((x) => e.linkedSets.includes(x.setId))) },
    ];
    return {
      clock: { nowMin: this.nowMin, now: iso(this.nowMin) },
      checklist,
      salesforce: {
        host: this.sf.host, loginUrl: this.sf.loginUrl, licenses: { total: LIMITS.seats, used: this._seatsUsed(), free: LIMITS.seats - this._seatsUsed() },
        users: this.sf.users.map((u) => ({ id: u.id, name: u.name, email: u.email, username: u.username, profile: u.profile, license: u.license, active: u.active, federationId: u.federationId })),
        permissionSets: this.sf.sets.map((s) => ({ id: s.id, label: s.label, userLicense: s.userLicense, needsPsl: s.needsPsl, linked: Boolean(e && e.linkedSets.includes(s.id)) })),
        assignments: this.sf.assignments.map((x) => ({ id: x.id, userId: x.userId, setId: x.setId, source: x.source, policyId: x.policyId, at: iso(x.at) })),
        externalClientApp: e && { name: e.name, distribution: e.distribution, callbackUrl: e.callbackUrl, scopes: e.scopes, jwtBearer: e.jwtBearer, certificate: e.cert && { ...e.cert, notAfterAt: iso(e.cert.notAfter) }, permittedUsers: e.permitted, linkedSets: e.linkedSets, createdAt: iso(e.createdAt), activeAt: iso(e.createdAt + LIMITS.activateMin), active: this.nowMin >= e.createdAt + LIMITS.activateMin, consumerKey: e.keyRevealed ? e.consumerKey : null, consumerKeyNote: e.keyRevealed ? 'MOCK consumer key issued by this lab, not a Salesforce key' : 'Hidden until the emailed verification code is entered' },
        mailbox: this.sf.mailbox,
      },
      privilege: {
        wizard: { orgUrl: w.orgUrl, instanceUrl: w.instanceUrl, currentKey: w.current, certs: w.certs.map((c) => ({ ...c, notAfterAt: iso(c.notAfter) })), signedIn: w.signedIn && { username: w.signedIn.username, host: w.signedIn.host, message: `Signed in to ${w.signedIn.host} as ${w.signedIn.username}` } },
        app: a && { id: a.id, name: a.name, host: a.host, syncStatus: a.syncStatus, authorizedUser: a.username, lastSyncAt: a.lastSyncAt === null ? null : iso(a.lastSyncAt), permissions: a.permissions },
        directory: this.pv.users.map((u) => ({ id: u.id, name: u.name, email: u.email, readOnly: u.readOnly, sharedEmail: this.pv.users.filter((x) => x.email === u.email).length > 1 })),
        users: this.pv.rows.map((r) => ({ ...r, name: name(r.privilegeUserId) })),
        policies: this.pv.policies.map((p) => ({ ...p, startAtIso: iso(p.startAt), endAtIso: iso(p.endAt), userName: name(p.privilegeUserId) })),
        receipts: this.pv.receipts.map((r) => ({ ...r, userName: name(r.privilegeUserId), startAtIso: iso(r.startAt), endAtIso: iso(r.endAt) })),
        reconcile: this.pv.reconcile,
      },
      support: this._support(),
      audit: this.audit.slice(-60),
    };
  }
}

export { iso, isObj };
