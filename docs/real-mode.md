# Real mode (owner-run, read-only)

Mock is the default and needs nothing. Real is for the owner only: it signs in once to **one** Salesforce org that you name, and **reads** its permission sets and users. It grants, changes and deletes nothing. Every statement the lab makes about Salesforce or PingOne Privilege is still "observed on one org and one Privilege build, UNVERIFIED as a product claim"; a Real read shows you your own org's list, nothing more.

Agents and tests never run this against a live org. The tests use an in-process stub on loopback.

## What Real reads

- One RS256 JWT-bearer sign-in to `POST /services/oauth2/token` on the origin in `SF_LOGIN_URL`.
- Two fixed read-only queries, nothing else:
  - `SELECT Id, Label, Name FROM PermissionSet WHERE IsOwnedByProfile = false ORDER BY Label LIMIT 200`
  - `SELECT Id, Username, Email, Name, IsActive FROM User WHERE UserType = 'Standard' ORDER BY Username LIMIT 200`
- The answer shown on the page is those two lists, the three hops (method, path, status, `traceparent`) and nothing else. The private key, the access token and the client id are never in an answer, a log line or an error message. Anything Salesforce sends back that looks like a credential (a JWT, a long token) is replaced by a fixed note.

## Owner steps

1. **Create a SEPARATE External Client App for this lab.** `docs/setup-guide.md` connects Privilege: its wizard generates Privilege's own key and certificate, so that app is Privilege's. Real mode signs in with a key and certificate of your own, so it needs a second External Client App in the same Developer org (or a different one). Create it as the setup guide's Salesforce side says: JWT Bearer Flow, the scopes `api` and `refresh_token, offline_access`, Permitted Users set to "Admin approved users are pre-authorized", and an empty permission set linked to the app and assigned to a Salesforce-licensed admin (not the built-in Integration User). The certificate you upload is the one from step 2. Wait up to 10 minutes after creating the app.
2. **Make an RSA key and a self-signed certificate.** The lab signs with RS256 only (no EC key, no other algorithm). Two commands, with your own file names (placeholders in angle brackets):

   ```
   openssl genrsa -out <key-name>.pem 2048
   openssl req -x509 -new -key <key-name>.pem -sha256 -days 730 -subj "/CN=<certificate-common-name>" -out <certificate-name>.crt
   ```

   Upload `<certificate-name>.crt` to the second app (Flow Enablement, Enable JWT Bearer Flow). The private key `<key-name>.pem` never leaves your machine: do not paste it anywhere, and keep it out of the repo.
3. **Write the lab's own `.env`** beside `docker-compose.yml` (mode 600, git-ignored; `.env.example` lists the names only):

   ```
   SF_LOGIN_URL=<the org's My Domain origin, https only, no path>
   SF_CLIENT_ID=<the app's Consumer Key>
   SF_USERNAME=<the authorized user's Username, not the email>
   SF_PRIVATE_KEY_PATH=<see step 4>
   ```

   `SF_LOGIN_URL` is the one and only host the lab will contact, and it must be the My Domain origin: if Salesforce answers with a different instance URL the read is refused, not followed.
4. **Give the lab the key as a file.**
   - **Docker (OrbStack):** copy the PEM into `./secrets/` (the folder is in the repo, empty and git-ignored, and is mounted read-only at `/run/secrets`), for example `secrets/sf-private-key.pem`, then set `SF_PRIVATE_KEY_PATH=/run/secrets/sf-private-key.pem`. The key is never copied into the image: `.dockerignore` excludes `.env`, `secrets/` and key files, and a test pins that. **Keep the key at mode 600** (`chmod 600 secrets/sf-private-key.pem`): on OrbStack the bind-mounted file is owned by the container user, so 600 works. On a Docker host where the container user (`node`, uid 1000) does not own the file, make it readable by that user, for example `sudo chown 1000 secrets/sf-private-key.pem` with mode 600 or 400. **Never make the key world-readable.**
   - **Host-run (`npm start`):** `SF_PRIVATE_KEY_PATH` is the path of a PEM file on your Mac; keep it outside the repo.
5. **Start the lab.** `docker compose up -d --build` (or `./scripts/run.sh`). Compose reads `.env` through `env_file` with `required: false`, so a missing `.env` or key never breaks `up`: Real then says which names are missing (never a value) and the toggle answers **409**.
6. **Check the mode before and after every rebuild** (rule 26): `curl -s http://127.0.0.1:7835/api/info` must report the same `source` and `realAvailable` after a rebuild as before. Real configured gives `"realAvailable": true`.

## Using it

- The page opens in **Mock** in Docker even when Real is configured (`SFPRIV_DEFAULT_SOURCE=mock`). Put `SFPRIV_DEFAULT_SOURCE=auto` in `.env` to open in Real when it is configured (host-run, with Real configured, opens in Real by default).
- The header Mock / Real toggle calls `POST /api/mode` with exactly `{"source": "real"}`. **Switching contacts nothing.** Not configured: **409**.
- **The confirm gate.** The one read is `POST /api/real/read` with `{"confirm": "<the org host>"}`, the host from `SF_LOGIN_URL`. You have to type it; an empty, partial or different value is a 400 and contacts nothing. Only then does the lab sign in and read, once, with a 10 second and 1 MiB cap and no redirect followed.
- Real is **read-only**: while Real is selected every Mock write (`POST /api/actions`, scenario runs) answers 409 `real_is_read_only`.
- If the read fails the answer is JSON `{error, message}` with a 502 or 504: `salesforce_sign_in_rejected` (with the likely causes and fixes from the guide), `salesforce_unreachable`, `salesforce_timeout`, `salesforce_redirect_refused`, `salesforce_cross_origin_instance_url`, `private_key_unreadable` or `private_key_invalid` (an RSA PEM is required).

## Safety, in one list

Loopback-only publish (`127.0.0.1:7835`), Host check, same-origin writes; the one outbound origin is `SF_LOGIN_URL` (netguard allows that host and nothing else); https only; no private, loopback, link-local, carrier-grade, NAT64 or 6to4 address behind a name; no redirects; a confirm gate; the key and token are write-only. See `docs/safety.md`.
