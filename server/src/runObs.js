// Rule 27: this lab's side of the shared run-observability panel. The vendored collector (runObservability.js) is never edited here; this is the
// one file that maps this lab's decisions onto the six layers. This lab reads no logs, so it vendors the core only: no readers file and no reader setting anywhere.
//
// What a run is here. ONE call to POST /api/actions (one op): the engine runs it, and the record is built from the audit entry the engine wrote for
// it and the outcome the op returned — computed once, stamped once. A validation refusal (the op was unknown, a field was wrong, the workspace was
// full) began no run: it is the lab's own stop before anything ran, and the answer says so instead of showing an older record.
//
// Which layer holds what. The engine is the lab's mock of BOTH products (the Salesforce org and the Privilege app). Only the ops that change standing
// access are policy points: policy.grant (a grant with a window), policy.delete (revoke), support.requestAccess (the same grant through the P1 story).
// Their rows are Privilege rows, allowed or refused. Every other op is configuration or a Salesforce-side step: creating the app, scopes, certificates,
// sign-in (a credential check), sync, users, the clock — information in the layer the work happened in. The Salesforce call a Privilege action made
// (engine._call) is the Resource server layer's row: what the mock org answered, information, never a second decision.
//
// Stdout line: `<iso> salesforce-privilege-lab decision step=<step> layer=<layer> actor=<who> result=passed|stopped|unclear run=<id>`, one per
// recorded row of the run, stamped with the row's own time. A grant or a revoke writes passed (allowed) or stopped (refused); any other action,
// and each Salesforce call, writes unclear (information, not a decision). Every value passes through the masker and the line sanitiser; the matcher
// words the family's readers look for are absent from every field.
import crypto from 'node:crypto';
import { createMasker, createRunObservability, LAYERS } from './runObservability.js';

export const SERVICE = 'salesforce-privilege-lab';
export const KEEP_RUNS = 12; // closed runs kept: a workspace's ops are replayed one at a time, so the last few are enough
export const NO_RUN_BEGAN = 'This request began no run, so nothing was recorded.';
export const RECORDER_DOWN = 'The lab could not keep a record of this run (the server log says why).';
export const NO_LONGER_KEPT = 'That run is no longer kept: the lab keeps the last few runs, and Reset clears them.';

// Only safe characters survive, so a typed name cannot add a second key=value pair, a quote or a line.
export const lineValue = (v, n = 64) => String(v ?? '').replace(/[^A-Za-z0-9._:/@-]+/g, '_').slice(0, n) || '-';
const MATCHER_WORDS = /refused|denied|rejected|forbidden|failed|invalid|expired|mismatch|token|audience|scope|served|unauthori[sz]ed|insufficient/gi;
const { mask } = createMasker();
const field = (v) => lineValue(mask(String(v ?? ''))).replace(MATCHER_WORDS, '_');
const RESULT = { allowed: 'passed', refused: 'stopped', blocked: 'stopped', info: 'unclear' };

// A recorder that throws must never break the run or the answer: the failure goes to stderr and the run goes on. Only a code (or the error's name)
// is written, never the error's text.
export function reportFailure(where, err) {
  process.stderr.write(`[${SERVICE}] run observability: ${lineValue(where, 40)} ${lineValue(err?.code || err?.name || 'error', 40)} (the error's text is not logged)\n`);
}
export function safely(where, fn) {
  try { return fn(); } catch (err) { reportFailure(where, err); return undefined; }
}

// ---- The decisions one op leaves ----------------------------------------------------------------------------------------------------------------------
const PRODUCT = {
  person: 'lab mock', agent: 'lab mock Privilege app', privilege: 'lab mock Privilege policy',
  gateway: 'lab mock (no gateway in front)', resource: 'lab mock Salesforce org',
};

// The ops that are policy points: what each one decides, and the step names for the line and the rows. Anything else is information.
const POLICY_OPS = new Set(['policy.grant', 'policy.delete', 'support.requestAccess']);

// The layer an op's work happened in, and a fixed step name per op (the op name has dots in it; steps do not).
const STEP_OF = (op) => op.split('.').join('_');

// The audit entry the engine wrote for this op (its text is the lab's own words for what happened) and the outcome.
// `user` names the person the op acted for, where the op's result or params know one — only what the run itself already shows.
export function opEvents({ op, params, result, auditText, chain }) {
  const step = STEP_OF(op);
  const ev = (layer, outcome, message, detail = {}) => ({
    layer, product: PRODUCT[layer], step, outcome, who: actorOf(op, params, result), message, detail,
  });
  const policy = op === 'policy.grant' || op === 'support.requestAccess'
    ? { product: 'lab mock Privilege policy', decision: 'grant', id: result?.policyId ?? null }
    : op === 'policy.delete' ? { product: 'lab mock Privilege policy', decision: 'revoke', id: params?.policyId ?? null } : null;
  const grant = POLICY_OPS.has(op);
  // Chain keys (SPEC-chain-view-2026-11-24), only where a decision row already shows the fact: user and scopes land on the
  // Privilege row, as detail keys the core's chain builder reads. No agent key: this lab has no agent token or OBO exchange.
  const chainDetail = chain && typeof chain === 'object'
    ? { ...(chain.user ? { user: chain.user } : {}), ...(Array.isArray(chain.scopes) && chain.scopes.length ? { scopes: chain.scopes } : {}) }
    : {};
  return [ev('privilege', grant ? 'allowed' : 'info',
    grant
      ? `${auditText} The mock Privilege policy made this grant decision; the receipt records it.`
      : `${auditText} This is configuration or a Salesforce-side step, not a policy decision.`,
    {
      op, ...(result?.policyId ? { policyId: result.policyId } : {}), ...(result?.endAt ? { endAt: result.endAt } : {}),
      ...(policy ? { policy } : {}), ...(params?.privilegeUserId ? { privilegeUserId: params.privilegeUserId } : {}),
      ...(params?.permSetId ? { permSetId: params.permSetId } : {}),
      ...chainDetail,
    })];
}

// The actor of a call, as the page sent it (the line sanitises it): the Privilege user an op names, else the fixed actor the engine logs.
function actorOf(op, params, result) {
  const byOp = {
    'sf.requestKeyCode': 'visitor', 'sf.revealConsumerKey': 'visitor', 'wizard.orgUrl': 'visitor',
    'wizard.generateKey': 'visitor', 'wizard.regenerateKey': 'visitor', 'wizard.signIn': 'visitor',
    'clock.advance': 'visitor', 'policy.grant': params?.privilegeUserId, 'policy.delete': 'visitor',
    'support.requestAccess': 'support-engineer', 'app.sync': 'privilege-app', 'app.reconcile': 'privilege-app',
  };
  return byOp[op] ?? (op?.startsWith('sf.') ? 'privilege-app' : 'visitor');
}

// The Salesforce call the engine made for this op (engine._call), as a Resource server row: what the mock org answered. Information.
export function callEvents(calls) {
  return (calls || []).slice(0, 10).map((c, i) => ({
    layer: 'resource', product: PRODUCT.resource, step: `sf_call_${i + 1}`,
    outcome: 'info', who: 'privilege-app',
    message: `The mock Salesforce org answered ${c.method} ${c.path} with ${c.status}. This is the org's answer to the call Privilege made, not a policy decision.`,
    detail: { method: c.method, path: c.path, status: c.status, callSeq: i },
  }));
}

// A policy refusal of a grant or a revoke is the mock Privilege policy's own decision (the set is already held, the licence or the policy state does
// not allow it): one refused row. Input, lookup, capacity and precondition refusals (a user not linked yet: Add Users, then Sync) are the lab's own
// stop and begin no run.
const POLICY_REFUSALS = new Set(['already_has_permission_set', 'needs_permission_set_license', 'license_mismatch', 'policy_not_active']);
export function policyRefusalEvents({ op, params, code, message }) {
  if (!POLICY_OPS.has(op) || !POLICY_REFUSALS.has(code)) return [];
  const decision = op === 'policy.delete' ? 'revoke' : 'grant';
  return [{
    layer: 'privilege', product: PRODUCT.privilege, step: STEP_OF(op), outcome: 'refused', who: actorOf(op, params, null),
    message: `${message} The mock Privilege policy refused this ${decision}.`,
    detail: { op, reason: code, policy: { product: 'lab mock Privilege policy', decision, id: params?.policyId ?? null } },
  }];
}

// ---- Stdout lines ------------------------------------------------------------------------------------------------------------------------------------
export function decisionLine(ev, runId) {
  return `${ev.at} ${SERVICE} decision step=${lineValue(ev.step)} layer=${lineValue(ev.layer, 12)} actor=${field(ev.who)} result=${RESULT[ev.outcome] ?? 'unclear'} run=${lineValue(runId)}`;
}

// ---- The run log: bounded, KEEP_RUNS per workspace (the mode cannot change a Mock-only run) --------------------------------------------------------
// A run is stored BEFORE its lines are written, so a writer that throws leaves it reachable; each line is written in its own try, so one failed
// write drops one line. Every run here is source 'mock': Real mode is read-only and runs nothing. Each workspace has its own list, so one
// workspace's Reset or its own runs never remove another's; the map itself is bounded (the oldest workspace's list goes past MAX_WORKSPACES).
export const MAX_WORKSPACES = 500; // the same bound createWorkspaces uses
export function createRunLog({ write = (line) => process.stdout.write(`${line}\n`), clock = Date.now } = {}) {
  const part = crypto.randomBytes(3).toString('hex'); // so an id never repeats after a restart or in another process
  let made = 0;
  const kept = new Map(); // workspace id -> its runs, oldest first
  const line = (ev, id) => safely('line', () => write(decisionLine(ev, id)));

  return {
    // One op = one run. `events` is built by the caller from the outcome the engine already computed; `build` may throw, then nothing is stored.
    mock(build, ws) {
      return safely('mock-run', () => {
        const events = build();
        const at = new Date(clock()).toISOString();
        const run = { id: `act-${part}-${++made}`, source: 'mock', startedAt: at, endedAt: at, events: events.map((e, seq) => ({ ...e, at, seq })), notes: [], partial: false };
        const list = kept.get(ws) ?? [];
        kept.delete(ws); // used now, so it moves to the most-recent end of the map
        if (kept.size >= MAX_WORKSPACES) kept.delete(kept.keys().next().value); // the least recently used workspace goes
        kept.set(ws, list);
        list.push(run);
        while (list.length > KEEP_RUNS) list.shift();
        for (const ev of run.events) line(ev, run.id);
        return run.id;
      }) ?? null;
    },
    get(id, ws) {
      const list = kept.get(ws);
      if (list) { kept.delete(ws); kept.set(ws, list); } // a read is a use too
      return (list ?? []).find((r) => r.id === id) || null;
    },
    clear(ws) { kept.delete(ws); },
    size(ws) { return (kept.get(ws) ?? []).length; },
  };
}
export const runField = (id) => (id ? { run: { id } } : { run: null, runNote: RECORDER_DOWN });
export const NO_RUN = Object.freeze({ run: null, runNote: NO_RUN_BEGAN });

// ---- The record ----------------------------------------------------------------------------------------------------------------------------------------
const WHY = {
  person: 'This lab has no sign-in: the actors (the visitor, the Privilege app, the support engineer) are names the lab gives, and no identity provider is called.',
  agent: 'No agent token or OBO exchange exists here: Privilege signs in to Salesforce with a JWT bearer grant as the app\'s integration user.',
  authorize: 'This lab does not call PingOne Authorize.',
  privilege: 'No policy point ran in this request: the op was configuration or a Salesforce-side step, and this lab\'s mock policy decides only grants and revokes.',
  gateway: 'The lab puts no gateway in front of its mock org, so no gateway decision or log exists.',
  resource: 'The mock Salesforce org was not called in this request (the op needed no Salesforce side effect).',
};

export async function recordOf(run, { clock = Date.now } = {}) {
  return createRunObservability({ clock }).collectRun({
    runId: run.id, startedAt: run.startedAt, endedAt: run.endedAt, source: run.source,
    layers: LAYERS.map((layer) => {
      const own = run.events.filter((e) => e.layer === layer).map((e) => ({ at: e.at, product: e.product, outcome: e.outcome, message: e.message, detail: { ...e.detail, eventSeq: e.seq } }));
      return { layer, products: [], reason: WHY[layer], simulated: own };
    }),
  });
}
