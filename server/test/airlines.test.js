// AirGuard Airlines is the default story: the airlines pack is the default vertical, nothing of the earlier brands shows in the airline run,
// an unknown vertical falls back to it, and a saved finance, health or retail choice keeps working.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { VERTICALS, DEFAULT_VERTICAL, DEFAULT_CAST, verticalFrom, loadCast, unfilled } from '../src/cast.js';
import { SCENARIOS, PRESETS, runScenario } from '../src/scenarios.js';
import { buildStory, rawStory, renderTalkTrackMarkdown } from '../src/story.js';
import { buildDiagram } from '../src/diagramData.js';
import { withServer, get } from './helpers.js';

// The retired names: the older packs' brands, people, accounts and cases, and the earlier airline brands. None may appear in the airline run.
const RETIRED = [
  'Fabrikam', 'Contoso', 'Northwind', 'Harbor', 'Vellum', 'Meridian Air', 'Skyline Air', 'Meridian Journeys', 'Tessera Travel',
  'Omar Reyes', 'Maya Chen', 'Lee Park', 'Ana Silva', 'Tariq Hassan', 'Lena Ortiz', 'Grace Liu', 'Noah Becker', 'Maria Costa',
  'Diego Ruiz', 'Hana Sato', 'Olu Adeyemi', 'Mia Kowalski', 'Raj Patel', 'Alder Logistics', 'Birch Capital', 'Cedar Credit', 'Riverside Clinic', 'Summit Imaging', 'Flagship Store',
  'Wire transfers', 'gift card', 'Health Cloud', 'Retail Analytics',
];
const leaks = (text) => RETIRED.filter((w) => text.toLowerCase().includes(w.toLowerCase()));

test('the default vertical is airlines and the default cast is AirGuard Airlines, on an .example host', () => {
  assert.equal(DEFAULT_VERTICAL, 'airlines');
  assert.equal(DEFAULT_CAST, VERTICALS.airlines);
  assert.equal(DEFAULT_CAST.castBrand, 'AirGuard Airlines');
  assert.equal(DEFAULT_CAST.castOrg, 'airguard');
  assert.match(DEFAULT_CAST.castAEmail, /@airguard\.example$/);
  assert.deepEqual(Object.keys(VERTICALS), ['airlines', 'finance', 'health', 'retail']);
});

test('an unknown or missing vertical falls back to airlines, and the older packs are still chosen by id', () => {
  for (const bad of [undefined, null, '', 'zzz', 'airline', 'constructor', '__proto__', 42]) assert.equal(verticalFrom(bad), 'airlines', String(bad));
  for (const v of ['finance', 'health', 'retail']) assert.equal(verticalFrom(v), v);
  assert.equal(loadCast(null).castBrand, 'AirGuard Airlines');
  assert.equal(loadCast(null, 'finance').castBrand, 'Fabrikam Bank');
  assert.equal(loadCast(null, 'health').castBrand, 'Contoso Health');
  assert.equal(loadCast(null, 'retail').castBrand, 'Northwind Retail');
});

test('the airline run reads as AirGuard Airlines: no finance, health, retail or earlier airline wording in the story, scenarios, results, state and diagrams', () => {
  const cast = VERTICALS.airlines;
  assert.deepEqual(leaks(JSON.stringify(buildStory(cast, 'airlines'))), [], 'story');
  assert.deepEqual(leaks(renderTalkTrackMarkdown(cast)), [], 'talk track');
  assert.deepEqual(leaks(fs.readFileSync(new URL('../../docs/talk-track.md', import.meta.url), 'utf8')), [], 'docs/talk-track.md');
  assert.deepEqual(leaks(fs.readFileSync(new URL('../../customer.config.example.json', import.meta.url), 'utf8')), [], 'customer.config.example.json');
  for (const name of ['connect-and-link', 'grant-and-revoke']) assert.deepEqual(leaks(JSON.stringify(buildDiagram(cast, name))), [], name);
  let ran = 0;
  for (const sc of SCENARIOS) {
    const r = runScenario(cast, sc);
    assert.ok(r.steps.every((s) => s.met), sc.id);
    assert.deepEqual(leaks(JSON.stringify({ steps: r.steps, state: r.engine.snapshot() })), [], `scenario ${sc.id}`);
    ran += 1;
  }
  assert.equal(ran, 12);
  assert.ok(JSON.stringify(buildStory(cast, 'airlines')).includes('AirGuard Airlines'));
});

test('the airline cases are airline cases', () => {
  const c = VERTICALS.airlines;
  assert.match(c.castCaseP1Title, /check-in kiosks/i); assert.match(c.castCase2Title, /booking engine/i); assert.match(c.castCase3Title, /loyalty points/i);
});

test('the airline pack defines exactly the tokens the story and scenarios use; a token it does not define is caught', () => {
  const text = JSON.stringify(rawStory()) + JSON.stringify(SCENARIOS) + JSON.stringify(PRESETS);
  assert.deepEqual(unfilled(text, VERTICALS.airlines), []);
  assert.deepEqual(unfilled(`${text} {{castBookingEngine}}`, VERTICALS.airlines), ['castBookingEngine']);
  assert.deepEqual(Object.keys(VERTICALS.airlines).sort(), Object.keys(VERTICALS.finance).sort());
});

test('a fresh server answers as AirGuard Airlines; an explicit finance choice still gives Fabrikam Bank', async () => {
  await withServer(async (url) => {
    const s = await (await get(url, '/api/story')).json();
    assert.equal(s.vertical, 'airlines'); assert.equal(s.cast.castBrand, 'AirGuard Airlines'); assert.deepEqual(s.verticals, ['airlines', 'finance', 'health', 'retail']);
    assert.deepEqual(leaks(JSON.stringify(s)), []);
    const st = await (await get(url, '/api/state')).json();
    assert.equal(st.vertical, 'airlines'); assert.equal(st.state.salesforce.host, 'airguard-dev-ed.develop.my.salesforce.example');
    const f = await (await get(url, '/api/story?vertical=finance')).json();
    assert.equal(f.cast.castBrand, 'Fabrikam Bank');
    const u = await (await get(url, '/api/story?vertical=zzz')).json();
    assert.equal(u.vertical, 'airlines'); assert.equal(u.cast.castBrand, 'AirGuard Airlines');
  });
});
