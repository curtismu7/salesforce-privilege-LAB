# Real mode (owner-run, read-only)

Mock is the default and needs nothing. Real is for the owner only: it signs in once to **one** Salesforce org that you name, and **reads** its permission sets and users. It grants, changes and deletes nothing. The Mock behaviours were recorded in one real Privilege and Salesforce run (`docs/setup-guide.md`); a Real read shows you your own org's list, nothing more.

Agents and tests never run this against a live org. The tests use an in-process stub on loopback.

## What Real reads

- One RS256 JWT-bearer sign-in to `POST /services/oauth2/token` on the origin in `SF_LOGIN_URL`.
- Two fixed read-only queries, nothing else:
  - `SELECT Id, Label, Name FROM PermissionSet WHERE IsOwnedByProfile = false ORDER BY Label LIMIT 200`
  - `SELECT Id, Username, Email, Name, IsActive FROM User WHERE UserType = 'Standard' ORDER BY Username LIMIT 200`
- The answer shown on the page is those two lists, the three hops (method, path, status, `traceparent`) and nothing else. The private key, the access token and the client id are never in an answer, a log line or an error message. Anything Salesforce sends back that looks like a credential (a JWT, a long token) is replaced by a fixed note.

## Owner steps

Run these yourself, in your own terminal. Agents and tests never run the script with real values and never touch a real `.env` or key.

1. **Run `scripts/setup-real.sh`.** It checks that `openssl` is installed, makes a 2048-bit RSA key and a self-signed certificate valid two years in `secrets/` (the key is mode 600 and is never printed), prints the External Client App steps below, then asks for three values: the **org URL** (visible), the **Consumer Key** and the **Username** (both typed with hidden input, never echoed, logged or returned). It writes the lab's own `.env` (mode 600) with only the four `SF_*` names the lab reads. It refuses to overwrite an existing key, certificate or `.env` unless you pass `--force` (the old `.env` is then kept as `.env.bak.<time>`). `--dry-run` checks `openssl`, prints the steps and what it would write, and writes and asks nothing. `--host-path` writes `SF_PRIVATE_KEY_PATH` as the key's path on this Mac (host-run) instead of the Docker path `/run/secrets/sf-private-key.pem`.
2. **Create a SEPARATE External Client App for this lab** (the script prints the same list): `docs/setup-guide.md` connects Privilege and its wizard generates Privilege's own key, which is not exportable, so Real needs a second app with its own certificate.
   1. Setup, External Client App Manager, New External Client App; Distribution State Local.
   2. API (Enable OAuth Settings): Enable OAuth; Callback URL `https://login.salesforce.com` (required, never used by JWT).
   3. OAuth Scopes: `api` and `refresh_token, offline_access`.
   4. Flow Enablement: Enable JWT Bearer Flow; upload `secrets/sf-lab-certificate.crt`.
   5. App, Policies, Edit, OAuth Policies, Permitted Users: "Admin approved users are pre-authorized".
   6. Create an empty permission set (license None), link it to the app (App Policies, Select Permission Sets) and assign it to a Salesforce-licensed admin, not the built-in Integration User.
   7. Wait up to 10 minutes. Then copy only the Consumer Key (Settings, OAuth Settings; Salesforce emails a verification code first) and the exact Username from Setup, Users (not the email) for the script's prompts.
3. **Restart the lab** so it reads the file: `docker compose up -d --build` (or `./scripts/run.sh`). Compose reads `.env` through `env_file` with `required: false`, so a missing `.env` or key never breaks `up`; the key reaches the container only through `./secrets` mounted read-only at `/run/secrets` and is never copied into the image (`.dockerignore` excludes `.env`, `secrets/` and key files, and a test pins that). Keep the key at mode 600; on a Docker host where the container user (`node`, uid 1000) does not own the file, `sudo chown 1000 secrets/sf-private-key.pem` (mode 600) keeps it private. Never make the key world-readable.
4. **Check the mode before and after every rebuild** (rule 26): `curl -s http://127.0.0.1:7835/api/info` must report the same `source` and `realAvailable` after a rebuild as before. Once the script has run, `realAvailable` is `true` and the header **Real** button is enabled; with nothing configured it stays disabled with its how-to and `POST /api/mode {"source":"real"}` answers **409**.

If you prefer to do it by hand, `.env.example` lists the four names and the two `openssl` commands the script runs are `openssl genrsa -out <key-name>.pem 2048` and `openssl req -x509 -new -key <key-name>.pem -sha256 -days 730 -subj "/CN=<certificate-common-name>" -out <certificate-name>.crt`.

## Using it

- The page opens in **Mock** in Docker even when Real is configured (`SFPRIV_DEFAULT_SOURCE=mock`). Put `SFPRIV_DEFAULT_SOURCE=auto` in `.env` to open in Real when it is configured (host-run, with Real configured, opens in Real by default).
- The header Mock / Real toggle calls `POST /api/mode` with exactly `{"source": "real"}`. **Switching contacts nothing.** Not configured: **409**.
- **The confirm gate.** The one read is `POST /api/real/read` with `{"confirm": "<the org host>"}`, the host from `SF_LOGIN_URL`. You have to type it; an empty, partial or different value is a 400 and contacts nothing. Only then does the lab sign in and read, once, with a 10 second and 1 MiB cap and no redirect followed.
- Real is **read-only**: while Real is selected every Mock write (`POST /api/actions`, scenario runs) answers 409 `real_is_read_only`.
- If the read fails the answer is JSON `{error, message}` with a 502 or 504: `salesforce_sign_in_rejected` (with the likely causes and fixes from the guide), `salesforce_unreachable`, `salesforce_timeout`, `salesforce_redirect_refused`, `salesforce_cross_origin_instance_url`, `private_key_unreadable` or `private_key_invalid` (an RSA PEM is required).

## Safety, in one list

Loopback-only publish (`127.0.0.1:7835`), Host check, same-origin writes; the one outbound origin is `SF_LOGIN_URL` (netguard allows that host and nothing else); https only; no private, loopback, link-local, carrier-grade, NAT64 or 6to4 address behind a name; no redirects; a confirm gate; the key and token are write-only. See `docs/safety.md`.
