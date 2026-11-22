# Support P1 story: evidence

Spec: `docs/specs/2026-11-22-support-p1-story.md`. Branch `story/support-p1`. Mock only; no real org, `.env` or key was used. Tests, builds and the doctor ran on the MacBook Air (Node 26.13.0). The browser proof ran in Chromium (Playwright) against the lab served from the worktree on the Air through an SSH tunnel to 127.0.0.1:7845, because 7835 on this Mac is the running lab container, which was not touched.

## Test runs (final, on the Air)

| Suite | Result |
| --- | --- |
| server (`node --test test/*.test.js`) | 165 tests, 165 pass, 0 fail |
| web (vitest, real Express app in process) | 13 files, 169 tests, 169 pass |
| scripts (`node --test scripts/*.test.mjs`, includes `setup-real.test.mjs`) | 43 tests, 43 pass |
| `npm run build`, `node scripts/doctor.mjs` | exit 0, exit 0 (19 PASS, 0 FAIL) |

Other gates: `conformance.mjs . --new --tier=Demo`: 0 failed, 2 advisory warnings (rule 18 k8s, deferred by the owner). `check-ui-standard.sh` (this Mac, canonical present): OK, pin OK. `check-ui-patterns.mjs --app salesforce-privilege-LAB`: 7 pages, 7 clean, 0 with drift (advisory WARNs T1 line 81 and P11 in the vendored `ReleaseNotes.jsx` pre-date this work). `check-no-ai-attribution.sh`: 0 and 0. gitleaks: clean on every commit.

## Acceptance criteria

1. **Story page.** `web/src/test/support.test.jsx` (first page; three panels; denied with no title and no count; request grants and lists 3 cases with the P1; End access shows "Revoke pending, access still live" with the cases still listed, then denied again; receipt history Granted then Revoke pending then Revoked). Browser: `light-1280-1-denied.png`, `-2-granted.png`, `-3-pending.png`, `-4-denied-again.png` in the scratchpad `sfstory/` folder (also dark and 375px), log `proof-log.txt` (3 rows, "1 confirmed", pending still lists cases, receipt chain, 0 console errors, 0 px horizontal overflow).
2. **Visibility from state.** `server/test/support.test.js`: derived from the `Case Read Access` assignment; a clock move, Sync, another set change nothing; hand assignment and hand removal follow the assignment; delete shows pending then gone.
3. **Value points.** No standing access before and after: beat strip and the same Salesforce panel in three states (screenshots). Note and end time on every grant: request form, `support.requestAccess` (the lab does not claim Privilege stores the note: `docs/ui-notes.md`, README). Receipt plus check: `server/test/support.test.js` "reconciliation reads 1 confirmed only while the Salesforce assignment really exists". The old way: `oldway-panel` with the tag "Narrative: not a Privilege claim"; web test shows it does not change with the engine.
4. **Nothing unproven left.** `grep -rniE "lab-invented|lab-inferred|labInvented|lab_invented|basis" server/src web/src docs README.md CLAUDE.md content-pack.json scripts` returns only the spec (and nothing in the guide); `server/test/fixpass.test.js` S6 and `server/test/api.test.js` prove `/api/story` has no `labels`, `labInvented`, `signInOrder`, `observedLabel`, `claims`, `durations`; web tests prove no chips or panel render; the banner is exactly "Simulated: every behaviour shown was recorded in one real Privilege and Salesforce run."
5. **Scenarios and diagrams.** 12 scenarios (README says 12; `GET /api/scenarios` length 12, `server/test/api.test.js` and `scenarios.test.js`); removed: grant-expires, hand-assigned-drift, sign-in-breaks-later, fail-cert-expired, fail-wrong-username, fail-jwt-not-enabled; `server/test/diagram.test.js`: diagram 2 is "Grant and revoke", no reaper or reconcile-clears arrow, no `basis` on any step; `engine-grant.test.js`: `reaper.run` and `drift.revoke` are `unknown_op`, reconciliation has only `confirmed` and `revokePending`; `engine-connect.test.js`: the removed outcomes are absent, `not_modelled` is the lab's own refusal.
6. **Real ready to toggle.** `scripts/setup-real.sh` and `scripts/setup-real.test.mjs` (key mode 600, certificate, `.env` mode 600 with only the four `SF_*` names, no secret in any output, no overwrite without `--force`, `--dry-run` writes nothing, bad values refused unechoed; then with the loopback stub `/api/info` `realAvailable:true`, toggle to Real and back, one confirmed read signs in with the generated key; unconfigured stays 409). Browser (loopback stub org, made-up values, key from the script): Real button enabled, pressing it shows the Real banner, the confirmed read lists 2 permission sets and 1 user, Mock switches back; unconfigured run showed the Real button disabled with the how-to (`proof2-log.txt`).
7. **Docs and shelf.** README, `CLAUDE.md`, `docs/talk-track.md` (regenerated, test pins it), `content-pack.json` (validates), `docs/real-mode.md`, `docs/ui-notes.md`, `docs/ship-notes.md`, Help text; `docs/shelf-entry.json` description 244 characters, port 7835 and Docker wiring unchanged.
8. **Gates.** See the table above. Browser matrix (light and dark at 1280 and 375) in `proof-log.txt`. Not run: "the shelf Start/Stop controls" (the shelf is out of bounds for this build).

## Unhappy paths

Empty or denied (`cases-denied`, no leak: `support.test.js` and `support.test.jsx`); repeat request (`already_has_permission_set`, state unchanged; `repeat-request.png`); end twice or nothing granted (`policy_not_active`, `unknown_policy`); Privilege cannot sign in (502 `salesforce_sign_in_failed`, state unchanged; `failure-502.png`); hostile note (HTML, bidi, zero-width, `__proto__`, 200 and 201 characters; `hostile-375.png`, `window.__pwned` stays undefined); Real not configured, confirm gate, failing read (existing tests, still green); vertical switch (`vertical-health.png`).

## Decisions the owner should check

1. The mock's "not propagated" window is 2 minutes (inside the guide's "2 to 10"); the exact 10-minute boundary is gone.
2. A setup the guide records no failure for (JWT off, no `api` scope, a Username that is not a usable user) is refused with the lab's own `not_modelled` outcome so the engine has an answer without claiming what Salesforce says.
3. `docs/setup-guide.md`, its PDF and `skills/` still contain the sentence "Use the shortest duration offered so access visibly expires" (a demo tip, not an observation); it conflicts with open item 2 and was left unchanged by instruction.
4. Spec open items 1 to 4 are unchanged: the note is not claimed to be stored by Privilege, the end time is not claimed to end access, `Case Read Access` is the lab's example set, Real needs the owner's own second External Client App.
