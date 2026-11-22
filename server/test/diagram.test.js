// GET /api/diagram: diagram-studio/1 data loaded by name (rules 5 and 17), per vertical, every step with a basis. And the per-scenario and talk-track basis.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { withServer, get, post } from './helpers.js';
import { DIAGRAM_NAMES, buildDiagram, diagramProblems, loadDiagram, rawDiagram, hasDiagram } from '../src/diagramData.js';
import { validateDiagram } from '../src/diagramStudioValidate.js';
import { VERTICALS, unfilled } from '../src/cast.js';
import { scanHosts, scanKeys } from '../src/safety.js';
import { LAB_INFERRED, LAB_INVENTED, OBSERVED, TALK_TRACK } from '../src/data.js';
import { SCENARIOS, SCENARIO_BASIS, scenarioList } from '../src/scenarios.js';
import { buildStory } from '../src/story.js';

test('the two diagrams the page expects exist, are valid diagram-studio/1 files on disk, and load by name only', () => {
  assert.deepEqual(DIAGRAM_NAMES, ['connect-and-link', 'grant-expire-revoke']);
  for (const n of DIAGRAM_NAMES) {
    const doc = JSON.parse(fs.readFileSync(new URL(`../diagrams/${n}.json`, import.meta.url), 'utf8'));
    assert.deepEqual(validateDiagram(doc), [], n); assert.equal(doc.schema, 'diagram-studio/1'); assert.equal(doc.id, n);
    assert.ok(loadDiagram(n)); assert.ok(hasDiagram(n)); assert.ok(rawDiagram(n));
  }
  for (const bad of ['', 'nope', '__proto__', 'constructor', '../diagrams/connect-and-link', 'connect-and-link.json', 'CONNECT-AND-LINK', undefined, 7, null]) { assert.equal(hasDiagram(bad), false, String(bad)); }
});

test('every name x vertical: the shape the page reads, every token filled, only .example hosts, no key, every step has a basis and its label', async () => {
  await withServer(async (url) => {
    for (const name of DIAGRAM_NAMES) for (const [vertical, cast] of Object.entries(VERTICALS)) {
      const r = await get(url, `/api/diagram?name=${name}&vertical=${vertical}`);
      assert.equal(r.status, 200, `${name}/${vertical}`); assert.match(r.headers.get('content-type'), /^application\/json/); assert.equal(r.headers.get('cache-control'), 'no-store');
      const d = await r.json();
      assert.equal(d.name, name); assert.equal(d.vertical, vertical);
      assert.ok(d.title && d.intro);
      assert.ok(d.nodes.length >= 4 && d.steps.length >= 6);
      const ids = new Set(d.nodes.map((n) => n.id));
      for (const n of d.nodes) { assert.deepEqual(Object.keys(n).sort(), ['id', 'kind', 'label', 'x', 'y']); assert.ok(['you', 'gateway', 'upstream', 'audit'].includes(n.kind)); assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y)); }
      for (const s of d.steps) {
        assert.ok(ids.has(s.from) && ids.has(s.to), 'an arrow joins two listed boxes'); assert.ok(s.label && s.say);
        assert.ok(['observed', 'lab-invented'].includes(s.basis)); assert.equal(s.basisLabel, s.basis === 'observed' ? OBSERVED : LAB_INVENTED);
      }
      const text = JSON.stringify(d);
      assert.deepEqual(unfilled(text, cast), [], `${name}/${vertical}`); assert.ok(!text.includes('{{'));
      assert.deepEqual(scanHosts(text), []); assert.deepEqual(scanKeys(text), []);
      assert.ok(text.includes(cast.castAdminName), 'the cast is filled');
    }
    // the verticals differ
    const a = await (await get(url, '/api/diagram?name=connect-and-link&vertical=finance')).json();
    const b = await (await get(url, '/api/diagram?name=connect-and-link&vertical=retail')).json();
    assert.notEqual(JSON.stringify(a.nodes), JSON.stringify(b.nodes));
    // an unknown vertical falls back to the default, like every other route
    assert.equal((await (await get(url, '/api/diagram?name=connect-and-link&vertical=zzz')).json()).vertical, 'finance');
  });
});

test('the lab-invented steps are exactly the reaper, the reconcile-clears arrow and the hand-assigned drift; connecting is all observed', () => {
  const c = buildDiagram(VERTICALS.finance, 'connect-and-link');
  assert.ok(c.steps.every((s) => s.basis === 'observed'));
  const g = buildDiagram(VERTICALS.finance, 'grant-expire-revoke');
  assert.match(g.steps.find((s) => /Expired \/ Revoked/.test(s.title)).say, /Expired \/ Revoked shows 1/);
  assert.ok(!g.steps.some((s) => s.basis === 'observed' && /\(the window closed\)/.test(s.say)));
  assert.deepEqual(g.steps.filter((s) => s.basis === 'lab-invented').map((s) => s.title), ['The reaper removes access when the window closes', 'The next reconcile or Sync removes the assignment', 'Reconcile finds access assigned by hand']);
  for (const s of g.steps.filter((x) => x.basis === 'lab-invented')) assert.match(s.say, /LAB-INVENTED/);
});

test('an unknown or missing name is a JSON error that never echoes the name; a wrong method is a 405', async () => {
  await withServer(async (url) => {
    const probe = 'ghp_' + 'Zx9Qw8Er7Ty6Ui5Op4As3Df2Gh1Jk0LzXcVb';
    for (const bad of ['nope', '__proto__', '..%2Fx', 'CONNECT-AND-LINK', probe]) {
      const r = await get(url, `/api/diagram?name=${bad}`); assert.equal(r.status, 404, bad); const b = await r.json();
      assert.equal(b.error, 'unknown_diagram'); assert.match(b.message, /connect-and-link, grant-expire-revoke/); assert.ok(!JSON.stringify(b).includes(probe.slice(4, 20)));
    }
    for (const q of ['', '?name=', '?other=1', '?name=a&name=b']) { const r = await get(url, `/api/diagram${q}`); assert.ok([400, 404].includes(r.status), q); assert.deepEqual(Object.keys(await r.json()).sort(), ['error', 'message']); }
    assert.equal((await get(url, '/api/diagram')).status, 400);
    const p = await post(url, '/api/diagram', {}); assert.equal(p.status, 405); assert.match(p.headers.get('allow'), /GET/);
  });
});

test('a diagram step without a basis, or with a bad one, is refused when the data loads', () => {
  const d = JSON.parse(fs.readFileSync(new URL('../diagrams/connect-and-link.json', import.meta.url), 'utf8'));
  assert.deepEqual(diagramProblems(d), []);
  const none = structuredClone(d); delete none.steps[0].basis;
  assert.deepEqual(validateDiagram(none), [], 'the studio validator ignores the extra field');
  assert.match(diagramProblems(none).join(), /step 1: basis must be one of/);
  const bad = structuredClone(d); bad.steps[2].basis = 'sure-thing';
  assert.match(diagramProblems(bad).join(), /step 3: basis must be one of/);
  assert.match(diagramProblems({}).join(), /schema/);
});

test('every scenario has a basis and a matching label; the table covers exactly the scenarios', () => {
  assert.deepEqual(Object.keys(SCENARIO_BASIS).sort(), SCENARIOS.map((s) => s.id).sort());
  const list = scenarioList(VERTICALS.finance);
  for (const sc of list) { assert.equal(sc.basis, SCENARIO_BASIS[sc.id], sc.id); assert.equal(sc.label, sc.basis === 'observed' ? OBSERVED : sc.basis === 'lab-inferred' ? LAB_INFERRED : LAB_INVENTED, sc.id); }
  for (const id of ['grant-expires', 'hand-assigned-drift', 'sign-in-breaks-later']) assert.equal(SCENARIO_BASIS[id], 'lab-invented', id);
  for (const id of ['fail-cert-expired', 'fail-wrong-username', 'fail-jwt-not-enabled']) assert.equal(SCENARIO_BASIS[id], 'lab-inferred', id);
  for (const id of ['duplicate-email', 'fail-client-id', 'fail-not-propagated', 'fail-cert-mismatch']) assert.equal(SCENARIO_BASIS[id], 'observed', id);
  for (const id of ['happy-path', 'revoke-by-delete']) assert.equal(SCENARIO_BASIS[id], 'lab-inferred', `${id} ends with "the next reconcile removes it", the lab's reading`);
});

test('the scenario list over HTTP carries basis and label', async () => {
  await withServer(async (url) => {
    const { scenarios } = await (await get(url, '/api/scenarios')).json();
    assert.ok(scenarios.length === SCENARIOS.length && scenarios.every((s) => ['observed', 'lab-inferred', 'lab-invented'].includes(s.basis) && s.label));
    assert.equal(scenarios.find((s) => s.id === 'grant-expires').basis, 'lab-invented');
  });
});

test('every talk-track item has a basis and a label; the reaper and drift parts are lab-invented, the 10-minute cut-off is lab-inferred, the rest observed', () => {
  const t = buildStory(VERTICALS.finance, 'finance').talkTrack;
  assert.equal(t.length, TALK_TRACK.length);
  for (const x of t) { assert.ok(['observed', 'lab-inferred', 'lab-invented'].includes(x.basis), x.id); assert.ok(x.label, x.id); }
  assert.deepEqual(t.filter((x) => x.basis === 'lab-invented').map((x) => x.id), ['expire', 'drift']);
  assert.deepEqual(t.filter((x) => x.basis === 'lab-inferred').map((x) => x.id), ['propagation']);
  assert.equal(t.find((x) => x.id === 'propagation').label, LAB_INFERRED);
  for (const x of t.filter((y) => y.basis === 'lab-invented')) assert.match(x.say, /lab-invented/i);
});
