// The one dispatch used by the API, the scripted scenarios and the tests: an op name, a params object, the engine method that runs it and the
// only keys it accepts. An unknown op or an unknown key is refused whole, without naming it back.
import { refuse } from './errors.js';

export const OPS = Object.freeze({
  'sf.createApp': ['sfCreateApp', ['name']],
  'sf.setScopes': ['sfSetScopes', ['scopes']],
  'sf.setJwtBearer': ['sfSetJwtBearer', ['enabled', 'certId']],
  'sf.setPermittedUsers': ['sfSetPermittedUsers', ['policy']],
  'sf.createPermissionSet': ['sfCreatePermissionSet', ['label', 'userLicense', 'needsPsl']],
  'sf.linkPermissionSet': ['sfLinkPermissionSet', ['permSetId']],
  'sf.assignPermissionSet': ['sfAssignPermissionSet', ['userId', 'permSetId']],
  'sf.removeAssignment': ['sfRemoveAssignment', ['userId', 'permSetId']],
  'sf.createUser': ['sfCreateUser', ['name', 'email', 'username', 'profile']],
  'sf.setFederationId': ['sfSetFederationId', ['userId', 'federationId']],
  'sf.deactivateUser': ['sfDeactivateUser', ['userId']],
  'sf.requestKeyCode': ['sfRequestKeyCode', []],
  'sf.revealConsumerKey': ['sfRevealConsumerKey', ['code']],
  'wizard.orgUrl': ['wizardOrgUrl', ['url']],
  'wizard.generateKey': ['wizardGenerateKey', []],
  'wizard.regenerateKey': ['wizardRegenerateKey', []],
  'wizard.signIn': ['wizardSignIn', ['consumerKey', 'username']],
  'app.create': ['appCreate', ['name']],
  'app.sync': ['appSync', []],
  'app.reconcile': ['appReconcile', []],
  'users.add': ['usersAdd', ['privilegeUserId']],
  'policy.grant': ['policyGrant', ['privilegeUserId', 'permSetId', 'durationMin']],
  'policy.delete': ['policyDelete', ['policyId']],
  'support.requestAccess': ['supportRequestAccess', ['note', 'endAt']],
  'clock.advance': ['clockAdvance', ['minutes']],
});

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Throws an InputError on a refusal; returns the op's result otherwise.
export function runOp(engine, op, params = {}) {
  if (typeof op !== 'string' || !Object.hasOwn(OPS, op)) throw refuse('unknown_op', 'The lab does not know that action');
  if (!isObj(params)) throw refuse('bad_request', 'params must be an object');
  const [method, keys] = OPS[op];
  if (!Object.keys(params).every((k) => keys.includes(k))) throw refuse('unknown_field', 'The body carries a field this action does not take');
  return engine[method](params);
}

// Same, as data: { ok: true, result } or { ok: false, status, code, message, ...extra }.
export function tryOp(engine, op, params) {
  try { return { ok: true, result: runOp(engine, op, params) }; } catch (e) {
    if (e && typeof e.code === 'string' && Number.isInteger(e.status)) return { ok: false, status: e.status, code: e.code, message: e.message, ...(e.extra || {}) };
    throw e;
  }
}
