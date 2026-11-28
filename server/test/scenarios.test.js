// Scenarios are data: every step gives its expected result in every vertical, every {{token}} is defined, no label states.
import test from 'node:test';
import assert from 'node:assert/strict';
import { VERTICALS, unfilled, fillDeep, loadCast, DEFAULT_CAST } from '../src/cast.js';
import { SCENARIOS, PRESETS, runScenario } from '../src/scenarios.js';
import { buildStory, rawStory, renderTalkTrackMarkdown } from '../src/story.js';
import { OUTCOMES, TROUBLESHOOTING, BANNER } from '../src/data.js';
import { scanHosts, scanKeys } from '../src/safety.js';
import fs from 'node:fs';

test('there are at least the required scripted scenarios', () => {
  const ids = SCENARIOS.map((s) => s.id);
  for (const want of ['support-p1', 'happy-path', 'fail-client-id', 'fail-not-propagated', 'fail-not-preauthorized', 'fail-refresh-scope', 'fail-cert-mismatch', 'fail-permset-link', 'duplicate-email', 'link-pitfalls', 'grant-rules', 'revoke-by-delete']) assert.ok(ids.includes(want), want);
  assert.equal(ids.length, 12, 'the README says 12 scenarios');
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
});

test('every step of every scenario gives the result it says, in all four verticals', () => {
  for (const [vertical, cast] of Object.entries(VERTICALS)) {
    for (const sc of SCENARIOS) {
      const r = runScenario(cast, sc);
      assert.deepEqual(r.failedSetup, [], `${vertical}/${sc.id} setup`);
      for (const st of r.steps) assert.ok(st.met, `${vertical}/${sc.id} step ${st.index} ${st.op}: expected ${st.expect}, got ${JSON.stringify(st.result).slice(0, 200)}`);
      assert.ok(r.steps.length >= 2, sc.id);
    }
  }
});

test('every {{token}} in the story and the scenarios is defined by every vertical pack, and the packs define the same keys', () => {
  const text = JSON.stringify(rawStory()) + JSON.stringify(SCENARIOS) + JSON.stringify(PRESETS);
  assert.ok(text.includes('{{cast'), 'the data uses tokens at all');
  for (const [v, cast] of Object.entries(VERTICALS)) assert.deepEqual(unfilled(text, cast), [], v);
  const keys = Object.keys(VERTICALS.airlines).sort();
  for (const [v, cast] of Object.entries(VERTICALS)) assert.deepEqual(Object.keys(cast).sort(), keys, v);
  assert.deepEqual(Object.keys(VERTICALS).sort(), ['airlines', 'finance', 'health', 'retail']);
});

test('an undefined token is caught', () => {
  assert.deepEqual(unfilled('hello {{castNobody}} and {{castBrand}}', DEFAULT_CAST), ['castNobody']);
});

test('a filled story has no unfilled token and the four packs differ in names', () => {
  for (const [v, cast] of Object.entries(VERTICALS)) { const s = JSON.stringify(buildStory(cast, v)); assert.ok(!/\{\{/.test(s), v); }
  assert.notEqual(VERTICALS.finance.castAName, VERTICALS.health.castAName);
  assert.notEqual(VERTICALS.finance.castOrgHost, VERTICALS.retail.castOrgHost);
  assert.notEqual(VERTICALS.airlines.castAName, VERTICALS.finance.castAName);
  assert.notEqual(VERTICALS.airlines.castOrgHost, VERTICALS.finance.castOrgHost);
});

test('the cast is fictional: every email and host is on a .example name (never example.com), no credential-shaped text', () => {
  for (const [v, cast] of Object.entries(VERTICALS)) {
    const text = JSON.stringify(cast);
    assert.deepEqual(scanHosts(text), [], v);
    assert.ok(!/example\.com/.test(text), v);
    assert.deepEqual(scanKeys(text), [], v);
    for (const k of ['castAdminEmail', 'castAEmail', 'castDupEmail', 'castCEmail', 'castFEmail', 'castFSfEmail']) assert.match(cast[k], new RegExp(`^[a-z.]+@${cast.castOrg}\\.example$`), `${v} ${k}`);
    assert.match(cast.castOrgHost, /^[a-z]+-dev-ed\.develop\.my\.salesforce\.example$/);
  }
  const c = VERTICALS.finance;
  assert.equal(c.castDupEmail, VERTICALS.finance.castDupEmail);
  assert.notEqual(c.castAEmail, c.castDupEmail);
  assert.notEqual(c.castFEmail, c.castFSfEmail, 'the Federation ID user differs by email on purpose');
});

test('the only honesty text is the simulation banner; every outcome has a cause and a fix; nothing is presented as a Ping statement', () => {
  const s = buildStory(DEFAULT_CAST, 'airlines');
  assert.equal(s.banner.mock, 'Simulated: every behaviour shown was recorded in one real Privilege and Salesforce run.');
  assert.equal(BANNER.mock, s.banner.mock);
  for (const [id, o] of Object.entries(OUTCOMES)) assert.ok(o.cause && o.fix && !('basis' in o) && !('wording' in o), id);
  const text = JSON.stringify({ ...s, banner: null });
  assert.ok(!/UNVERIFIED|observed on one org|lab-invented|lab-inferred|labInvented/i.test(text), 'no label text anywhere in the story');
  assert.ok(!/\bPing (says|confirms|states)\b/i.test(text), 'never presented as a Ping statement');
});

test('every troubleshooting row from the guide is present and every rule or outcome it names exists in the engine', () => {
  const symptoms = TROUBLESHOOTING.map((t) => `${t.symptom} ${t.cause} ${t.fix}`).join('|');
  for (const w of ['invalid_grant', 'refresh_token', 'invalid_client_id', 'its email matches 2 Privilege users', 'Federation ID', 'Already has this permission set', 'Needs a permission set license', 'License Salesforce ≠ <other>', 'Duplicate username', 'No Salesforce licenses', 'Revoke pending, access still live']) assert.ok(symptoms.includes(w), w);
  for (const t of TROUBLESHOOTING) for (const id of t.outcomes) assert.ok(Object.hasOwn(OUTCOMES, id), id);
});

test('every connect failure the guide records is produced by a scenario (not_modelled is the lab\'s own refusal and is produced by none)', () => {
  const produced = new Set();
  for (const sc of SCENARIOS) for (const st of runScenario(DEFAULT_CAST, sc).steps) if (st.result.outcome && !st.result.ok) produced.add(st.result.outcome.id);
  for (const id of ['invalid_client_id', 'not_propagated', 'missing_refresh_scope', 'signature_mismatch', 'not_preauthorized', 'permset_not_linked', 'permset_not_assigned']) assert.ok(produced.has(id), id);
});

test('fillDeep is iterative: a very deep structure does not overflow the stack', () => {
  let deep = { v: '{{castBrand}}' };
  for (let i = 0; i < 20000; i += 1) deep = { n: deep };
  assert.ok(fillDeep(deep, DEFAULT_CAST));
});

test('customer.config.json may change only the brand', () => {
  const file = new URL('./cfg.tmp.json', import.meta.url);
  fs.writeFileSync(file, JSON.stringify({ cast: { brand: 'Zed Co', castAEmail: 'x@y.example', engineer: 'bob' } }));
  try {
    const c = loadCast(file, 'finance');
    assert.equal(c.castBrand, 'Zed Co'); assert.equal(c.castAEmail, VERTICALS.finance.castAEmail);
    fs.writeFileSync(file, JSON.stringify({ cast: { brand: 'http://evil.example/x' } }));
    assert.equal(loadCast(file, 'finance').castBrand, VERTICALS.finance.castBrand);
  } finally { fs.rmSync(file, { force: true }); }
});

test('docs/talk-track.md is exactly what the data renders (run npm run talk-track)', () => {
  const md = fs.readFileSync(new URL('../../docs/talk-track.md', import.meta.url), 'utf8');
  assert.equal(md, renderTalkTrackMarkdown(DEFAULT_CAST));
});
