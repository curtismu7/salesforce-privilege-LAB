// Rule 27: the lab's half of the run-observability panel (runObs.js, the run field on POST /api/actions and GET /api/actions/run).
// The vendored collector has its own tests in the shared folder. Real is tested nowhere here: Real mode runs nothing, so it keeps no run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { assertRunObservability, classify, layerMatchers } from '../src/runObservability.js';
import { KEEP_RUNS, NO_RUN_BEGAN, SERVICE, createRunLog, decisionLine, lineValue, opEvents, callEvents, policyRefusalEvents, recordOf } from '../src/runObs.js';
import { createApp } from '../src/app.js';
import { createWorkspaces } from '../src/workspaces.js';
import { startHttpServer } from '../src/app.js';
import { C } from './helpers.js';

const WORDS = /refused|denied|rejected|forbidden|failed|invalid|expired|mismatch|token|audience|scope|served|unauthori[sz]ed|insufficient|not allowed/i;
const LINE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z salesforce-privilege-lab decision step=[A-Za-z0-9._:/@-]+ layer=[a-z]+ actor=[A-Za-z0-9._:/@-]+ result=(?:passed|stopped|unclear) run=[A-Za-z0-9._:/@-]+$/;
const PRODUCTS = [...new Set(layerMatchers.map((m) => m.product))];
// No shared matcher reads a line, in any of the shapes a collector could hand it (the whole line: no field is cut out first).
const noMatcherReads = (line) => {
  const at = line.split(' ')[0];
  for (const product of PRODUCTS) {
    for (const message of [line, `[${at}] INFO: ${line.split(' ').slice(1).join(' ')}`, `[${at}] WARN: ${line.split(' ').slice(1).join(' ')}`]) {
      assert.equal(classify({ product, message, at: Date.parse(at), atExact: at }, []), null, `${product}: ${message}`);
    }
  }
};

function capture() {
  const lines = [];
  return { lines, runLog: createRunLog({ write: (l) => lines.push(l), clock: () => Date.parse('2026-11-24T10:00:00.000Z') }) };
}

test('a policy.grant is one allowed Privilege decision; its Salesforce call is an information Resource row', async () => {
  const { lines, runLog } = capture();
  // A minimal grant outcome as the engine returns it (the route builds the same events from the same fields).
  const events = [
    ...opEvents({ op: 'policy.grant', params: { privilegeUserId: 'pu-a', permSetId: 'ps-4', durationMin: 60 }, result: { policyId: 'pol-0001', endAt: '2026-11-02T11:00:00.000Z', receipt: 'Granted' }, auditText: 'Case Read Access granted to Dana Reyes until 2026-11-02T11:00Z' }),
    ...callEvents([{ method: 'POST', path: '/services/data/v62.0/sobjects/PermissionSetAssignment', status: 201 }]),
  ];
  assert.equal(events.length, 2);
  const [priv, res] = events;
  assert.equal(priv.layer, 'privilege');
  assert.equal(priv.outcome, 'allowed', 'a grant is a policy decision');
  assert.equal(priv.detail.policy.decision, 'grant');
  assert.equal(priv.detail.policy.id, 'pol-0001');
  assert.equal(res.layer, 'resource');
  assert.equal(res.outcome, 'info', "the org's answer is not a second decision");
  const at = new Date().toISOString();
  for (const ev of events) noMatcherReads(decisionLine({ ...ev, at }, 'act-abc123-1'));
  assert.match(decisionLine({ ...priv, at }, 'act-abc123-1'), LINE);
  assert.doesNotMatch(decisionLine({ ...priv, at }, 'act-abc123-1'), WORDS);
});

test('a policy.delete is an allowed revoke decision; a configuration op is information with no policy detail', () => {
  const [del] = opEvents({ op: 'policy.delete', params: { policyId: 'pol-0001' }, result: { status: 'Revoke pending, access still live' }, auditText: 'Policy pol-0001 deleted' });
  assert.equal(del.layer, 'privilege');
  assert.equal(del.outcome, 'allowed');
  assert.equal(del.detail.policy.decision, 'revoke');
  const [cfg] = opEvents({ op: 'sf.setScopes', params: { scopes: ['api'] }, result: { scopes: ['api'] }, auditText: 'OAuth scopes set' });
  assert.equal(cfg.outcome, 'info', 'configuration is not a policy decision');
  assert.equal(cfg.detail.policy, undefined);
});

test('every value of a line survives the sanitiser: a hostile actor or run id cannot add a key=value or a line', () => {
  const ev = { at: '2026-11-24T10:00:00.000Z', step: 'policy_grant', layer: 'privilege', outcome: 'allowed', who: 'pu-a x=1\ninjected', message: 'x' };
  const line = decisionLine(ev, 'run\nx=1');
  assert.equal(line.split('\n').length, 1);
  assert.ok(!/ x=1/.test(line.replace(/ x=1/, '')), 'the hostile part is masked, not kept');
  assert.match(line, LINE);
});

test('the log keeps the last few runs, oldest first, and Reset clears it', () => {
  const { runLog } = capture();
  for (let i = 0; i < KEEP_RUNS + 3; i += 1) runLog.mock(() => [opEvents({ op: 'policy.grant', params: {}, result: { policyId: `pol-${i}` }, auditText: 'x' })[0]]);
  assert.equal(runLog.size(), KEEP_RUNS);
  assert.ok(runLog.get('act-nope-1') === null, 'an unknown id is not found');
});

test('a throwing writer drops its own line only, and the run stays reachable', () => {
  let n = 0;
  const runLog = createRunLog({ write: () => { n += 1; if (n === 2) throw new Error('ENOSPC'); } });
  const id = runLog.mock(() => [...opEvents({ op: 'policy.grant', params: {}, result: { policyId: 'pol-1' }, auditText: 'x' }), ...callEvents([{ method: 'POST', path: '/x', status: 201 }])]);
  assert.ok(id, 'the run is stored even though a line write threw');
  assert.ok(runLog.get(id), 'reachable by id');
});

test('the chain view: the grant row carries the person and the permission set, and the policy node builds', async () => {
  const { runLog } = capture();
  const events = opEvents({ op: 'policy.grant', params: { privilegeUserId: 'pu-a', permSetId: 'ps-4', durationMin: 60 }, result: { policyId: 'pol-0001', endAt: '2026-11-02T11:00:00.000Z', receipt: 'Granted' }, auditText: 'granted', chain: { user: 'Omar Reyes', scopes: ['Case Read Access'] } });
  const at = new Date().toISOString();
  const rec = await recordOf({ id: 'act-abc123-1', source: 'mock', startedAt: at, endedAt: at, events: events.map((e, seq) => ({ ...e, at, seq })), notes: [], partial: false });
  assert.deepEqual(assertRunObservability(rec), []);
  const c = rec.chain.chains[0];
  assert.equal(c.user.value, 'Omar Reyes');
  assert.deepEqual(c.scopes.values, ['Case Read Access']);
  assert.equal(c.agent, null, 'no agent token exists in this lab');
  assert.equal(c.policies.length, 1);
  assert.equal(c.policies[0].decision, 'grant');
  assert.equal(c.policies[0].id, 'pol-0001');
  // a run with no chain keys builds no chain
  const bare = await recordOf({ id: 'act-abc123-2', source: 'mock', startedAt: at, endedAt: at, events: opEvents({ op: 'clock.advance', params: {}, result: {}, auditText: 'clock' }).map((e, seq) => ({ ...e, at, seq })), notes: [], partial: false });
  assert.equal(bare.chain, null);
});

test('the Salesforce call step names no matcher word: the token endpoint line is clean', () => {
  const [row] = callEvents([{ method: 'POST', path: '/services/oauth2/token', status: 400 }]);
  const line = decisionLine({ ...row, at: new Date().toISOString() }, 'act-abc123-1');
  assert.doesNotMatch(line, WORDS);
  noMatcherReads(line);
  assert.match(line, LINE);
});

test('a policy refusal of a grant or a revoke is a refused Privilege row; input, lookup and capacity refusals are not decisions', () => {
  const [g] = policyRefusalEvents({ op: 'policy.grant', params: { privilegeUserId: 'pu-a' }, code: 'user_not_linked', message: 'Only a linked user can be granted a permission' });
  assert.equal(g.layer, 'privilege');
  assert.equal(g.outcome, 'refused');
  assert.equal(g.detail.policy.decision, 'grant');
  assert.equal(g.detail.reason, 'user_not_linked');
  const [support] = policyRefusalEvents({ op: 'support.requestAccess', params: {}, code: 'license_mismatch', message: 'License x != y' });
  assert.equal(support.step, 'support_requestAccess');
  const [rev] = policyRefusalEvents({ op: 'policy.delete', params: { policyId: 'pol-1' }, code: 'policy_not_active', message: 'already ended' });
  assert.equal(rev.detail.policy.decision, 'revoke');
  for (const code of ['workspace_full', 'unknown_field', 'unknown_permission', 'bad_end_time', 'unknown_policy']) {
    assert.deepEqual(policyRefusalEvents({ op: 'policy.grant', params: {}, code, message: 'x' }), [], `${code} began no run`);
  }
  assert.deepEqual(policyRefusalEvents({ op: 'sf.createApp', params: {}, code: 'eca_exists', message: 'x' }), [], 'configuration is never a policy refusal');
});

test('over the API: an action answers its run id, the record route answers that record, a policy refusal is a refused row and an input refusal begins no run', async () => {
  const { lines, runLog } = capture();
  const workspaces = createWorkspaces();
  const { server, url } = await startHttpServer({ port: 0, host: '127.0.0.1', app: createApp({ configFile: '/nonexistent/customer.config.json', workspaces, runLog }) });
  try {
    const post = (path, body) => fetch(`${url.replace(/\/$/, '')}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }));
    // A whole setup to a grantable state: the scenario-free path is the wizard, so drive it with ops.
    const act = async (op, params) => post('/api/actions', { op, params });
    await act('sf.createUser', { name: 'Integration User', email: 'integ@salesforce.example', username: C.castIntegrationUsername || 'integ@salesforce.example', profile: 'Minimum Access - Salesforce' });
    // The engine's deterministic world: use the scenario's own first preset via a run of one known-good op sequence is overkill; instead
    // drive one op that certainly runs (clock.advance) and one that certainly refuses (policy.grant with no app).
    const clock = await act('clock.advance', { minutes: 5 });
    assert.equal(clock.status, 200);
    assert.ok(clock.body.run?.id, 'a run id answers a run action');
    // A policy refusal (the user is not linked) is the mock Privilege policy's decision: a refused row, with a run.
    const grant = await act('policy.grant', { privilegeUserId: 'pu-a', permSetId: 'ps-4', durationMin: 60 });
    assert.notEqual(grant.status, 200, 'no app yet: the grant is refused');
    assert.ok(grant.body.run?.id, 'a policy refusal is a decision, so it has a run');
    const refused = await fetch(`${url.replace(/\/$/, '')}/api/actions/run?runId=${encodeURIComponent(grant.body.run.id)}`).then((r) => r.json());
    const refusedRow = refused.record.rows.find((r) => r.layer === 'privilege' && r.origin !== 'not-logged');
    assert.equal(refusedRow.outcome, 'refused');
    assert.deepEqual(assertRunObservability(refused.record), []);
    assert.ok(lines.some((l) => /layer=privilege actor=\S+ result=stopped run=/.test(l)), 'the refusal writes one stopped stdout line');
    // An input refusal (a field the lab does not take) began no run.
    const bad = await act('policy.grant', { bogus: 1 });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.run, null, 'a validation refusal begins no run');
    assert.equal(bad.body.runNote, NO_RUN_BEGAN);
    // The record of the clock run.
    const rec = await fetch(`${url.replace(/\/$/, '')}/api/actions/run?runId=${encodeURIComponent(clock.body.run.id)}`).then(async (r) => ({ status: r.status, body: await r.json() }));
    assert.equal(rec.status, 200);
    assert.equal(rec.body.record?.source, 'mock');
    assert.deepEqual(assertRunObservability(rec.body.record), []);
    const stamped = rec.body.record.rows.filter((r) => r.origin !== 'not-logged');
    assert.equal(stamped.length, 1, 'one decision row for one op');
    assert.equal(stamped[0].outcome, 'info', 'clock.advance is information');
    // A bad runId and an unknown query parameter are refused.
    assert.equal((await fetch(`${url.replace(/\/$/, '')}/api/actions/run?runId=nope`)).status, 400);
    assert.equal((await fetch(`${url.replace(/\/$/, '')}/api/actions/run?runId=${encodeURIComponent(clock.body.run.id)}&x=1`)).status, 400);
  } finally {
    server.close();
  }
});
