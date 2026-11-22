# Support P1 story spec

**Status:** built (evidence: `docs/specs/2026-11-22-support-p1-story-evidence.md`; decisions agreed in chat 2026-11-22; open items below)   **Owner:** the lab's owner

## Goal
The lab is a connection-troubleshooting rehearsal today. Make it show **a person doing a job and what Privilege changes for them**: a support engineer starts with no Case access in Salesforce, works a P1, asks for time-boxed access, does the work, access ends, and a receipt remains. Also **remove everything that was not proven in our one real run** (no "observed / lab-inferred / lab-invented" labels: if it was not seen, it is gone), and make **Real mode ready to toggle** once the owner supplies their own org details.

## What counts as proven (source: `docs/setup-guide.md`, the real run of 2026-11-22)
Keep: connect through a JWT External Client App and its failures (the four `invalid_grant` causes, `invalid_client_id`, missing `refresh_token` scope, certificate mismatch); link by identical email, "its email matches 2 Privilege users", "Duplicate username", seats; grant a permission set through a policy with a duration; receipts (Granted, "until" date); reconciliation "1 confirmed"; "Needs a permission set license", "License Salesforce ≠ …", "Already has this permission set"; revoke by deleting the policy ("Revoke pending, access still live", then gone in Salesforce, receipt Expired/Revoked).
Remove: automatic expiry by itself, the reaper, "the next reconcile clears pending", discovered/orphaned drift, the exact 10-minute boundary, the offered-durations list, the sign-in check order, wrong-username / inactive / unlicensed / expired-certificate / JWT-not-enabled / api-scope outcomes, "sign-in breaks later", case-sensitive matching, the lab's own "Check sign-in" button as if Privilege had it.

## Acceptance criteria (each is a runnable check)
1. **Story page** (new first page, "Support P1"): three panels visible together: the engineer's Salesforce view, Privilege, and "The old way". Playwright: on load the Cases panel shows "no access" and zero cases; after the engineer submits a request (note + end time) and Privilege grants it, the panel lists the P1 case and two others; after "End access" (delete the policy) it shows "no access" again; the receipt list shows the grant, then its Revoked state.
2. **Visibility comes from state, not a flag.** Engine test: the engineer sees Cases if and only if the mock Salesforce user holds the `Case Read Access` permission set assignment; grant adds it, delete-policy removes it (via "Revoke pending, access still live", then gone), nothing else changes it.
3. **Value points shown** (all four, each with a check): no standing access before and after (the same panel in three states); a note and an end time on every grant (shown as the engineer's request; the lab does NOT claim Privilege stores a note, see open item 1); receipt plus a check against Salesforce (reconciliation reads "1 confirmed" only when the Salesforce assignment really exists); "The old way" panel (a permanent admin-assigned set nobody removes) is marked as narrative, not a Privilege claim.
4. **Nothing unproven left.** `grep -ri -E "lab-invented|lab-inferred|labInvented|lab_invented|basis" ` over `server/src web/src docs README.md CLAUDE.md content-pack.json scripts` returns only this spec and the guide's own prose; `/api/story` has no `labels`, `labInvented` or `signInOrder`; no label chips render. The one remaining label is the simulation banner: "Simulated: every behaviour shown was recorded in one real Privilege and Salesforce run."
5. **Scenarios and diagrams cut to proven steps.** Every remaining scenario step is in the "Keep" list; scenario count in the README equals `GET /api/scenarios` length; both diagrams contain no reaper or "reconcile clears" arrow; diagram 2 is renamed "Grant and revoke". Tests prove each removed behaviour is gone (the reaper op, the drift ops, the lab-invented outcomes return `unknown_op` or are absent).
6. **Real is ready to toggle.** `scripts/setup-real.sh` (owner-run, terminal): generates the RSA key and self-signed certificate (key mode 600 in `secrets/`), prints the External Client App steps, then asks for the Consumer Key and Username with **hidden input**, writes `.env` (mode 600) and never echoes, logs or returns them. After it, with a loopback stub org, `GET /api/info` returns `realAvailable:true` and the header Real button is enabled; with nothing configured Real stays disabled with its how-to and `POST /api/mode {source:"real"}` is 409. Agents never run the script with real values.
7. **Docs and shelf stay true.** README, `docs/talk-track.md`, `content-pack.json` (validates), `docs/real-mode.md` describe the new story; the Help text matches; `docs/shelf-entry.json` and port 7835 unchanged.
8. **Gates:** server, web and script tests pass on the Air (real counts); `conformance --new --tier=Demo` 0 FAIL; UI-standard and UI-pattern checks pass; identifier scan 0 over tree and history; gitleaks clean; a real-browser run at light/dark x 1280/375 with screenshots; the shelf Start/Stop controls still pass.

## Unhappy paths (each needs a check)
- Empty or denied state: the Cases panel shows "You don't have access to Cases" and leaks no case titles or counts.
- Repeat request: granting the same set twice returns the observed "Already has this permission set".
- Ending access twice, or ending when nothing is granted: a named, harmless message; state unchanged.
- Privilege cannot sign in to Salesforce when asked to grant: a named 502 (`salesforce_sign_in_failed`), state unchanged.
- The note field: HTML, bidi and zero-width characters, `__proto__`, 200+ characters: rendered inert and bounded; no `<img onerror>` runs.
- Real not configured, wrong host in the confirm gate, or a failing Real read: the existing 409 / `confirm_required` / named 502 behaviour.
- Vertical switch (finance, health, retail): the case titles and names change, the mechanics do not.

## Out of scope
Proving auto-expiry in real Privilege (owner-run later; if proven it can return as an observed step); other stories (sales analyst, auditor); any change to Privilege or Salesforce; Real writing anything (Real stays read-only); the shelf, proxy and meta-repo (a follow-up PR pins the new commit).

## Protected / must not break
Mock is the default with zero outbound calls (netguard + tests); Real is owner-run, read-only, key and Consumer Key write-only; the Mock | Real toggle in every header and in presenter mode; the simulation banner first on every page; vendored shared files and their pins; `GET /api/health` = `demo-health/1`; loopback-only bind; Docker hardening (non-root, read-only FS); only `.example` / `.invalid` hosts and fictional people.

## Open items for the owner (decisions I took, flagged, not hidden)
1. **A note on every grant.** Our real run did not record a note or reason field on a Privilege grant. The story shows the engineer's note as the lab's own request step and does not claim Privilege stores it. Please check the real Grant dialog or policy for a reason/description field; if it exists the story can say so.
2. **How access ends.** Proven: deleting the policy removes the assignment. Not proven: the end time ending access by itself. The story ends access with an explicit "End access" and shows the end time only as the "until" date Privilege recorded on the receipt.
3. **`Case Read Access` is the lab's example set**, same mechanics as the proven `Account Read Access`. The lab claims nothing about what Salesforce Case permissions contain; the engineer's Cases view is the lab's mock.
4. **Real:** ready to toggle after the owner runs `scripts/setup-real.sh` and creates a second External Client App with their own certificate (the Privilege wizard's key is not exportable).

## Verification plan
Builder works only in `/Users/cmuir/Development/.wt-sfpriv-story` (branch `story/support-p1`), tests on the Air, real-browser proof in Mock. Then an independent skeptical reviewer in a fresh clone (hostile input, mutations, label grep, browser matrix, Real with a loopback stub only), then one fix pass. Go-ahead needed from the owner before: merging the PR to the public lab repo, the meta-repo submodule-pin PR, and recreating the running container. The shelf sweep row is re-run after deploy.
