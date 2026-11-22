// GET /api/diagram: diagram-studio/1 data loaded by name (rules 5 and 17), per vertical. Diagram 2 is "Grant and revoke": no reaper and no reconcile-clears arrow.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { withServer, get, post } from './helpers.js';
import { DIAGRAM_NAMES, buildDiagram, diagramProblems, loadDiagram, rawDiagram, hasDiagram } from '../src/diagramData.js';
import { validateDiagram } from '../src/diagramStudioValidate.js';
import { VERTICALS, unfilled } from '../src/cast.js';
import { scanHosts, scanKeys } from '../src/safety.js';
import { TALK_TRACK } from '../src/data.js';
import { SCENARIOS, scenarioList } from '../src/scenarios.js';
import { buildStory } from '../src/story.js';

test('the two diagrams the page expects exist, are valid diagram-studio/1 files on disk, and load by name only', () => {
  assert.deepEqual(DIAGRAM_NAMES, ['connect-and-link', 'grant-and-revoke']);
  for (const n of DIAGRAM_NAMES) {
    const doc = JSON.parse(fs.readFileSync(new URL(`../diagrams/${n}.json`, import.meta.url), 'utf8'));
    assert.deepEqual(validateDiagram(doc), [], n); assert.equal(doc.schema, 'diagram-studio/1'); assert.equal(doc.id, n);
    assert.ok(loadDiagram(n)); assert.ok(hasDiagram(n)); assert.ok(rawDiagram(n));
  }
  for (const bad of ['', 'nope', '__proto__', 'constructor', '../diagrams/connect-and-link', 'connect-and-link.json', 'CONNECT-AND-LINK', undefined, 7, null]) { assert.equal(hasDiagram(bad), false, String(bad)); }
});

test('every name x vertical: the shape the page reads, every token filled, only .example hosts, no key, no basis or label on a step', async () => {
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
        assert.deepEqual(Object.keys(s).sort(), ['from', 'label', 'say', 'title', 'to']);
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

test('diagram 2 is "Grant and revoke": no reaper, no reconcile-clears arrow and no drift step; the revoke path is delete, Revoke pending, removed, Revoked', () => {
  const g = buildDiagram(VERTICALS.finance, 'grant-and-revoke');
  assert.equal(g.title, 'Grant and revoke');
  const text = JSON.stringify(g);
  assert.ok(!/reaper|reconcile (clears|finds|removes)|next reconcile|hand-assigned|drift|lab-invented|LAB-INVENTED|window closes/i.test(text), 'nothing unproven is drawn');
  assert.deepEqual(g.steps.map((s) => s.title), ['Grant with a duration', 'The assignment is made in Salesforce', 'A receipt says Granted', 'Delete the policy', 'Revoke pending, access still live', 'The assignment is removed', 'The receipt reads Revoked']);
  assert.ok(!g.nodes.some((n) => /reaper/i.test(n.label)));
  assert.match(g.steps.find((s) => /removed/.test(s.title)).say, /Expired \/ Revoked shows 1/);
});

test('an unknown or missing name is a JSON error that never echoes the name; a wrong method is a 405', async () => {
  await withServer(async (url) => {
    const probe = 'ghp_' + 'Zx9Qw8Er7Ty6Ui5Op4As3Df2Gh1Jk0LzXcVb';
    for (const bad of ['nope', '__proto__', '..%2Fx', 'CONNECT-AND-LINK', probe]) {
      const r = await get(url, `/api/diagram?name=${bad}`); assert.equal(r.status, 404, bad); const b = await r.json();
      assert.equal(b.error, 'unknown_diagram'); assert.match(b.message, /connect-and-link, grant-and-revoke/); assert.ok(!JSON.stringify(b).includes(probe.slice(4, 20)));
    }
    for (const q of ['', '?name=', '?other=1', '?name=a&name=b']) { const r = await get(url, `/api/diagram${q}`); assert.ok([400, 404].includes(r.status), q); assert.deepEqual(Object.keys(await r.json()).sort(), ['error', 'message']); }
    assert.equal((await get(url, '/api/diagram')).status, 400);
    const p = await post(url, '/api/diagram', {}); assert.equal(p.status, 405); assert.match(p.headers.get('allow'), /GET/);
  });
});

test('a diagram step carries no basis field: the data on disk has none', () => {
  for (const n of DIAGRAM_NAMES) {
    const d = JSON.parse(fs.readFileSync(new URL(`../diagrams/${n}.json`, import.meta.url), 'utf8'));
    assert.deepEqual(diagramProblems(d), []);
    assert.ok(d.steps.every((s) => !('basis' in s)), n);
  }
  assert.match(diagramProblems({}).join(), /schema/);
});

test('the scenario list carries no basis and no label, and has exactly the scenarios the data lists; the removed ones are gone', async () => {
  const list = scenarioList(VERTICALS.finance);
  assert.deepEqual(list.map((s) => s.id), SCENARIOS.map((s) => s.id));
  for (const sc of list) assert.deepEqual(Object.keys(sc).sort(), ['id', 'preset', 'presetText', 'say', 'steps', 'title']);
  for (const gone of ['grant-expires', 'hand-assigned-drift', 'sign-in-breaks-later', 'fail-cert-expired', 'fail-wrong-username', 'fail-jwt-not-enabled']) assert.ok(!list.some((s) => s.id === gone), gone);
  assert.equal(list[0].id, 'support-p1', 'the Support P1 story is the first scenario');
  await withServer(async (url) => {
    const { scenarios } = await (await get(url, '/api/scenarios')).json();
    assert.equal(scenarios.length, SCENARIOS.length);
    assert.ok(scenarios.every((s) => !('basis' in s) && !('label' in s)));
  });
});

test('the talk track has the three Support P1 beats first and no basis or label on any item', () => {
  const t = buildStory(VERTICALS.finance, 'finance').talkTrack;
  assert.equal(t.length, TALK_TRACK.length);
  assert.deepEqual(t.slice(0, 3).map((x) => x.id), ['beat-1', 'beat-2', 'beat-3']);
  for (const x of t) assert.deepEqual(Object.keys(x).sort(), ['id', 'say', 'title']);
  assert.ok(!/reaper|expire|expiry|by itself|automatic|lab-invented|drift/i.test(JSON.stringify(t)), 'no unproven claim in the talk track');
});
