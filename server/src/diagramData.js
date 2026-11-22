// The diagrams are diagram-studio/1 DATA (server/diagrams/*.json), loaded BY NAME and checked with the studio's own validator copy
// (diagramStudioValidate.js). Nothing here builds a node or an edge by hand. Each step is one edge, walked in order by Simulate.
// Every step carries a `basis` (observed, lab-inferred or lab-invented) and the matching label text; the reaper and the "reconcile clears it" steps
// are lab-invented. The loader pattern is the family's (copied from a sibling lab, never imported).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fillDeep } from './cast.js';
import { validateDiagram } from './diagramStudioValidate.js';
import { labelFor } from './data.js';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../diagrams');
export const DIAGRAM_NAMES = ['connect-and-link', 'grant-expire-revoke'];
const BASES = ['observed', 'lab-inferred', 'lab-invented'];

// The studio's own checks, plus this lab's: every step carries a basis.
export function diagramProblems(doc) {
  const problems = validateDiagram(doc);
  if (Array.isArray(doc?.steps)) for (const [i, s] of doc.steps.entries()) if (!BASES.includes(s?.basis)) problems.push(`step ${i + 1}: basis must be one of ${BASES.join(', ')}`);
  return problems;
}

export function loadDiagram(name) {
  const doc = JSON.parse(fs.readFileSync(path.join(DIR, `${name}.json`), 'utf8'));
  const problems = diagramProblems(doc);
  if (problems.length) throw new Error(`diagram ${name} is not valid diagram-studio/1: ${problems.join('; ')}`);
  return doc;
}
const DOCS = Object.fromEntries(DIAGRAM_NAMES.map((n) => [n, loadDiagram(n)]));
export const rawDiagram = (name) => (Object.hasOwn(DOCS, name) ? DOCS[name] : null);
export const hasDiagram = (name) => typeof name === 'string' && Object.hasOwn(DOCS, name);

// The shape the page reads: { name, title, intro, nodes: [{id, label, kind, x, y}], steps: [{from, to, label, say, basis, basisLabel}] }.
export function buildDiagram(cast, name) {
  const d = fillDeep(DOCS[name], cast);
  return {
    name: d.id,
    title: d.title,
    intro: d.lede,
    nodes: d.nodes.map((n) => ({ id: n.id, label: n.label, kind: n.group, x: n.x, y: n.y })),
    steps: d.steps.map((s) => { const e = d.edges[s.edges[0]]; return { from: e.source, to: e.target, label: e.label || s.title, title: s.title, say: s.what, basis: s.basis, basisLabel: labelFor(s.basis) }; }),
  };
}
