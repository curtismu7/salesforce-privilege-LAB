import http from 'node:http';
import { createApp, startHttpServer } from '../src/app.js';
import { createHealth } from '../src/health.js';
import { createWorkspaces } from '../src/workspaces.js';
import { createRealOrg } from '../src/real.js';
import { Engine } from '../src/engine.js';
import { runOp, tryOp } from '../src/actions.js';
import { runScenario, scenarioById } from '../src/scenarios.js';
import { VERTICALS } from '../src/cast.js';

export const C = VERTICALS.finance;
export const newEngine = (cast = C) => new Engine(cast);
// Run a scenario's setup (a preset) and return the engine: every preset step must be ok.
export function presetEngine(preset, cast = C) {
  const probe = { id: `preset-${preset}`, preset, steps: [] };
  const r = runScenario(cast, probe);
  if (r.failedSetup.length) throw new Error(`preset ${preset} failed: ${r.failedSetup.join(', ')}`);
  return r.engine;
}
export const run = (engine, op, params) => runOp(engine, op, params);
export const attempt = (engine, op, params) => tryOp(engine, op, params);
export { scenarioById, runScenario };

// Env without any Salesforce setting: Real is not configured.
export const NO_REAL = {};

export async function withServer(fn, { configFile = '/nonexistent/customer.config.json', workspaces = createWorkspaces(), webDist, env = NO_REAL, real = createRealOrg(env) } = {}) {
  const health = createHealth({ runChecks: async () => [], intervalMs: 3_600_000 });
  await health.ready;
  const { server, url } = await startHttpServer({ port: 0, host: '127.0.0.1', app: createApp({ health, configFile, workspaces, env, real, ...(webDist ? { webDist } : {}) }) });
  try { await fn(url.replace(/\/$/, ''), { workspaces }); } finally { health.stop(); await new Promise((res) => server.close(res)); }
}

export const post = (url, path, body, headers = {}) => fetch(`${url}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: url, ...headers }, body: JSON.stringify(body) });
export const get = (url, path, headers = {}) => fetch(`${url}${path}`, { headers });
export const act = (url, op, params, extra = {}, headers = {}) => post(url, '/api/actions', { op, params, ...extra }, headers);

// fetch cannot set Host; node:http can.
export function rawHttp(url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname + u.search, method, headers, agent: false }, (res) => {
      let data = ''; res.on('data', (c) => { data += c; }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: data }));
    });
    req.on('error', reject); if (body) req.write(body); req.end();
  });
}
