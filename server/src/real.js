// REAL mode: OWNER-RUN, READ-ONLY. One sign-in to the ONE Salesforce origin named in the lab's own .env (a JWT-bearer sign-in, RS256, node:crypto), then
// a read of that org's permission sets and users. Nothing is granted, changed or deleted. Agents never run this against a live org: the tests use an
// in-process stub token endpoint on loopback.
//
// Guards (rulebook section 2, "a probe feature"): only the configured origin, https (loopback http for a stub), no redirects at all (so no cross-origin
// ones), a size cap and a time cap, an SSRF guard (no private, loopback or link-local address behind a real name, no IP literal, no credentials or path in
// the origin), a confirm gate in app.js, and never on by default in Docker (config.js). The private key is WRITE-ONLY: it is read from the file named by
// SF_PRIVATE_KEY_PATH when a read runs, used to sign, and dropped; it is never returned, logged, cached or put in an error message. The access token
// Salesforce returns is used for two GETs and dropped; it is never returned either.
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import { createPrivateKey, sign as cryptoSign } from 'node:crypto';
import { isLoopbackHost } from './safety.js';
import { refuse } from './errors.js';
import { OUTCOMES } from './data.js';
import { newTrace, formatTraceparent } from './trace.js';
import { maskText } from './shared/mask.js';

export const REAL_LIMITS = Object.freeze({ timeoutMs: 10_000, maxBytes: 1_048_576, maxRecords: 200, keyBytes: 16_384, jwtSeconds: 180 });
const API = 'v62.0';
const SOQL = {
  permissionSets: 'SELECT Id, Label, Name FROM PermissionSet WHERE IsOwnedByProfile = false ORDER BY Label LIMIT 200',
  users: 'SELECT Id, Username, Email, Name, IsActive FROM User WHERE UserType = \'Standard\' ORDER BY Username LIMIT 200',
};

// ---- the origin and the SSRF guard ---------------------------------------------------------------------------------------------------------------
// Expand an IPv6 text into 8 hextets (numbers), or null. Handles "::" and a dotted IPv4 tail.
function hextets(text) {
  let v = String(text).toLowerCase();
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (tail) { const o = tail[1].split('.').map(Number); v = `${v.slice(0, -tail[1].length)}${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`; }
  const halves = v.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  if (halves.length === 1 && head.length !== 8) return null;
  const fill = 8 - head.length - rest.length;
  if (fill < 0 || (halves.length === 2 && fill < 1)) return null;
  const all = [...head, ...new Array(halves.length === 2 ? fill : 0).fill('0'), ...rest].map((h) => parseInt(h, 16));
  return all.length === 8 && all.every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffff) ? all : null;
}
// Anything that is not a public unicast address: loopback, private, link-local, carrier-grade NAT, documentation (TEST-NETs, 2001:db8::/32), benchmarking,
// multicast and reserved IPv4; IPv6 unspecified, loopback, unique-local, link-local, site-local fec0::/10, multicast, discard 100::/64, NAT64 64:ff9b::/96,
// 6to4 2002::/16, Teredo 2001::/32, and IPv4-mapped or -compatible addresses in dotted or hex form (the embedded IPv4 is judged).
export function isPrivateAddress(ip) {
  const v = String(ip).toLowerCase();
  if (net.isIPv4(v)) {
    const [a, b, c] = v.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
      || (a === 192 && b === 0 && (c === 0 || c === 2)) || (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113);
  }
  if (net.isIPv6(v)) {
    const h = hextets(v);
    if (!h) return true;
    const [h0, h1, h2, h3, h4, h5, h6, h7] = h;
    if (h.slice(0, 5).every((x) => x === 0)) {
      if (h5 === 0xffff) return isPrivateAddress(`${h6 >> 8}.${h6 & 255}.${h7 >> 8}.${h7 & 255}`); // ::ffff:a.b.c.d in dotted or hex form
      if (h5 === 0) return true; // ::, ::1 and the deprecated IPv4-compatible ::a.b.c.d
    }
    return (h0 & 0xfe00) === 0xfc00 || (h0 & 0xffc0) === 0xfe80 || (h0 & 0xffc0) === 0xfec0 || (h0 & 0xff00) === 0xff00
      || h0 === 0x2002 || (h0 === 0x0064 && h1 === 0xff9b && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0) || (h0 === 0x0100 && h1 === 0 && h2 === 0 && h3 === 0)
      || (h0 === 0x2001 && (h1 === 0 || h1 === 0x0db8));
  }
  return true; // not an address at all: refuse
}

// An origin and nothing else. Returns { origin, host, loopback } or { problem }.
export function parseOrigin(raw) {
  let u; try { u = new URL(String(raw)); } catch { return { problem: 'not a web address' }; }
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const loopback = isLoopbackHost(host);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && loopback)) return { problem: 'https is required (plain http only for a loopback stub)' };
  if (loopback && u.protocol === 'https:') return { problem: 'a loopback address is for a plain-http stub only' };
  if (u.username || u.password) return { problem: 'the address carries credentials' };
  if ((u.pathname && u.pathname !== '/') || u.search || u.hash) return { problem: 'the address must be an origin only (no path, query or fragment)' };
  if (host.endsWith('.')) return { problem: 'a name with a trailing dot is refused' };
  if (u.port === '0') return { problem: 'port 0 is refused' };
  if (!loopback && (net.isIP(host) || host === 'localhost' || /\.(local|localhost|internal|lan|home|corp)$/.test(host) || !host.includes('.'))) return { problem: 'a private, local or IP-literal host is refused' };
  return { origin: u.origin, host, loopback };
}

// DNS lookup that refuses a name resolving to a private, loopback or link-local address (a rebinding or SSRF through a public-looking name).
export function guardedLookup(hostname, options, cb) {
  dns.lookup(hostname, options, (err, address, family) => {
    if (err) return cb(err);
    const list = Array.isArray(address) ? address.map((a) => a.address) : [address];
    if (list.some(isPrivateAddress)) return cb(Object.assign(new Error('blocked address'), { code: 'EBLOCKED' }));
    return cb(null, address, family);
  });
}

// ---- one bounded request ---------------------------------------------------------------------------------------------------------------------------
function request({ origin, loopback, method, path, headers, body, timeoutMs = REAL_LIMITS.timeoutMs }) {
  return new Promise((resolve, reject) => {
    const u = new URL(path, origin);
    if (u.origin !== origin) return reject(refuse('salesforce_cross_origin', 'Refused: that address is not the configured Salesforce origin', 502));
    const lib = u.protocol === 'https:' ? https : http;
    let done = false; let timer; let req;
    const finish = (fn, v) => { if (!done) { done = true; clearTimeout(timer); fn(v); } };
    try {
      req = lib.request({ hostname: u.hostname.replace(/^\[|\]$/g, ''), port: u.port || undefined, path: u.pathname + u.search, method, headers, agent: false, ...(loopback ? {} : { lookup: guardedLookup }) }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400) { res.resume(); req.destroy(); return finish(reject, refuse('salesforce_redirect_refused', 'Salesforce answered with a redirect; the lab follows none', 502)); }
        const chunks = []; let size = 0;
        res.on('data', (c) => {
          size += c.length;
          if (size > REAL_LIMITS.maxBytes) { req.destroy(); finish(reject, refuse('salesforce_response_too_large', 'Salesforce\'s answer was over the 1 MiB cap and was dropped', 502)); } else chunks.push(c);
        });
        res.on('end', () => finish(resolve, { status: res.statusCode, text: Buffer.concat(chunks).toString('utf8') }));
        res.on('error', (e) => finish(reject, mapNetError(e)));
      });
      timer = setTimeout(() => { req.destroy(); finish(reject, refuse('salesforce_timeout', 'Salesforce did not answer within the time cap (10 seconds)', 504)); }, timeoutMs);
      req.on('error', (e) => finish(reject, mapNetError(e)));
      if (body) req.write(body);
      req.end();
    } catch (e) { finish(reject, mapNetError(e)); } // the network guard throws at connect time: a named failure, not a raw error
  });
}
// Downstream failures are named and structured (rule 23), never a hang, an HTML page or an empty 200. Messages carry no address and no value.
function mapNetError(e) {
  if (e && typeof e.status === 'number' && typeof e.code === 'string') return e;
  const code = e && e.code;
  if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT') return refuse('salesforce_timeout', 'Salesforce did not answer within 10 seconds', 504);
  return refuse('salesforce_unreachable', `Salesforce could not be reached (${typeof code === 'string' ? code : /network blocked/.test(String(e && e.message)) ? 'blocked by the lab\'s network guard' : 'connection failed'})`, 502);
}
const parseJson = (text) => { try { return JSON.parse(text); } catch { return undefined; } };
// Anything Salesforce sends back that the lab shows goes through here: a JWT (the assertion we sent, echoed by an error) or anything the shared masker
// would change is replaced by a fixed note, never shown. The text is cut first, so the checks run on a short string.
const JWTISH = /eyJ|[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/;
export const WITHHELD = '[withheld: it looked like a credential]';
export function short(v, n = 120) {
  if (typeof v !== 'string') return null;
  const t = v.slice(0, n * 2).replace(/\p{Cf}/gu, '').replace(/\p{Cc}/gu, ' ').slice(0, n);
  return JWTISH.test(t) || maskText(t) !== t ? WITHHELD : t;
}

// ---- the sign-in ---------------------------------------------------------------------------------------------------------------------------------
const b64u = (x) => Buffer.from(x).toString('base64url');
// RS256 only. EC keys are refused on purpose (and the lab never generates one). Exported for the test stub; the key is passed in, never stored here.
export function signJwt({ clientId, username, audience, privateKey, now = Math.floor(Date.now() / 1000) }) {
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64u(JSON.stringify({ iss: clientId, sub: username, aud: audience, exp: now + REAL_LIMITS.jwtSeconds }));
  return `${head}.${claims}.${cryptoSign('RSA-SHA256', Buffer.from(`${head}.${claims}`), privateKey).toString('base64url')}`;
}
function loadKey(file) {
  let pem;
  try {
    const st = fs.statSync(file);
    if (!st.isFile() || st.size > REAL_LIMITS.keyBytes) throw new Error('size');
    pem = fs.readFileSync(file, 'utf8');
  } catch { throw refuse('private_key_unreadable', 'The private key file named by SF_PRIVATE_KEY_PATH could not be read (it must be a file of at most 16 KB)', 409); }
  try {
    const key = createPrivateKey(pem);
    if (key.asymmetricKeyType !== 'rsa') throw new Error('type');
    return key;
  } catch { throw refuse('private_key_invalid', 'The private key file is not an RSA private key in PEM form (RS256 is the only algorithm the lab signs with)', 409); }
}

// The configuration comes from the environment only. What it returns about itself is the host: never the client id, the username, the key path or the key.
// `limits.timeoutMs` exists so a test can shorten the time cap; the environment cannot change it.
export function createRealOrg(env = process.env, limits = {}) {
  const need = ['SF_LOGIN_URL', 'SF_CLIENT_ID', 'SF_USERNAME', 'SF_PRIVATE_KEY_PATH'];
  const missing = need.filter((k) => !env[k]);
  const base = { configured: false, reason: null, host: null, origin: null };
  if (missing.length) return { ...base, reason: `Real is not configured: set ${missing.join(', ')} in this lab's own .env (see .env.example)`, read: async () => { throw refuse('real_not_available', 'Real is not configured', 409); } };
  const o = parseOrigin(env.SF_LOGIN_URL);
  if (o.problem) return { ...base, reason: `Real is not configured: SF_LOGIN_URL ${o.problem}`, read: async () => { throw refuse('real_not_available', 'Real is not configured', 409); } };
  try { if (!fs.statSync(env.SF_PRIVATE_KEY_PATH).isFile()) throw new Error('not a file'); } catch { return { ...base, reason: 'Real is not configured: SF_PRIVATE_KEY_PATH does not name a readable file', read: async () => { throw refuse('real_not_available', 'Real is not configured', 409); } }; }
  const { origin, loopback } = o;
  const clientId = String(env.SF_CLIENT_ID); const username = String(env.SF_USERNAME); const keyPath = String(env.SF_PRIVATE_KEY_PATH);

  async function read({ traceparent } = {}) {
    const trace = newTrace(traceparent);
    const hops = [];
    const hop = async (label, req) => {
      const tp = formatTraceparent(trace.traceId, trace.span());
      const r = await request({ origin, loopback, timeoutMs: limits.timeoutMs, ...req, headers: { ...req.headers, traceparent: tp, accept: 'application/json' } });
      hops.push({ label, method: req.method, path: req.path.split('?')[0], status: r.status, traceparent: tp });
      return r;
    };
    const key = loadKey(keyPath);
    const assertion = signJwt({ clientId, username, audience: origin, privateKey: key });
    const form = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString();
    const t = await hop('sign-in', { method: 'POST', path: '/services/oauth2/token', headers: { 'content-type': 'application/x-www-form-urlencoded', 'content-length': Buffer.byteLength(form) }, body: form });
    const tj = parseJson(t.text);
    if (t.status < 200 || t.status >= 300) {
      const sfError = short(tj && tj.error, 60); const sfDescription = short(tj && tj.error_description, 200);
      // Tie Salesforce's answer to the troubleshooting data: every outcome whose recorded error code is the one Salesforce sent (the lab cannot tell which).
      const candidates = Object.entries(OUTCOMES).filter(([id, d]) => id !== 'signed_in' && sfError && d.sfError === sfError).map(([id, d]) => ({ id, cause: d.cause, fix: d.fix }));
      throw refuse('salesforce_sign_in_rejected', 'Salesforce refused the JWT-bearer sign-in', 502, { salesforce: { status: t.status, error: sfError, error_description: sfDescription }, candidates, hops });
    }
    const token = tj && typeof tj.access_token === 'string' ? tj.access_token : null;
    const inst = tj && typeof tj.instance_url === 'string' ? parseOrigin(tj.instance_url) : null;
    if (!token || !inst || inst.problem) throw refuse('salesforce_bad_response', 'Salesforce\'s sign-in answer was not the shape expected', 502, { hops });
    if (inst.origin !== origin) throw refuse('salesforce_cross_origin_instance_url', 'Salesforce named a different instance URL than the configured origin; the lab refuses to follow it', 502, { hops });
    const auth = { authorization: `Bearer ${token}` };
    const query = async (label, soql) => {
      const r = await hop(label, { method: 'GET', path: `/services/data/${API}/query?q=${encodeURIComponent(soql)}`, headers: auth });
      const j = parseJson(r.text);
      if (r.status < 200 || r.status >= 300 || !j || !Array.isArray(j.records)) throw refuse('salesforce_query_failed', `Salesforce answered the ${label} query with HTTP ${r.status} (nothing was changed)`, 502, { hops });
      return j.records.slice(0, REAL_LIMITS.maxRecords).filter((x) => x && typeof x === 'object');
    };
    const sets = (await query('permission sets', SOQL.permissionSets)).map((r) => ({ id: short(r.Id, 18), label: short(r.Label), name: short(r.Name) }));
    const users = (await query('users', SOQL.users)).map((r) => ({ id: short(r.Id, 18), username: short(r.Username, 200), email: short(r.Email, 200), name: short(r.Name), active: r.IsActive === true }));
    return { fetchedAt: new Date().toISOString(), host: o.host, readOnly: true, permissionSets: sets, users, hops, traceId: trace.traceId };
  }
  return { configured: true, reason: null, host: o.host, origin, read };
}
