import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildPack } from './build-content-pack.mjs';
import { validatePack } from './validate-content-pack.mjs';
import { SCENARIOS } from '../server/src/scenarios.js';

const root = new URL('..', import.meta.url);
const committed = JSON.parse(fs.readFileSync(new URL('content-pack.json', root), 'utf8'));

test('the pack validates against the schema and its cross-references hold', () => {
  assert.deepEqual(validatePack(buildPack()), []);
  assert.equal(buildPack().schema, 'demo-content-pack/1');
  assert.equal(buildPack().id, 'salesforce-privilege-lab');
});

test('the committed content-pack.json is exactly what the builder makes (no drift)', () => {
  assert.deepEqual(committed, buildPack());
});

test('every scripted scenario has a story and a try-it card', () => {
  const pack = buildPack();
  assert.equal(pack.stories.length, SCENARIOS.length);
  for (const s of pack.stories) assert.ok(pack.cards.find((c) => c.story === s.id), s.id);
});

test('the pack describes the real pages: a route card for every page the web shell has, and both diagrams by name', () => {
  const app = fs.readFileSync(new URL('web/src/App.jsx', root), 'utf8');
  const ids = [...app.matchAll(/\{ id: "([a-z]+)", label: "[^"]+", View:/g)].map((m) => m[1]);
  assert.deepEqual(ids, ['support', 'scenarios', 'connect', 'link', 'grant', 'diagram', 'real']);
  const pack = buildPack();
  const hrefs = new Set(pack.cards.filter((c) => c.action.type === 'route').map((c) => c.action.href));
  for (const id of ids) assert.ok(hrefs.has(`/#${id}`), `a card routes to /#${id}`);
  assert.deepEqual(pack.diagrams.map((d) => d.id), ['connect-and-link', 'grant-and-revoke']);
  for (const d of pack.diagrams) assert.equal(d.href, `/#diagram/${d.id}`, 'each diagram links to its own anchor');
  assert.ok(pack.sources.every((s) => !/^https?:/.test(s.url) || /localhost/.test(s.url)), 'no placeholder web address as a source');
  assert.ok(!pack.cards.some((c) => /#scenario-/.test(c.action.href)), 'no card routes to a page that does not exist');
});

test('a broken pack is caught: unknown term and unknown story', () => {
  const pack = buildPack();
  pack.cards[0].terms = ['nope'];
  pack.cards[1].story = 'ghost';
  const errors = validatePack(pack).join('\n');
  assert.match(errors, /unknown term nope/);
  assert.match(errors, /unknown story ghost/);
});

test('no glossary definition carries a label state, and the pack carries no real link, credential or "door"', () => {
  const pack = buildPack();
  const t = JSON.stringify(pack).toLowerCase();
  assert.ok(!/unverified|lab-invented|lab-inferred|reaper|drift|discovered|orphaned|expire by itself/.test(t), 'nothing unproven and no label text');
  assert.ok(pack.glossary.some((g) => g.id === 'support-p1'));
  assert.ok(!/https?:\/\/(?!(localhost|example\.invalid))/.test(t), 'only localhost and .invalid links');
  assert.ok(!/\bdoor\b/.test(t));
});
