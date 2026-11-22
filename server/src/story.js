import { fillDeep, VERTICALS } from './cast.js';
import { BANNER, GUIDE_SOURCE, INTRO, LIMITS_TEXT, OUTCOMES, TALK_TRACK, TITLE, TROUBLESHOOTING } from './data.js';
import { LIMITS, SCOPES } from './engine.js';
import { OPS } from './actions.js';
import { scenarioList } from './scenarios.js';

export const rawStory = () => ({
  title: TITLE, intro: INTRO, banner: BANNER, talkTrack: TALK_TRACK, troubleshooting: TROUBLESHOOTING,
  outcomes: Object.entries(OUTCOMES).map(([id, o]) => ({ id, ...o })), limitsText: LIMITS_TEXT,
});

// The story with the cast filled in.
export function buildStory(cast, vertical) {
  const s = fillDeep(rawStory(), cast);
  return { ...s, source: GUIDE_SOURCE, limits: LIMITS, scopes: SCOPES, ops: Object.keys(OPS), scenarios: scenarioList(cast), cast, vertical, verticals: Object.keys(VERTICALS) };
}

// docs/talk-track.md is generated from the same data the UI reads (`npm run talk-track`); a test fails if they drift.
export function renderTalkTrackMarkdown(cast) {
  const s = buildStory(cast, 'finance');
  const parts = ['# Talk track', '', '<!-- Generated from server/src/data.js by `npm run talk-track`. Do not edit by hand. -->', '', `> ${s.banner.mock}`, ''];
  for (const t of s.talkTrack) parts.push(`## ${t.title}`, '', t.say, '');
  parts.push('## The scripted scenarios (Mock mode)', '');
  s.scenarios.forEach((sc, i) => parts.push(`${i + 1}. **${sc.title}.** ${sc.say}`));
  return `${parts.join('\n')}\n`;
}
