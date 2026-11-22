import test from 'node:test';
import assert from 'node:assert/strict';
import { runChecks, allPassed } from '../src/doctor.js';

test('the doctor passes on a clean checkout with no settings, and names every area', async () => {
  const checks = await runChecks({ env: {} });
  assert.ok(allPassed(checks), JSON.stringify(checks.filter((c) => c.level === 'fail')));
  for (const id of ['node', 'mode', 'bind', 'port', 'real-guard', 'scenarios', 'mock-outbound', 'outcomes', 'fixes', 'story-tokens', 'verticals', 'story-hosts', 'diagrams', 'story-keys', 'netguard', 'tenant']) assert.ok(checks.some((c) => c.id === id), id);
});

test('the doctor fails on a bad bind, a bad port and a bad source, and prints no setting value', async () => {
  const checks = await runChecks({ env: { PORT: '5000', SFPRIV_DEFAULT_SOURCE: 'bogus', SF_CLIENT_ID: 'SECRET-VALUE-123' } });
  assert.equal(checks.find((c) => c.id === 'port').level, 'fail');
  assert.equal(checks.find((c) => c.id === 'mode').level, 'fail');
  assert.ok(!JSON.stringify(checks).includes('SECRET-VALUE-123'));
});
