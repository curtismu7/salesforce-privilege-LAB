// Preflight checks shared by `npm run doctor` and GET /api/health. Never prints a secret or a setting's value, needs no network.
// Each check: { id, level: 'pass' | 'info' | 'fail', detail }.
import fs from 'node:fs';
import { allowedExtraHosts, assertBindAllowed, bindHost, portProblem, scanHosts, scanKeys, DEFAULT_PORT } from './safety.js';
import { installNetguard, netguardSelfTest } from './netguard.js';
import { VERTICALS, unfilled } from './cast.js';
import { buildStory, rawStory } from './story.js';
import { DIAGRAM_NAMES, buildDiagram } from './diagramData.js';
import { SCENARIOS, runScenario } from './scenarios.js';
import { OUTCOMES } from './data.js';
import { createRealOrg, parseOrigin } from './real.js';
import { defaultSource } from './config.js';
import { settingsPath } from './settings.js';


export async function runChecks({ env = process.env } = {}) {
  const checks = [];
  const add = (id, level, detail) => checks.push({ id, level, detail });

  const major = Number(process.versions.node.split('.')[0]);
  add('node', major >= 26 ? 'pass' : 'fail', `v${process.versions.node} (need >= 26)`);

  const real = createRealOrg(env);
  try { add('mode', 'pass', `${defaultSource(env, real.configured)} is the opening source (Real if configured, else Mock; the header toggle switches); Real is ${real.configured ? 'configured (read-only, owner-run, behind a confirm gate)' : 'not configured, which is the normal state'}`); }
  catch (e) { add('mode', 'fail', e.message); }

  // Real wiring, with names only (never a value): configured, or exactly which settings are missing. Not configured is the normal state, so it is never a failure.
  add('real-config', 'info', real.configured ? `Real is configured for one origin (${real.host}); it is owner-run, read-only and behind a confirm gate` : real.reason.replace(/^Real is not configured: /, 'Real is not configured, which is the normal state: '));

  try { add('bind', 'pass', `${assertBindAllowed(bindHost(env), env)}${env.SFPRIV_BIND ? ' (SFPRIV_BIND opt-in)' : ' (loopback)'}`); }
  catch (e) { add('bind', 'fail', e.message); }

  const port = env.PORT === undefined || env.PORT === '' ? DEFAULT_PORT : Number(env.PORT);
  const problem = portProblem(port);
  add('port', problem ? 'fail' : 'pass', problem || `${port} is this lab's port and not reserved`);

  try { const n = allowedExtraHosts(env).size; add('allowed-hosts', 'pass', `LAB_ALLOWED_HOSTS is valid (${n} extra host name${n === 1 ? '' : 's'}; loopback always works)`); }
  catch (e) { add('allowed-hosts', 'fail', e.message); }

  const file = settingsPath(env);
  try { const m = fs.statSync(file).mode & 0o777; add('settings-file', m & 0o077 ? 'info' : 'pass', m & 0o077 ? 'the lab\'s .env is readable by others: chmod 600 it' : 'the lab\'s .env exists and is mode 600 (values are never printed)'); }
  catch { add('settings-file', 'info', 'no .env beside the compose file: Mock needs none'); }

  const guardOk = [['https://login.example.invalid', true], ['https://10.0.0.5', false], ['https://user:pw@host.example.invalid', false], ['https://host.example.invalid/path', false], ['http://host.example.invalid', false], ['https://host.example.invalid', true], ['http://127.0.0.1:1', true]].every(([u, ok]) => Boolean(parseOrigin(u).origin) === ok);
  add('real-guard', guardOk ? 'pass' : 'fail', guardOk ? 'the Real origin guard accepts an https origin and a loopback stub, and refuses an IP literal, credentials, a path and plain http elsewhere' : 'the Real origin guard is wrong');

  // Every scripted step gives the result the story says it does, in every vertical, and the netguard sees no attempt while they run.
  const guard = installNetguard();
  const before = guard.attempts.length;
  const wrong = []; const produced = new Set();
  for (const [vertical, cast] of Object.entries(VERTICALS)) {
    for (const sc of SCENARIOS) {
      const r = runScenario(cast, sc);
      if (!r.ok) wrong.push(`${vertical}/${sc.id}`);
      for (const st of r.steps) if (!st.result.ok && st.result.outcome) produced.add(st.result.outcome.id);
    }
  }
  add('scenarios', wrong.length ? 'fail' : 'pass', wrong.length ? `scripted steps that do not give their expected result: ${wrong.slice(0, 6).join(', ')}` : `${SCENARIOS.length} scripted scenarios give their expected results in ${Object.keys(VERTICALS).length} verticals`);
  add('mock-outbound', guard.attempts.length === before ? 'pass' : 'fail', guard.attempts.length === before ? 'running every scenario made zero outbound attempts' : 'a scenario tried to leave the machine');
  const unproduced = Object.keys(OUTCOMES).filter((id) => id !== 'signed_in' && id !== 'not_modelled' && !produced.has(id));
  add('outcomes', unproduced.length ? 'fail' : 'pass', unproduced.length ? `sign-in outcomes no scenario produces: ${unproduced.join(', ')}` : 'every connect failure in the guide is produced by a scripted scenario, with its cause and fix');
  const bare = Object.entries(OUTCOMES).filter(([, o]) => !o.cause || !o.fix);
  add('fixes', bare.length ? 'fail' : 'pass', bare.length ? `outcomes without a cause or a fix: ${bare.map(([id]) => id).join(', ')}` : 'every outcome carries a cause and the exact fix');

  const text = JSON.stringify(rawStory()) + JSON.stringify(SCENARIOS);
  const holes = unfilled(text, VERTICALS.finance);
  add('story-tokens', holes.length ? 'fail' : 'pass', holes.length ? `unfilled {{tokens}}: ${[...new Set(holes)].join(', ')}` : 'every {{cast}} token is filled');
  const badVert = Object.entries(VERTICALS).filter(([, v]) => unfilled(text, v).length).map(([k]) => k);
  add('verticals', badVert.length ? 'fail' : 'pass', badVert.length ? `verticals missing a token: ${badVert.join(', ')}` : `${Object.keys(VERTICALS).length} vertical packs fill every token`);
  const filled = JSON.stringify(Object.keys(VERTICALS).map((k) => buildStory(VERTICALS[k], k))) + JSON.stringify(Object.values(VERTICALS));
  const hosts = scanHosts(filled);
  add('story-hosts', hosts.length ? 'fail' : 'pass', hosts.length ? `non-reserved hosts: ${hosts.join(', ')}` : 'every host in the story and cast is .example or .invalid (people have an email on the org\'s .example host)');
  const diagrams = DIAGRAM_NAMES.flatMap((n) => Object.entries(VERTICALS).map(([v, c]) => ({ n, v, d: buildDiagram(c, n), c })));
  const dBad = diagrams.filter(({ d, c }) => unfilled(JSON.stringify(d), c).length || scanHosts(JSON.stringify(d)).length || !d.steps.length);
  add('diagrams', dBad.length ? 'fail' : 'pass', dBad.length ? `diagrams with an unfilled token, or a foreign host: ${dBad.map((x) => `${x.n}/${x.v}`).join(', ')}` : `${DIAGRAM_NAMES.length} diagram-studio/1 diagrams load by name and validate in ${Object.keys(VERTICALS).length} verticals`);
  const keys = scanKeys(filled);
  add('story-keys', keys.length ? 'fail' : 'pass', keys.length ? 'credential-shaped text in the story data' : 'no credential-shaped value anywhere in the story data');

  const ng = await netguardSelfTest();
  add('netguard', ng.ok ? 'pass' : 'fail', ng.ok ? `blocked fetch, socket, socket-by-IP, dns lookup, dns resolve and udp to a non-loopback host (${ng.blocked}/6)` : ng.detail);

  add('tenant', 'pass', 'Mock: simulated only, no tenant, no credentials, no outbound network');
  return checks;
}

export const allPassed = (checks) => checks.every((c) => c.level !== 'fail');
