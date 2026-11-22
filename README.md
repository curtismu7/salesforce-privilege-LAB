# Salesforce Privilege LAB

Tier: Demo
Repo: https://github.com/curtismu7/salesforce-privilege-LAB

Connect a Salesforce Developer org to PingOne Privilege, then let Privilege grant a permission set to one person for a time window and take it away again. The value of this lab is the knowledge that the setup guide records: **what goes wrong while connecting, and why**. Everything runs against a **mock** Salesforce org and a **mock** Privilege app on a lab clock you move yourself. Nothing leaves your machine in Mock mode.

## What is in it

Six pages in one shell (hash routes, the simulation banner first on every page, also in presenter mode): **Story** (the claims, the scripted scenarios with Run, Next and Reset, the talk track), **Connect** (the wizard rehearsal: the sign-in check with every failure, its cause and exact fix), **Link** (Add Users and Sync: the email rule, seats, usernames), **Grant and revoke** (the grant dialog, policies, receipts, reconcile, the lab clock, drift), **Diagram** (two diagram-studio diagrams loaded by name: movable boxes, Simulate, speed, Reset) and **Real** (the owner-run, read-only read behind a confirm gate). The header carries the **Mock / Real** toggle on every page, a **Presenter** mode (key P), the talk track, a Reset, a Shelf link (it appears only when `SHELF_URL` is set) and a Help link. Help points at this lab's future public repository, so it only works once that repo exists.

Where it stands: the engine, the API and the UI are built; Docker (OrbStack) is wired for Mock and, owner-run, for Real (`docs/real-mode.md`, `secrets/`); the shelf entry and the ship text are ready (`docs/shelf-entry.json`, `docs/ship-notes.md`). The public repo, the catalog id and the registrations are not done yet; see "Not done".

## Fork of saas-access-LAB

This is a fork of [curtismu7/saas-access-LAB](https://github.com/curtismu7/saas-access-LAB). It keeps the scaffold (Express app shell, host check, same-origin writes, workspace ids, W3C trace, netguard, doctor, health, the test and CI layout) and the vendored shared components under `web/src` (top menu, JSON pane, verify mark, floating dialog, diagram kit, the shared stylesheet), byte for byte with their pin files. It keeps the idea of a lab clock, receipts, a reaper and drift, narrowed to **one** platform.

What is new:

- A mock Salesforce org (users, 4 licence seats, permission sets, assignments, an External Client App) and a mock Privilege app (wizard, users, policies, receipts, reconciliation).
- A JWT-bearer sign-in check with every failure the guide records, each with its cause and exact fix.
- Link, grant, revoke and drift rules taken from the guide.
- 17 scripted scenarios as data, with `{{cast}}` tokens and three vertical packs (finance, health, retail).
- An owner-run, read-only **Real** mode: one RS256 JWT-bearer sign-in to the one origin in this lab's own `.env`, then a list of that org's permission sets and users.
- Not carried over: the six-platform catalogue, approval chains, the credential masker on responses, the AI-guard and agent-gateway probes.

## What is simulated

Everything in Mock mode. The mock org, the mock Privilege app, the sign-in, the tokens (labelled MOCK, never a Salesforce token) and the mailbox that carries the Consumer Key verification code are all in-process. Every statement about how Salesforce or PingOne Privilege behaves is **observed on one org and one Privilege build, UNVERIFIED as a product claim**: it comes from one real setup done once (`docs/setup-guide.md`) and is never a Ping statement. Each claim, outcome and troubleshooting row carries one of three label states in `basis` and `label`: `observed` (the guide records it), `lab-inferred` (the guide gives the advice or the symptom but not this exact failure: wrong username, inactive or unlicensed user, expired certificate, a missing `api` scope, JWT not enabled, and the exact 10-minute boundary) and `lab-invented` (made up so the demo has something to show). The ORDER the sign-in checks run in is lab-chosen (`signInOrder` in `GET /api/story`). Where the guide recorded a symptom but not Salesforce's words, the lab shows the cause and the fix and leaves the wording empty rather than inventing it. The names *discovered* and *orphaned* for access assigned by hand, and the list of durations offered, are lab-invented.

## Run from a clone

```
npm ci
npm run build        # builds web/dist, the React UI the server then serves
npm run doctor       # preflight
npm start            # http://localhost:7835  (or ./scripts/run.sh)
```

Node 26 only. Docker (OrbStack, never Docker Desktop): `docker compose up --build -d`, published on `127.0.0.1:7835` only, Mock by default. Real in Docker is owner-run: put the four settings in this lab's own `.env` and the key file in `secrets/`, see `docs/real-mode.md`. Dev: `npm run dev -w web` rebuilds `web/dist` on change while `npm start` serves it (one port).

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
- `npm run doctor` runs the preflight, then a real cycle through the HTTP API (connect, link, grant, revoke, a failing sign-in with its fix, a grant that expires, the duplicate-email refusal) on a throwaway port.
- Reset: `POST /api/reset`, or `npm run reset` (loopback only). It restores the mock org, the mock app, the receipts and the lab clock for the workspace.

## API

| Route | What it does |
| --- | --- |
| `GET /api/health`, `/api/info`, `/api/mode`, `/api/story`, `/api/scenarios`, `/api/state`, `/api/shelf` | read |
| `GET /api/diagram?name=<name>&vertical=<v>` | a diagram-studio/1 diagram by name (`connect-and-link`, `grant-expire-revoke`): `{title, intro, nodes, steps}` with every step carrying `basis` and `basisLabel`; an unknown name is a 404 JSON error |
| `POST /api/mode` | exactly `{source: "mock"\|"real"}`; 409 if Real is not configured |
| `GET /api/actions`, `POST /api/actions` | list the ops; run one: `{op, params, vertical?, refusalsAs200?}` |
| `POST /api/scenarios/:id/run` | reset to the scenario's start and run its steps (`{upTo?, vertical?}`) |
| `POST /api/real/read` | the one Real read, behind the confirm gate |
| `POST /api/reset` | reset this workspace |

Writes are workspace-scoped (`X-Workspace`, default `default`). Every answer to an action carries the whole state, a `traceparent` (W3C, a new span on every hop) and the hops: the browser to the lab, then each call the mock Privilege app made to the mock Salesforce org, raw. Downstream failures answer structured JSON `{error, message}`, never HTML or a blank 200.

## Tests

```
npm test                       # server (node --test), web (vitest, against the real Express app in process) and scripts
cd server && node --test test/*.test.js
npm run build                  # the UI build
bash scripts/check-ui-standard.sh   # the vendored stylesheet matches its pin
npm run doctor
```

Tests use an in-process stub token endpoint on loopback for Real mode; no test contacts a real org. Run them on the other Mac with `air-test` where the family rule applies.

### Known limits of the model

- One org, one External Client App, one Privilege application, one permission-set licence rule each (needs a licence, a different user licence, already held).
- Lab-invented (labelled so in the data and the talk track): automatic expiry by a reaper (the guide observed removal only by deleting the policy); "the next reconcile or Sync clears Revoke pending" (the guide observed it clearing after a wait); case-sensitive email matching; the names *discovered* and *orphaned*; the list of durations; and the authorized user's required permissions are not checked.
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
- Real has only ever been run against an in-process stub. A configured Real read is the owner's to run and verify.
- No hosted (k8s) build: deferred by the owner. Conformance is run by hand.
