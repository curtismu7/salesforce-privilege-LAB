// Preflight: the same checks GET /api/health reports from, plus whether the port is free, plus one real run of the lab through the HTTP API
// (a sign-in failure with its fix, a link, a grant, a revoke, the Support P1 story) on a throwaway port. Prints only pass/fail lines, never a setting's
// value. Exit 1 on failure.
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = (p) => import(pathToFileURL(path.join(root, p)));
const { installNetguard } = await load('server/src/netguard.js');
installNetguard();
const { applySettings } = await load('server/src/settings.js');
applySettings();

const { runChecks } = await load('server/src/doctor.js');
let failed = 0;
const report = (level, name, detail) => { if (level === 'fail') failed++; console.log(`${level.toUpperCase().padEnd(4)}  ${name}: ${detail}`); };
for (const c of await runChecks()) report(c.level, c.id, c.detail);

// A real cycle through the HTTP layer, in this process, on an ephemeral loopback port. Always Mock: the doctor never contacts a real org.
try {
  const { createApp, startHttpServer } = await load('server/src/app.js');
  const { createHealth } = await load('server/src/health.js');
  const { createRealOrg } = await load('server/src/real.js');
  const health = createHealth({ runChecks: async () => [], intervalMs: 3_600_000 });
  const { server, url } = await startHttpServer({ port: 0, host: '127.0.0.1', app: createApp({ health, env: {}, real: createRealOrg({}) }) });
  try {
    const base = url.replace(/\/$/, ''); const h = { 'content-type': 'application/json', origin: base, 'x-workspace': 'doctor' };
    const act = async (op, params) => (await fetch(`${base}/api/actions`, { method: 'POST', headers: h, body: JSON.stringify({ op, params, refusalsAs200: true }) })).json();
    const run = async (id) => (await fetch(`${base}/api/scenarios/${id}/run`, { method: 'POST', headers: h, body: '{}' })).json();
    const happy = await run('happy-path');
    const fail = await run('fail-not-propagated');
    const p1 = await run('support-p1');
    const dup = await run('duplicate-email');
    const final = await act('clock.advance', { minutes: 1 });
    const ok = happy.ok && fail.ok && p1.ok && dup.ok && final.ok === true && happy.state.privilege.policies[0].status === 'ended' && p1.state.privilege.receipts[0].status === 'Revoked' && p1.state.support.canSeeCases === false && p1.state.support.cases === null
      && fail.steps.find((x) => x.expect === 'not_propagated').result.outcome.id === 'not_propagated' && /matches 2 Privilege users/.test(JSON.stringify(dup.steps[2].result));
    report(ok ? 'pass' : 'fail', 'lab-cycle', ok ? 'connect, link, grant, revoke; a sign-in failure with its fix; the Support P1 story ends with Cases denied again; the duplicate-email refusal: all ran through the HTTP API' : 'the scripted cycle through the HTTP API did not complete');
  } finally { health.stop(); await new Promise((res) => server.close(res)); }
} catch { report('fail', 'lab-cycle', 'the HTTP cycle could not run'); }

const port = Number(process.env.PORT) || 7835;
await new Promise((resolve) => {
  const s = net.createServer();
  s.once('error', (e) => { report('fail', 'port-free', `${port} is not free (${e.code}). This lab uses port 7835 only`); resolve(); });
  s.listen(port, '127.0.0.1', () => s.close(() => { report('pass', 'port-free', `${port} is free`); resolve(); }));
});
process.exit(failed ? 1 : 0);
