# Salesforce Privilege LAB

Tier: Demo
Repo: https://github.com/curtismu7/salesforce-privilege-LAB

**Support P1.** A support engineer holds the Minimum Access profile and nothing else, so the mock Salesforce Cases says "You don't have access to Cases" (the lab's mock wording, not Salesforce's). A P1 lands: the engineer makes a request in the lab with a note and an end time (the lab's own step; Privilege does not store the note in this lab), Privilege grants the `Case Read Access` permission set (the lab's example set) with that end date, and Cases lists three cases with the P1 on top. When the P1 is fixed the access ends by deleting the policy: the policy reads "Revoke pending, access still live" and the cases stay listed until you press **Refresh receipts** (in the guide the removal is queued and a refresh shows it); then the assignment is gone, Cases is denied again, and the receipt shows Granted then Expired / Revoked. The page states the point plainly: no standing access before or after; every grant has an end date and a receipt. Beside it, "The old way" is a narrative of a permanent set nobody removes; it is clearly marked as narrative and is not a Privilege claim. The rest of the lab shows what has to be true first: how Privilege is connected to the org, how a person is linked, and what a grant and a revoke look like. Everything runs against a **mock** Salesforce org and a **mock** Privilege app in this process; nothing leaves your machine in Mock mode.

## What is in it

Seven pages in one shell (hash routes, the simulation banner first on every page, also in presenter mode): **Support P1** (the story: the engineer's Salesforce view, Privilege and "The old way" side by side, with Request access, End access and the three beats), **Scenarios** (12 scripted scenarios with Run, Next step and Reset), **Connect** (the wizard rehearsal: the sign-in check with every recorded failure, its cause and exact fix), **Link** (Add Users and Sync: the email rule, seats, usernames), **Grant and revoke** (the grant dialog, policies, receipts, reconciliation, the lab clock), **Diagram** (two diagram-studio diagrams loaded by name, "Connect and link" and "Grant and revoke": movable boxes, Simulate, speed, Reset) and **Real** (the owner-run, read-only read behind a confirm gate). The header carries the **Mock / Real** toggle on every page, a **Presenter** mode (key P, which says the line for the beat you are in), the talk track, a Reset, a Shelf link (it appears only when `SHELF_URL` is set) and a Help link. Help points at this lab's future public repository, so it only works once that repo exists.

Where it stands: the engine, the API and the UI are built; Docker (OrbStack) is wired for Mock and, owner-run, for Real (`scripts/setup-real.sh`, `docs/real-mode.md`, `secrets/`); the shelf entry and the ship text are ready (`docs/shelf-entry.json`, `docs/ship-notes.md`). The public repo, the catalog id and the registrations are not done yet; see "Not done".

## Fork of saas-access-LAB

This is a fork of [curtismu7/saas-access-LAB](https://github.com/curtismu7/saas-access-LAB). It keeps the scaffold (Express app shell, host check, same-origin writes, workspace ids, W3C trace, netguard, doctor, health, the test and CI layout) and the vendored shared components under `web/src` (top menu, JSON pane, verify mark, floating dialog, diagram kit, the shared stylesheet), byte for byte with their pin files. It keeps the idea of a lab clock and receipts, narrowed to **one** platform.

What is new:

- A mock Salesforce org (users, 4 licence seats, permission sets, assignments, an External Client App) and a mock Privilege app (wizard, users, policies, receipts, reconciliation).
- A JWT-bearer sign-in check with every failure the guide records, each with its cause and exact fix.
- Link, grant and revoke rules taken from the guide, and the Support P1 story built on them (a mock Cases object per vertical, visible only while the engineer holds the `Case Read Access` assignment).
- 12 scripted scenarios as data, with `{{cast}}` tokens and three vertical packs (finance, health, retail).
- An owner-run, read-only **Real** mode: one RS256 JWT-bearer sign-in to the one origin in this lab's own `.env`, then a list of that org's permission sets and users.
- Not carried over: the six-platform catalogue, approval chains, the credential masker on responses, the AI-guard and agent-gateway probes.

## What is simulated

Everything in Mock mode. The mock org, the mock Privilege app, the sign-in, the tokens (labelled MOCK, never a Salesforce token), the Cases and the mailbox that carries the Consumer Key verification code are all in-process. The one thing the lab says about itself is the banner: "Simulated: every behaviour shown was recorded in one real Privilege and Salesforce run." What is not in the lab is anything that run did not show: there is no automatic expiry (the end time is only the "until" date on the receipt; **End access**, deleting the policy, is what removes the access), no drift detection, and no sign-in outcome beyond the ones the setup guide (`docs/setup-guide.md`) records. A setup the guide records no failure for is refused with the lab's own `not_modelled` answer, which says nothing about what Salesforce does. Where the guide recorded a symptom but not Salesforce's words, the lab shows the cause and the fix and leaves the wording empty. The lab does not claim that Privilege stores the engineer's note: the note is the lab's own request step. `Case Read Access` is the lab's example set, with the same mechanics as the guide's `Account Read Access`; what Salesforce Case permissions contain is not claimed.

## Run from a clone

```
npm ci
npm run build        # builds web/dist, the React UI the server then serves
npm run doctor       # preflight
npm start            # http://localhost:7835  (or ./scripts/run.sh)
```

Node 26 only. Docker (OrbStack, never Docker Desktop): `docker compose up --build -d`, published on `127.0.0.1:7835` only, Mock by default. Real in Docker is owner-run: run `scripts/setup-real.sh` in your own terminal (it makes the key and certificate, prints the External Client App steps and writes the lab's own `.env`), see `docs/real-mode.md`. Dev: `npm run dev -w web` rebuilds `web/dist` on change while `npm start` serves it (one port).

## Settings file

This lab reads **its own `.env` beside `docker-compose.yml`** (mode 600, git-ignored; `.env.example` lists the names only), parsed with `util.parseEnv`. Mock needs none of it. Only these keys are ever taken: `SF_LOGIN_URL`, `SF_CLIENT_ID`, `SF_USERNAME`, `SF_PRIVATE_KEY_PATH`, `SFPRIV_DEFAULT_SOURCE`, `SHELF_URL`. The private key is **not** in the file: `SF_PRIVATE_KEY_PATH` names a PEM file. Nothing is printed, and the lab never writes the file.

## Ports, and what to do if the port is taken

This lab uses one port, **7835**, on `127.0.0.1` only. If it is taken, find what holds it and stop that, then start again:

```
lsof -iTCP:7835 -sTCP:LISTEN -n -P
```

The server refuses any other port on purpose (the family allocates one port per app); `PORT=<other port> npm start` fails with a message rather than starting elsewhere. `HOST_PORT` changes only the host side of the Docker publish.

## Mock and Real modes

- **Mock** (the default when Real is not configured): the whole world runs in this process on a lab clock that only moves forward. Writes go through `POST /api/actions`; scripted scenarios run through `POST /api/scenarios/:id/run`.
- **Real** (owner-run, read-only): `POST /api/mode` with exactly `{ "source": "real" }` switches to it and **contacts nothing**. The one read is `POST /api/real/read` with `{ "confirm": "<the org host>" }` (a confirm gate: you type the host). It signs in once with an RS256 JWT bearer and reads permission sets and users, nothing else. Only that one https origin is reachable (plain http only for a loopback stub), a redirect is never followed, the answer is capped at 1 MiB and 10 seconds, private and link-local addresses are refused, and the private key is write-only: never returned, logged or cached. Real is **never on by default in Docker** (`SFPRIV_DEFAULT_SOURCE=mock`).
- `GET /api/info` returns `source` and `realAvailable`. With Real not configured, switching to it answers **409**. The default is Real if configured, else Mock.

## Health, doctor and reset

- `GET /api/health` returns `demo-health/1`.
- `npm run doctor` runs the preflight, then a real cycle through the HTTP API (connect, link, grant, revoke, a failing sign-in with its fix, the Support P1 story, the duplicate-email refusal) on a throwaway port.
- Reset: `POST /api/reset`, or `npm run reset` (loopback only). It restores the mock org, the mock app, the receipts and the lab clock for the workspace.

## API

| Route | What it does |
| --- | --- |
| `GET /api/health`, `/api/info`, `/api/mode`, `/api/story`, `/api/scenarios`, `/api/state`, `/api/shelf` | read |
| `GET /api/diagram?name=<name>&vertical=<v>` | a diagram-studio/1 diagram by name (`connect-and-link`, `grant-and-revoke`): `{title, intro, nodes, steps}`; an unknown name is a 404 JSON error |
| `POST /api/mode` | exactly `{source: "mock"\|"real"}`; 409 if Real is not configured |
| `GET /api/actions`, `POST /api/actions` | list the ops; run one: `{op, params, vertical?, refusalsAs200?}`. The one write endpoint, including the story's `support.requestAccess` (`{note, endAt}`). A run action's answer names its run: `run: {id}` (rule 27); a refusal before anything ran answers `run: null` with `runNote` |
| `GET /api/actions/run?runId=<id>` | the record of one run (rule 27), by the id the run's own answer carried; a run the lab no longer keeps answers `record: null` |
| `POST /api/scenarios/:id/run` | reset to the scenario's start and run its steps (`{upTo?, vertical?}`) |
| `POST /api/real/read` | the one Real read, behind the confirm gate |
| `POST /api/reset` | reset this workspace |

Writes are workspace-scoped (`X-Workspace`, default `default`). Every answer to an action carries the whole state, a `traceparent` (W3C, a new span on every hop) and the hops: the browser to the lab, then each call the mock Privilege app made to the mock Salesforce org, raw. Downstream failures answer structured JSON `{error, message}`, never HTML or a blank 200.

## What each layer logged for this run (rule 27)

The Grant and revoke page and the Support P1 page show the shared panel under the last action: one run (one action) in time order across the six layers. Rows are what the lab's mock computed for that action; nothing is read from a product log.

- **Where the lines live.** The lab process's stdout (`docker compose logs` on the lab container): one line per policy-point decision, `<time> salesforce-privilege-lab decision step=... layer=... actor=... result=passed|stopped|unclear run=<id>`. Every value passes the shared masker and the line sanitiser; no field names a matcher word, a typed name, a consumer key or a token.
- **What is a decision.** Only a grant or a revoke is a policy point: `policy.grant`, `policy.delete` and `support.requestAccess` (the same grant through the P1 story) are allowed Privilege rows. Every other action — the app, scopes, certificates, sign-in (a credential check), sync, users, the clock — is information in the layer the work happened in. The mock Salesforce org's answer to a call Privilege made is an information Resource row, never a second decision. Person is not logged (no sign-in: the actors are names the lab gives); Agent is not logged (Privilege signs in with a JWT bearer grant, not an OBO token); Agent gateway is not logged (the lab puts no gateway in front of its mock org).
- **No run, no record.** A refusal before anything ran (an unknown action, a field that did not pass, a user not linked, a workspace full) began no run: the page says so and shows no older record. The lab keeps the last 12 runs; Reset clears them.
- **Not verified.** Nothing here was run against a real Salesforce org or a real Privilege tenant; every row is the mock's own event.
- **Time.** The time the mock computed the action. Nothing is re-run to build a record. Real mode runs nothing and keeps no run.

## Tests

```
npm test                       # server (node --test), web (vitest, against the real Express app in process) and scripts (including scripts/setup-real.test.mjs)
cd server && node --test test/*.test.js
npm run build                  # the UI build
bash scripts/check-ui-standard.sh   # the vendored stylesheet matches its pin
npm run doctor
```

Tests use an in-process stub token endpoint on loopback for Real mode; no test contacts a real org. Run them on the other Mac with `air-test` where the family rule applies.

### Known limits of the model

- One org, one External Client App, one Privilege application, one permission-set licence rule each (needs a licence, a different user licence, already held).
- The grant dialog's seats line ("0 of 4 seats free") is recorded in the guide but not modelled; what a full count does to a grant is not known.
- The diagram is operable by keyboard for its buttons and for opening a box's details (Tab to a box, Enter or Space); moving a box is by mouse or touch only, and at phone width the wide diagram is panned by dragging. The vendored diagram kit offers no keyboard move.
- Profiles, permission set groups, approval flows and Set Up SSO were not tested, so they are not modelled.
- Per-step limits: a clock move is at most 800 days; a grant is 1 minute to 366 days; 200 policies, 400 receipts, 500 audit entries per workspace; a body is at most 32 KB.

## Troubleshooting

The guide's troubleshooting table is in `GET /api/story` (`troubleshooting`) and in `docs/setup-guide.md`. In the lab, each sign-in failure comes back with `outcome.cause` and `outcome.fix`. The port is taken: see above. The `.env` is missing in a fresh checkout: Mock still works; Real says which names are missing, never a value.

## Ownership

Owner: curtismu7. One writer per repo. No tenant, org, person or company identifier appears anywhere: people are fictional and their emails are on the org's own `.example` host (for example `omar.reyes@fabrikam.example`), the org lives on a `.example` host. Real mode is for the owner only.

## Not done

- The public repository `curtismu7/salesforce-privilege-LAB` does not exist yet (creating it needs the owner's approval), so the Help link in the header does not resolve until it does.
- The catalog id is a placeholder (`D000`) until the owner assigns the real one; the shelf registry entry, the lab-proxy route, the submodule pin, the release notes and the board row are written as ready-to-apply text in `docs/ship-notes.md`, not applied.
- Real has only ever been run against an in-process stub. After `scripts/setup-real.sh` and a second External Client App, a configured Real read is the owner's to run and verify.
- Not proven, so not shown: the end time ending access by itself, and Privilege storing a note on a grant. The owner is asked to check the real Grant dialog for a reason field.
- No hosted (k8s) build: deferred by the owner. Conformance is run by hand.
