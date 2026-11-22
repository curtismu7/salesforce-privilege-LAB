# Ship notes: what remains after the repo exists

Ready-to-apply text for the rulebook's "Ship checklist for every new app" (`~/Development/STANDALONE-RULES.md`, section 4). **Nothing here is applied.** The owner approves creating the repo; every item below is done after that, in this order. Replace the placeholders marked `<...>` first.

## 0. Before anything

- Assign the real **catalog id** and replace the placeholder `D000` in `docs/shelf-entry.json` and `content-pack.json` (`npm run content-pack` rebuilds the pack; its catalog id is in `scripts/build-content-pack.mjs`). The id must be a row in the shelf's `data/catalog.json`, or the shelf refuses the entry.
- Merge the UI branch, then rebuild: `npm ci && npm run build && npm test && npm run doctor`.
- Gates: history scan prints 0 (`git log -p --all | grep -cF -f ~/.config/demo-kit/forbidden-strings.txt`), gitleaks clean, `ci.yml` present, `node ~/Development/demo-kit-base/scripts/conformance.mjs . --new --tier=Demo` 0 FAIL.

## 1. Own public repo (owner approval each time)

`curtismu7/salesforce-privilege-LAB`, public, one clean commit (the local history is for review and is squashed for the push), GitHub account `curtismu7` (`gh auth status`, switch first if another account is active). The owner sets the `FORBIDDEN_STRINGS` repo secret; re-run CI until every job is green. No AI attribution in any commit.

## 2. Shelf registry PR (demo-shelf-LAB, never a direct push)

Check the port is still free and is the lowest free one: `npm run ports -- --next` in demo-shelf-LAB (this lab holds **7835**; if the registry hands out another number, the compose file, Dockerfile, `scripts`, `docs/shelf-entry.json` and README all say 7835 and must change together).

Add to `data/demos.json` (same text as `docs/shelf-entry.json`, with the real `catalogId` and `addedAt` = the date the PR merges):

```json
{
  "id": "salesforce-privilege-lab",
  "addedAt": "<YYYY-MM-DD of the merge>",
  "name": "Salesforce Privilege LAB",
  "kind": "Demo",
  "description": "Connect a Salesforce Developer org to PingOne Privilege, then grant and revoke a permission set for a time window, against a mock org: what goes wrong while connecting, and why. Mock, or an owner-run read-only Real. Observed once, UNVERIFIED.",
  "url": "http://localhost:7835",
  "healthPath": "/api/health",
  "composeFile": "salesforce-privilege-LAB/docker-compose.yml",
  "composeOverlays": [],
  "pingProducts": [],
  "repo": "https://github.com/curtismu7/salesforce-privilege-LAB",
  "catalogId": "<real id>",
  "alsoCatalogIds": [],
  "tags": ["pingone-privilege", "simulated", "real", "learning"],
  "where": "installed"
}
```

Add to `PROXY_PATHS` in `server/src/app.js` (keyed by shelf id):

```js
    'salesforce-privilege-lab': '/salesforce-privilege-lab/',
```

Then regenerate `docs/ports.md` from the registry and run `npm run doctor` there.

## 3. AI-DEMO-Standalone PR

**Lab-proxy route**, `shared/lab-proxy/nginx.conf`. The compose project and service are both `salesforce-privilege-lab`, so the container is `salesforce-privilege-lab-salesforce-privilege-lab-1` and the compose network is `salesforce-privilege-lab_default`. Four insertions, each modelled on the `a2a-lab` ones, all resolved at request time (a `set $var` plus `proxy_pass http://$var`, or the `$lab_upstream` map), never a static `proxy_pass http://container:port`:

1. In the upstream map (next to `a2a-lab                 a2a-lab-a2a-lab-1:7700;`):

   ```
       salesforce-privilege-lab  salesforce-privilege-lab-salesforce-privilege-lab-1:7835;
   ```

2. In the host map (next to `a2a-lab                 a2a-lab.local.ping-devops.com:7700;`):

   ```
       salesforce-privilege-lab  salesforce-privilege-lab.local.ping-devops.com:7835;
   ```

3. Two locations (next to the `a2a-lab` pair, same shape):

   ```
       location = /salesforce-privilege-lab      { add_header Set-Cookie "lab=salesforce-privilege-lab; Path=/; SameSite=Lax" always; set $up_salesforce_privilege_lab "salesforce-privilege-lab-salesforce-privilege-lab-1:7835"; proxy_pass http://$up_salesforce_privilege_lab/; proxy_set_header Host salesforce-privilege-lab.local.ping-devops.com:7835; }
       location = /salesforce-privilege-lab/     { add_header Set-Cookie "lab=salesforce-privilege-lab; Path=/; SameSite=Lax" always; set $up_salesforce_privilege_lab "salesforce-privilege-lab-salesforce-privilege-lab-1:7835"; proxy_pass http://$up_salesforce_privilege_lab/; proxy_set_header Host salesforce-privilege-lab.local.ping-devops.com:7835; }
   ```

   Copy any extra `proxy_set_header X-Forwarded-*` the neighbouring `a2a-lab` lines carry (the lab's same-origin check reads them behind the proxy); the lab accepts `local.ping-devops.com` and `salesforce-privilege-lab.local.ping-devops.com` through `LAB_ALLOWED_HOSTS`.

Run `shared/lab-proxy/check-config.sh` and keep it green.

**Submodule**, `.gitmodules` (and pin the commit that was pushed):

```
[submodule "standalone/salesforce-privilege-LAB"]
	path = standalone/salesforce-privilege-LAB
	url = https://github.com/curtismu7/salesforce-privilege-LAB.git
```

No shared catalog additions are needed (no hop catalog or evidence lanes: this lab calls no MCP gateway, so rule 25 does not apply). Do not add it to `scripts/first-run-labs.txt` unless the owner says so.

## 4. Release

Bump `VERSION` from `3.10` to the next minor (`3.11`, or the next one that is free when you merge). At the top of `RELEASE_NOTES.md`, under the marker, add a heading with the date and:

```
## 3.11 (<YYYY-MM-DD>)

**New labs**

- salesforce-privilege-LAB (<catalog id>, Demo, port 7835): connect a Salesforce Developer org to PingOne Privilege, then grant and revoke a permission set for a time window, against a mock org. It teaches what goes wrong while connecting (17 scripted scenarios, most of them a failure and its fix) and why. Mock by default; an owner-run, read-only Real reads one org's permission sets and users. Every behaviour is observed on one org, UNVERIFIED as a product claim.
```

Update the `UPDATES.md` banner text under its marker to name the new lab (or empty it). Merge on green.

## 5. Local proof

Fast-forward the shared checkouts (only if nothing tracked is modified), recreate lab-proxy once and re-attach every lab network (including `salesforce-privilege-lab_default`), rebuild the shelf with `npm run docker` in demo-shelf-LAB, start the lab (`docker compose up -d --build` in the repo folder), and prove it in a browser at

`https://local.ping-devops.com:8443/salesforce-privilege-lab/`

with the shelf card green and linking there. Check `GET /api/info` before and after the rebuild reports the same `source` and `realAvailable` (rule 26). Verify by content (the page's banner and a scenario run), not by a 200. If the owner has a Real `.env`, it is theirs to check.

## 6. Board row

Update the row in `STANDALONE-COORDINATION.md` / `STANDALONE-PROGRESS.md` to DONE with repo, PRs, port 7835 and the catalog id.

## What the UI merge needs from this step

- The image builds the web app (`npm run build -w web`) from `web/`: the merged UI must build with `npm ci` from the lockfile, with no new workspace name.
- The header Mock / Real toggle must call `POST /api/mode` with exactly `{source}`, disable itself with the 409 text when Real is not configured (`GET /api/info` `realAvailable` and `realReason`), and ask for the confirm host before `POST /api/real/read`.
- After the merge, rebuild the image and rerun the smoke in `docs/real-mode.md` step 6 and the compose tests (`npm test`).
