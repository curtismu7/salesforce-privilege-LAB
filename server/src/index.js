import { installNetguard } from './netguard.js';
import { startHttpServer, createApp } from './app.js';
import { allPassed, runChecks } from './doctor.js';
import { allowedExtraHosts, assertBindAllowed, bindHost, resolvePort } from './safety.js';
import { applySettings } from './settings.js';
import { defaultSource } from './config.js';
import { createRealOrg } from './real.js';

// The lab's own .env (beside docker-compose.yml) is read first: it names Real mode's one allowed outbound origin. Only the listed keys are taken; never printed.
applySettings();
const real = createRealOrg(process.env);

// Mock makes zero outbound calls. Real's ONE allowed host is the origin named in SF_LOGIN_URL; everything else is refused.
const guard = installNetguard();
if (real.configured) guard.allow(real.host);

// A bad LAB_ALLOWED_HOSTS is a start-up error with a message, not a 403 on every request.
try { allowedExtraHosts(process.env); } catch (e) { console.error(`[salesforce-privilege-lab] refusing to start: ${e.message}`); process.exit(1); }

const checks = await runChecks();
if (!allPassed(checks)) {
  for (const c of checks.filter((x) => x.level === 'fail')) console.error(`[salesforce-privilege-lab] refusing to start: ${c.id}: ${c.detail}`);
  process.exit(1);
}
const source = defaultSource(process.env, real.configured);
const host = assertBindAllowed(bindHost(), process.env);
const { url } = await startHttpServer({ port: resolvePort(), host, app: createApp({ real }) });
console.log(`[salesforce-privilege-lab] lab at ${url} (opens in ${source} mode; bound to ${host}, published on loopback only by compose; Mock makes no outbound call)`);
console.log(`[salesforce-privilege-lab] health: ${url}api/health`);
