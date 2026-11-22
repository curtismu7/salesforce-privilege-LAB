import { fillDeep, VERTICALS } from './cast.js';
import { BANNER, CLAIMS, DURATIONS, GUIDE_SOURCE, INTRO, LAB_INVENTED, LAB_INVENTED_ITEMS, LAB_INFERRED, LIVE_LABEL, LIMITS_TEXT, NOT_DEMONSTRATED, OBSERVED, OUTCOMES, TALK_TRACK, TITLE, TROUBLESHOOTING, labelFor } from './data.js';
import { LIMITS, SCOPES, SIGN_IN_ORDER } from './engine.js';
import { OPS } from './actions.js';
import { scenarioList } from './scenarios.js';

export const rawStory = () => ({
  title: TITLE, intro: INTRO, banner: BANNER, claims: CLAIMS.map((c) => ({ ...c, basis: 'observed', label: OBSERVED })), talkTrack: TALK_TRACK.map((t) => ({ ...t, label: labelFor(t.basis) })), notDemonstrated: NOT_DEMONSTRATED,
  labInvented: LAB_INVENTED_ITEMS.map((i) => ({ ...i, basis: 'lab-invented', label: LAB_INVENTED })),
  troubleshooting: TROUBLESHOOTING.map((t) => ({ ...t, basis: t.basis || 'observed', label: labelFor(t.basis || 'observed') })), outcomes: Object.entries(OUTCOMES).map(([id, o]) => ({ id, ...o, label: labelFor(o.basis) })), durations: DURATIONS, limitsText: LIMITS_TEXT,
});

// The story with the cast filled in.
export function buildStory(cast, vertical) {
  const s = fillDeep(rawStory(), cast);
  return { ...s, observedLabel: OBSERVED, labels: { observed: OBSERVED, 'lab-inferred': LAB_INFERRED, 'lab-invented': LAB_INVENTED, live: LIVE_LABEL }, signInOrder: { basis: 'lab-chosen', note: 'The guide lists what must be true, not the order Salesforce checks it in; the lab\'s order is its own choice, and the 10-minute activation boundary is lab-inferred.', checks: SIGN_IN_ORDER }, source: GUIDE_SOURCE, limits: LIMITS, scopes: SCOPES, ops: Object.keys(OPS), scenarios: scenarioList(cast), cast, vertical, verticals: Object.keys(VERTICALS) };
}

// docs/talk-track.md is generated from the same data the UI reads (`npm run talk-track`); a test fails if they drift.
export function renderTalkTrackMarkdown(cast) {
  const s = buildStory(cast, 'finance');
  const parts = ['# Talk track', '', '<!-- Generated from server/src/data.js by `npm run talk-track`. Do not edit by hand. -->', '', `> Every statement about Salesforce or PingOne Privilege here is ${s.observedLabel}. It is not a Ping statement.`, ''];
  for (const t of s.talkTrack) parts.push(`## ${t.title}${t.basis === 'observed' ? '' : ` (${t.basis})`}`, '', t.say, '');
  parts.push('## The scripted scenarios (Mock mode)', '');
  s.scenarios.forEach((sc, i) => parts.push(`${i + 1}. **${sc.title}.** ${sc.say}`));
  parts.push('', '## Lab-invented (say so when you present it)', '');
  for (const n of s.labInvented) parts.push(`- ${n.text}`);
  parts.push('', '## Not demonstrated', '');
  for (const n of s.notDemonstrated) parts.push(`- ${n}`);
  return `${parts.join('\n')}\n`;
}
