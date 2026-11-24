// One Express app. /api = health, info, mode, story, scenarios, state, actions (the one write dispatch), the Real-mode read and reset.
// Server state per workspace id (X-Workspace): one Engine per vertical, so one visitor's Reset never touches another's.
// Mock drives the in-process mock org and mock Privilege app (zero outbound). Real is OWNER-RUN and READ-ONLY: one sign-in and one read of the one
// configured Salesforce origin, behind a confirm gate; every mock write is refused (409) while Real is selected.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { hostCheck, sameOriginWrites } from './safety.js';
import { buildMethodTable, charsetProblem, isPageAddress, methodNotAllowed } from './shared/hygiene.js';
import { createHealth } from './health.js';
import { loadCast, verticalFrom, VERTICALS } from './cast.js';
import { defaultSource, sourceOf } from './config.js';
import { buildStory } from './story.js';
import { InputError } from './errors.js';
import { createWorkspaces, workspaceFrom } from './workspaces.js';
import { DIAGRAM_NAMES, buildDiagram, hasDiagram } from './diagramData.js';
import { Engine } from './engine.js';
import { OPS, tryOp } from './actions.js';
import { SCENARIOS, runScenario, scenarioById } from './scenarios.js';
import { overBounds } from './bounds.js';
import { newTrace, formatTraceparent } from './trace.js';
import { createRealOrg } from './real.js';
import { shelfInfo } from './shelfLink.js';
import { NO_RUN, createRunLog, opEvents, callEvents, recordOf, reportFailure, runField } from './runObs.js';
import { RunObsError } from './runObservability.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST = process.env.WEB_DIST || path.resolve(HERE, '../../web/dist');
const CONFIG = process.env.CUSTOMER_CONFIG || path.resolve(HERE, '../../customer.config.json');
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const RUN_ID = /^act-[0-9a-f]{6}-[0-9]{1,9}$/;
const TOO_BIG = 'a text (over 400 characters), a name (over 80), a list (over 20), an object (over 40 keys) or the nesting (over 6 levels) is more than the lab takes: nothing was run';
const VERSION = (() => { try { return JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version || null; } catch { return null; } })();

// The one route table: path -> methods (":id" is one segment, case and one trailing slash are not significant, HEAD follows GET). It answers the 405 and
// nothing else; a test checks that every route registered here is in the table and the other way round.
export const ROUTES = {
  '/api/shelf': ['GET'],
  '/api/health': ['GET'],
  '/api/info': ['GET'],
  '/api/mode': ['GET', 'POST'],
  '/api/story': ['GET'],
  '/api/diagram': ['GET'],
  '/api/scenarios': ['GET'],
  '/api/scenarios/:id/run': ['POST'],
  '/api/state': ['GET'],
  '/api/actions': ['GET', 'POST'],
  '/api/actions/run': ['GET'],
  '/api/real/read': ['POST'],
  '/api/reset': ['POST'],
};
const METHODS = buildMethodTable(ROUTES);

export function createApp({ health = createHealth(), configFile = CONFIG, workspaces = createWorkspaces(), webDist = WEB_DIST, env = process.env, real = createRealOrg(env), runLog = createRunLog() } = {}) {
  const app = express();
  app.disable('x-powered-by');
  // The page's source (rule 19). Process-wide: one lab, one owner at a time. Default: Real if configured, else Mock.
  const mode = { source: defaultSource(env, real.configured) };
  let reading = false;

  app.use(hostCheck);
  app.use(sameOriginWrites);
  app.use((_req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); next(); });
  // 1. Charset gate: any charset but utf-8 is a 415 with a fixed body.
  app.use((req, res, next) => (charsetProblem(req.headers['content-type']) ? res.status(415).json({ error: 'unsupported_charset', message: 'Send the body as utf-8 JSON' }) : next()));

  const api = express.Router();
  // 2. A wrong method on a known route is a 405 with Allow, built from the one route table above, never a 404 that hides the route and never Express's HTML.
  api.use((req, res, next) => {
    const miss = methodNotAllowed(METHODS, req.method, `/api${req.path}`);
    return miss ? res.set('Allow', miss.allow.join(', ')).status(405).json({ error: 'method_not_allowed', message: `This route takes ${miss.allow.join(', ')} only` }) : next();
  });
  api.use(express.json({ limit: '32kb' }));
  api.use('/health', health.router);
  const verticalOf = (req) => verticalFrom(req.body?.vertical ?? req.query.vertical);
  const castFor = (req) => loadCast(configFile, verticalOf(req));
  const noStore = (res) => res.set('Cache-Control', 'no-store');
  // 3. The workspace id is checked BEFORE a slot exists: a refused id (credential-looking, see workspaces.js) is a 400 bad_workspace that echoes nothing.
  const workspace = (req, res, next) => { const id = workspaceFrom(req); if (!id) return res.status(400).json({ error: 'bad_workspace', message: 'The workspace id is not acceptable' }); req.workspaceId = id; return next(); };
  const bodyOf = (req) => (isObj(req.body) ? req.body : {});
  const realInfo = () => ({ realAvailable: real.configured, realReason: real.configured ? null : real.reason, realHost: real.configured ? real.host : null });

  api.get('/story', (req, res) => { noStore(res); res.json(buildStory(castFor(req), verticalOf(req))); });
  // Rule 5 and 17: a diagram is diagram-studio/1 data loaded BY NAME (server/diagrams). Unknown or missing name: a JSON error, never a guess.
  api.get('/diagram', (req, res) => {
    noStore(res);
    const name = req.query.name;
    if (typeof name !== 'string' || !name) return res.status(400).json({ error: 'bad_request', message: `name is required: one of ${DIAGRAM_NAMES.join(', ')}` });
    if (!hasDiagram(name)) return res.status(404).json({ error: 'unknown_diagram', message: `No such diagram. The diagrams are: ${DIAGRAM_NAMES.join(', ')}` });
    return res.json({ ...buildDiagram(castFor(req), name), vertical: verticalOf(req) });
  });
  api.get('/scenarios', (req, res) => { noStore(res); res.json({ scenarios: buildStory(castFor(req), verticalOf(req)).scenarios }); });
  api.get('/info', (_req, res) => {
    noStore(res);
    res.json({ source: mode.source, modes: ['mock', 'real'], ...realInfo(), simulated: mode.source === 'mock', version: VERSION, verticals: Object.keys(VERTICALS), ops: Object.keys(OPS).length });
  });

  // Rule 19: the Mock/Real toggle. Exactly { source: "mock" | "real" }. Real not configured: 409. Switching never contacts anything: the one read is a separate, confirmed call.
  api.get('/mode', (_req, res) => { noStore(res); res.json({ source: mode.source, ...realInfo() }); });
  api.post('/mode', (req, res) => {
    noStore(res);
    const b = req.body;
    if (!isObj(b) || Object.keys(b).length !== 1 || !sourceOf(b.source)) return res.status(400).json({ error: 'bad_request', message: 'The body must be exactly { "source": "mock" } or { "source": "real" }' });
    if (b.source === 'real' && !real.configured) return res.status(409).json({ error: 'real_not_available', message: real.reason });
    mode.source = b.source;
    return res.json({ source: mode.source, ...realInfo() });
  });

  // The state of the page: Mock = the engine's snapshot (a peek never creates a workspace); Real = the last read of the configured org, or null.
  api.get('/state', workspace, (req, res) => {
    noStore(res);
    const id = req.workspaceId; const vertical = verticalOf(req);
    if (mode.source === 'real') return res.json({ source: 'real', workspace: id, host: real.host, real: workspaces.real(id) });
    const e = workspaces.peek(id, vertical) || new Engine(castFor(req));
    return res.json({ source: 'mock', workspace: id, vertical, state: e.snapshot() });
  });

  // Turn an engine run into hops: the browser to the lab, then each Salesforce call the mock app made. Every hop has its own span on one trace.
  const hopsFor = (req, route, calls, trace) => {
    const tp = (sp) => formatTraceparent(trace.traceId, sp);
    const first = trace.span();
    const hops = [{ n: 1, from: 'browser', to: 'lab API', method: req.method, url: route, traceparent: tp(first), spanId: first }];
    calls.forEach((c, i) => {
      const sp = trace.span();
      hops.push({ n: i + 2, from: 'PingOne Privilege (mock)', to: 'Salesforce (mock)', method: c.method, url: `https://${c.host}${c.path}`, request: c.request, status: c.status, response: c.response, traceparent: tp(sp), spanId: sp });
    });
    return hops;
  };
  const respond = (req, res, { engine, trace, r, route, head, calls }) => {
    const hops = hopsFor(req, route, calls ?? engine.takeCalls(), trace);
    res.set('traceparent', hops[0].traceparent);
    const common = { workspace: req.workspaceId, source: 'mock', vertical: verticalOf(req), hops, traceId: trace.traceId, state: engine.snapshot(), ...(head ?? NO_RUN) };
    if (r.ok) return res.json({ ok: true, result: r.result, ...common });
    const { ok, status, code, message, ...extra } = r;
    // A refusal the visitor asked for (a sign-in failure, a license rule) may come back as data (HTTP 200, ok: false) because a browser logs every 4xx as a
    // console error; a downstream failure (5xx) is never hidden: it keeps its honest status and its structured { error, message }.
    const asData = req.body.refusalsAs200 === true && status < 500;
    return res.status(asData ? 200 : status).json({ ok: false, error: code, message, ...extra, ...common });
  };

  api.get('/actions', (_req, res) => { noStore(res); res.json({ ops: Object.fromEntries(Object.entries(OPS).map(([op, [, keys]]) => [op, keys])) }); });
  // The audit entry the engine wrote for this op: the last entry whose kind matches the op (the engine logs one per op, once it ran).
  const auditAfter = (before, engine) => {
    const after = engine.snapshot().audit;
    const known = new Set(before.map((e) => e.n));
    return [...after].reverse().find((e) => !known.has(e.n)) ?? null;
  };
  api.post('/actions', workspace, (req, res, next) => {
    noStore(res);
    try {
      if (!isObj(req.body)) return res.status(400).json({ error: 'bad_request', message: 'The body must be a JSON object' });
      if (overBounds(req.body)) return res.status(413).json({ error: 'payload_too_large', message: TOO_BIG });
      if (!Object.keys(req.body).every((k) => ['op', 'params', 'vertical', 'refusalsAs200'].includes(k))) return res.status(400).json({ error: 'unknown_field', message: 'The body carries a field the lab does not take' });
      if (mode.source !== 'mock') return res.status(409).json({ error: 'real_is_read_only', message: 'Real mode only reads: switch to Mock to act' });
      if (typeof req.body.op !== 'string' || !Object.hasOwn(OPS, req.body.op)) return res.status(400).json({ error: 'unknown_op', message: 'The lab does not know that action' });
      if (req.body.params !== undefined && !isObj(req.body.params)) return res.status(400).json({ error: 'bad_request', message: 'params must be an object' });
      const engine = workspaces.engine(req.workspaceId, verticalOf(req), castFor(req));
      const trace = newTrace(req.headers.traceparent);
      // Rule 27: one op is one run. The engine wrote its audit entry and made its Salesforce calls; the record is built from that
      // computed-once outcome. A refusal the engine threw before anything ran (unknown op, bad field, not linked, workspace full) began
      // no run: the answer carries NO_RUN instead of an older record.
      const auditBefore = engine.snapshot().audit;
      const r = tryOp(engine, req.body.op, req.body.params ?? {});
      const calls = engine.takeCalls();
      let head;
      if (r.ok) {
        const entry = auditAfter(auditBefore, engine);
        const runId = runLog.mock(() => [...opEvents({ op: req.body.op, params: req.body.params ?? {}, result: r.result, auditText: entry?.text ?? '' }), ...callEvents(calls)]);
        head = runId ? runField(runId) : { run: null, runNote: RECORDER_DOWN };
      } else {
        head = NO_RUN;
      }
      return respond(req, res, { engine, trace, r, route: '/api/actions', head, calls });
    } catch (e) { return next(e); }
  });

  // A scripted scenario: reset this workspace's engine to the scenario's start, run its steps, leave the engine where it ended. `upTo` runs only the first N.
  api.post('/scenarios/:id/run', workspace, (req, res, next) => {
    noStore(res);
    try {
      const b = bodyOf(req);
      if (overBounds(b)) return res.status(413).json({ error: 'payload_too_large', message: TOO_BIG });
      if (!Object.keys(b).every((k) => ['vertical', 'upTo'].includes(k))) return res.status(400).json({ error: 'unknown_field', message: 'The body carries a field the lab does not take' });
      if (mode.source !== 'mock') return res.status(409).json({ error: 'real_is_read_only', message: 'Real mode only reads: switch to Mock to run a scenario' });
      const sc = scenarioById(typeof req.params.id === 'string' ? req.params.id : '');
      if (!sc) return res.status(404).json({ error: 'unknown_scenario', message: 'No such scenario' });
      if (b.upTo !== undefined && (!Number.isInteger(b.upTo) || b.upTo < 0 || b.upTo > SCENARIOS.reduce((m, x) => Math.max(m, x.steps.length), 0))) return res.status(400).json({ error: 'bad_request', message: 'upTo must be a whole number of steps' });
      const cast = castFor(req);
      const run = runScenario(cast, sc, { upTo: b.upTo ?? Infinity });
      // The workspace's engine becomes the scenario's, so the page's state reads straight on from it.
      const kept = workspaces.put(req.workspaceId, verticalOf(req), run.engine);
      const steps = run.steps.map(({ index, op, params, say, expect, result, met, calls }) => ({ index, op, params, say, expect, met, result, calls }));
      return res.json({ scenario: sc.id, source: 'mock', workspace: req.workspaceId, vertical: verticalOf(req), ok: run.ok, setupFailures: run.failedSetup, steps, state: kept.snapshot() });
    } catch (e) { return next(e); }
  });

  // The one Real-mode call: confirm gate (type the host), then ONE sign-in and a read-only listing. The key and the token are never in an answer.
  api.post('/real/read', workspace, async (req, res, next) => {
    noStore(res);
    try {
      const b = req.body;
      if (!isObj(b) || Object.keys(b).length !== 1 || typeof b.confirm !== 'string') return res.status(400).json({ error: 'bad_request', message: 'The body must be exactly { "confirm": "<the org host>" }' });
      if (!real.configured) return res.status(409).json({ error: 'real_not_available', message: real.reason });
      if (mode.source !== 'real') return res.status(409).json({ error: 'not_in_real_mode', message: 'Switch to Real first (this call contacts the configured Salesforce org)' });
      if (b.confirm.trim().toLowerCase() !== real.host) return res.status(400).json({ error: 'confirm_required', message: `Type the org host (${real.host}) to confirm that this one read contacts it` });
      if (reading) return res.status(409).json({ error: 'read_in_progress', message: 'A read is already running' });
      reading = true;
      try {
        const snapshot = await real.read({ traceparent: req.headers.traceparent });
        workspaces.setReal(req.workspaceId, snapshot);
        res.set('traceparent', snapshot.hops[0].traceparent);
        return res.json({ ok: true, source: 'real', workspace: req.workspaceId, real: snapshot, traceId: snapshot.traceId });
      } finally { reading = false; }
    } catch (e) {
      if (e instanceof InputError) return res.status(e.status).json({ ok: false, error: e.code, message: e.message, ...(e.extra || {}) });
      return next(e);
    }
  });

  // The record of one run (rule 27), asked for by the id the run's own answer carried. Every run here is Mock (Real mode runs nothing), so the
  // mode cannot mismatch; a run the lab no longer keeps says so instead of showing another.
  api.get('/actions/run', async (req, res) => {
    noStore(res);
    if (Object.keys(req.query).some((k) => k !== 'runId')) return res.status(400).json({ error: 'unknown_field', message: 'The query carries a parameter this route does not take' });
    const id = req.query.runId;
    if (typeof id !== 'string' || !RUN_ID.test(id)) return res.status(400).json({ error: 'bad_run_id', message: 'runId must be the id of one run' });
    const run = runLog.get(id);
    if (!run) return res.json({ record: null, message: NO_LONGER_KEPT });
    try {
      return res.json({ record: await recordOf(run) });
    } catch (err) {
      if (err instanceof RunObsError) return res.status(err.status).json({ error: err.code, message: err.message });
      reportFailure('record', err);
      return res.status(500).json({ error: 'server_error', message: 'The lab could not build this run\'s record (the server log says why).' });
    }
  });

  api.post('/reset', workspace, (req, res) => { noStore(res); workspaces.reset(req.workspaceId); runLog.clear(); return res.json({ reset: 'ok', workspace: req.workspaceId }); });
  app.get('/api/shelf', (_req, res) => { res.set('Cache-Control', 'no-store'); res.json(shelfInfo()); }); // the header "Shelf" button
  api.use((_req, res) => res.status(404).json({ error: 'not_found', message: 'No such API route' }));
  app.use('/api', api);

  // Outside /api only a GET or HEAD can succeed: a write to the page is 405 (Allow) on "/" and a JSON 404 anywhere else.
  const hasShell = fs.existsSync(path.join(webDist, 'index.html'));
  app.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    return hasShell && req.path === '/' ? res.set('Allow', 'GET, HEAD').status(405).json({ error: 'method_not_allowed', message: 'The page takes GET and HEAD only' }) : res.status(404).json({ error: 'not_found', message: 'Not found' });
  });
  if (hasShell) {
    app.use(express.static(webDist, { redirect: false, index: false, dotfiles: 'ignore', fallthrough: true }));
    // 4. The app shell is for PAGE ADDRESSES only (isPageAddress): a missing asset is a JSON 404, never a 200 HTML page that a script would try to run.
    app.use((req, res, next) => (isPageAddress(req.path) ? res.sendFile(path.join(webDist, 'index.html')) : next()));
  }
  // 5. The last two handlers catch everything left, for every method and path: fixed JSON, no path, no stack, no log (Express's default would echo the path).
  app.use((_req, res) => res.status(404).json({ error: 'not_found', message: 'Not found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = Number(err?.status || err?.statusCode);
    if (res.headersSent) return res.end();
    if (err instanceof InputError) return res.status(err.status).json({ error: err.code, message: err.message });
    if (status === 413) return res.status(413).json({ error: 'payload_too_large', message: 'The request body is over 32 KB' });
    if (status === 415) return res.status(415).json({ error: 'unsupported_charset', message: 'Send the body as utf-8 JSON' });
    if (status >= 400 && status < 500) return res.status(status).json({ error: 'bad_request', message: 'The request could not be read' });
    return res.status(500).json({ error: 'internal_error', message: 'The lab hit an unexpected error; nothing was changed' });
  });
  app.locals.mode = mode;
  return app;
}

export function startHttpServer({ port, host, app = createApp() } = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => resolve({ server, url: `http://${host}:${server.address().port}/` }));
    server.once('error', reject);
  });
}
