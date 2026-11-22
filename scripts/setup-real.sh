#!/usr/bin/env bash
# Owner-run, in your own terminal: makes Real mode ready to toggle. Agents and tests never run it with real values.
#
#   ./scripts/setup-real.sh             interactive: key, certificate, steps, then three prompts and a .env
#   ./scripts/setup-real.sh --dry-run   checks openssl, prints the steps and what it would write; writes nothing, asks nothing
#   ./scripts/setup-real.sh --force     replace an existing key, certificate or .env (the old .env is kept as .env.bak.<time>)
#   ./scripts/setup-real.sh --host-path write SF_PRIVATE_KEY_PATH as the key's path on this Mac (host-run) instead of /run/secrets/... (Docker)
#   ./scripts/setup-real.sh --dir DIR   work in DIR instead of the repo root (the tests use a temporary one)
#
# What it does: a 2048-bit RSA key and a self-signed certificate valid two years into secrets/ (key mode 600, never printed); the numbered
# External Client App steps; then it asks for the org URL (visible), the Consumer Key and the Username (hidden, never echoed) and writes .env
# (mode 600) with only the four SF_* names this lab reads. It never prints, logs or returns a secret. It refuses to overwrite without --force.
# Test hook, for the script test only: SFPRIV_SETUP_NONINTERACTIVE=1 takes the three values from SFPRIV_SETUP_ORG_URL, SFPRIV_SETUP_CONSUMER_KEY
# and SFPRIV_SETUP_USERNAME instead of asking.
set -euo pipefail
set +x

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DRY=0; FORCE=0; HOSTPATH=0; DIR="$ROOT"
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --force) FORCE=1 ;;
    --host-path) HOSTPATH=1 ;;
    --dir) shift; [ $# -gt 0 ] || { echo "setup-real: --dir needs a directory" >&2; exit 2; }; DIR="$1" ;;
    -h|--help) sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "setup-real: unknown option $1 (try --help)" >&2; exit 2 ;;
  esac
  shift
done

command -v openssl >/dev/null 2>&1 || { echo "setup-real: openssl is required and was not found on PATH" >&2; exit 2; }

KEY="$DIR/secrets/sf-private-key.pem"
CRT="$DIR/secrets/sf-lab-certificate.crt"
ENVF="$DIR/.env"
KEY_IN_ENV="/run/secrets/sf-private-key.pem"
[ "$HOSTPATH" = 1 ] && KEY_IN_ENV="$KEY"

# Refuse before changing anything.
if [ "$FORCE" = 0 ]; then
  for f in "$KEY" "$CRT" "$ENVF"; do
    if [ -e "$f" ]; then
      echo "setup-real: $f already exists. Nothing was changed. Run with --force to replace it (the old .env is kept as .env.bak.<time>)." >&2
      exit 3
    fi
  done
fi

cat <<STEPS
Real mode setup (owner-run, read-only). Files go under: $DIR
  key          $KEY   (mode 600, never printed)
  certificate  $CRT   (self-signed, valid two years; this is the file you upload)
  settings     $ENVF  (mode 600; only SF_LOGIN_URL, SF_CLIENT_ID, SF_USERNAME, SF_PRIVATE_KEY_PATH)

Create a SEPARATE External Client App for this lab in Salesforce (the Privilege wizard's app is Privilege's own: its key is not exportable).
 1. Setup, External Client App Manager, New External Client App. Name: anything. Distribution State: Local. Contact Email: yours.
 2. API (Enable OAuth Settings): Enable OAuth. Callback URL: https://login.salesforce.com (required by Salesforce, never used by JWT).
 3. OAuth Scopes: api and refresh_token, offline_access.
 4. Flow Enablement: Enable JWT Bearer Flow, then upload the certificate file named above.
 5. App, Policies, Edit, OAuth Policies, Permitted Users: "Admin approved users are pre-authorized". Save.
 6. Setup, Permission Sets, New (label for example Lab Access, license None), leave it empty. App, Policies, Edit, App Policies, Select
    Permission Sets: move it to Selected. Save.
 7. Permission set, Manage Assignments, Add Assignment: the Salesforce-licensed admin you will give below (not the built-in Integration User).
 8. Wait up to 10 minutes after creating the app. Copy the Consumer Key (Settings, OAuth Settings, Consumer Key and Secret; Salesforce emails a
    verification code first). Copy only the Consumer Key. Use the exact Username from Setup, Users, not the email.
STEPS

if [ "$DRY" = 1 ]; then
  echo
  echo "Dry run: openssl found; nothing was generated, asked or written."
  exit 0
fi

mkdir -p "$DIR/secrets"
BACKUP=""
if [ -e "$ENVF" ]; then BACKUP="$ENVF.bak.$(date +%Y%m%d%H%M%S)"; mv "$ENVF" "$BACKUP"; chmod 600 "$BACKUP"; fi

( umask 077; openssl genrsa -out "$KEY" 2048 >/dev/null 2>&1 )
chmod 600 "$KEY"
openssl req -x509 -new -key "$KEY" -sha256 -days 730 -subj "/CN=salesforce-privilege-lab" -out "$CRT" >/dev/null 2>&1
chmod 644 "$CRT"
echo
echo "Made the key (mode 600, not shown) and the certificate. Upload $CRT in step 4."

if [ "${SFPRIV_SETUP_NONINTERACTIVE:-}" = 1 ]; then
  ORG="${SFPRIV_SETUP_ORG_URL:-}"; CK="${SFPRIV_SETUP_CONSUMER_KEY:-}"; UN="${SFPRIV_SETUP_USERNAME:-}"
else
  echo
  read -r -p "Org URL (the org's My Domain origin, https, no path): " ORG
  read -r -s -p "Consumer Key (hidden): " CK; echo
  read -r -s -p "Username (hidden): " UN; echo
fi

# Validate without ever printing a value.
fail() { echo "setup-real: $1. The key and certificate were made; .env was not written. Run again with --force." >&2; exit 4; }
case "$ORG" in https://*|http://127.0.0.1:*|http://localhost:*) ;; *) fail "the org URL must start with https://" ;; esac
case "$ORG" in *[[:space:]\"\'\#\\]*) fail "the org URL has characters that do not belong in an origin" ;; esac
REST="${ORG#*://}"
case "$REST" in */*|*\?*|*@*) fail "the org URL must be an origin only: no path, query or credentials" ;; esac
[ -n "$CK" ] || fail "the Consumer Key is empty"
[ -n "$UN" ] || fail "the Username is empty"
case "$CK" in *[!A-Za-z0-9._-]*) fail "the Consumer Key has characters it never has" ;; esac
case "$UN" in *[!A-Za-z0-9._@+-]*) fail "the Username has characters that do not belong in a Salesforce Username" ;; esac

( umask 077
  printf 'SF_LOGIN_URL=%s\nSF_CLIENT_ID=%s\nSF_USERNAME=%s\nSF_PRIVATE_KEY_PATH=%s\n' "$ORG" "$CK" "$UN" "$KEY_IN_ENV" > "$ENVF" )
chmod 600 "$ENVF"
unset CK UN

echo
echo "Wrote $ENVF (mode 600). No secret was printed or logged."
[ -z "$BACKUP" ] || echo "The previous .env was kept as $BACKUP."
cat <<DONE
Next: restart the lab so it reads the file (docker compose up -d --build, or ./scripts/run.sh), then check that Real is available:
  curl -s http://127.0.0.1:7835/api/info    (realAvailable should be true; the header Real button is then enabled)
The page still opens in Mock. Real is one read-only look at your org, behind a confirm gate. Never commit .env or secrets/.
DONE
