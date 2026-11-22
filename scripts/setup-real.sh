#!/usr/bin/env bash
# Owner-run, in your own terminal: makes Real mode ready to toggle. Agents and tests never run it with real values.
#
#   ./scripts/setup-real.sh             interactive: the steps, three prompts, then the key, certificate and .env
#   ./scripts/setup-real.sh --dry-run   checks openssl, prints the steps and what it would write; writes nothing, asks nothing
#   ./scripts/setup-real.sh --force     replace an existing key, certificate or .env (see "Backups" below)
#   ./scripts/setup-real.sh --host-path write SF_PRIVATE_KEY_PATH as the key's path on this Mac (host-run) instead of /run/secrets/... (Docker)
#   ./scripts/setup-real.sh --dir DIR   work in DIR instead of the repo root (the tests use a temporary one)
#
# Order: (1) it asks for the org URL (visible), the Consumer Key and the Username (hidden, never echoed) and checks all three; a bad value stops here and
# nothing on disk has changed. (2) It makes a 2048-bit RSA key and a self-signed certificate valid two years under secrets/, and the new .env, in temporary
# files. (3) Only then does it move anything into place. It never prints, logs or returns a value, and it refuses to write through a symlink.
# Files: secrets/sf-private-key.pem (mode 600), secrets/sf-lab-certificate.crt, .env (mode 600, only the four SF_* names this lab reads).
# Without --force it refuses to overwrite any of the three files. With --force each existing one is first moved to <name>.bak.<time>.<pid>.<n> (the key and
# the .env keep mode 600), and if any later step fails the backups are put back, so a working setup is never lost.
# Test hook, for the script test only: SFPRIV_SETUP_NONINTERACTIVE=1 takes the three values from SFPRIV_SETUP_ORG_URL, SFPRIV_SETUP_CONSUMER_KEY
# and SFPRIV_SETUP_USERNAME instead of asking.
set -euo pipefail
set +x
export LC_ALL=C

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DRY=0; FORCE=0; HOSTPATH=0; DIR="$ROOT"
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --force) FORCE=1 ;;
    --host-path) HOSTPATH=1 ;;
    --dir) shift; [ $# -gt 0 ] || { echo "setup-real: --dir needs a directory" >&2; exit 2; }; DIR="$1" ;;
    -h|--help) sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "setup-real: unknown option $1 (try --help)" >&2; exit 2 ;;
  esac
  shift
done

command -v openssl >/dev/null 2>&1 || { echo "setup-real: openssl is required and was not found on PATH" >&2; exit 2; }

# An absolute directory, so the key path written into .env never depends on where the script was started.
case "$DIR" in /*) ;; *) DIR="$PWD/$DIR" ;; esac
DIR="${DIR%/}"
KEY="$DIR/secrets/sf-private-key.pem"
CRT="$DIR/secrets/sf-lab-certificate.crt"
ENVF="$DIR/.env"
KEY_IN_ENV="/run/secrets/sf-private-key.pem"
[ "$HOSTPATH" = 1 ] && KEY_IN_ENV="$KEY"

# Never write through a symlink; without --force never overwrite.
for f in "$DIR/secrets" "$KEY" "$CRT" "$ENVF"; do
  if [ -L "$f" ]; then echo "setup-real: $f is a symbolic link; refusing to write through it. Nothing was changed." >&2; exit 3; fi
done
if [ "$FORCE" = 0 ]; then
  for f in "$KEY" "$CRT" "$ENVF"; do
    if [ -e "$f" ]; then
      echo "setup-real: $f already exists. Nothing was changed. Run with --force to replace it (the old file is kept as a backup)." >&2
      exit 3
    fi
  done
fi

cat <<STEPS
Real mode setup (owner-run, read-only). Files go under: $DIR
  key          $KEY   (mode 600, never printed)
  certificate  $CRT   (self-signed, valid two years; this is the file you upload)
  settings     $ENVF  (mode 600; only SF_LOGIN_URL, SF_CLIENT_ID, SF_USERNAME, SF_PRIVATE_KEY_PATH)

Create a SEPARATE External Client App for this lab in Salesforce: this lab uses its own key, separate from the one the Privilege wizard generated.
 1. Setup, External Client App Manager, New External Client App. Name: anything. Distribution State: Local. Contact Email: yours.
 2. API (Enable OAuth Settings): Enable OAuth. Callback URL: https://login.salesforce.com (required by Salesforce, never used by JWT).
 3. OAuth Scopes: api and refresh_token, offline_access.
 4. Flow Enablement: Enable JWT Bearer Flow, then upload the certificate file named above.
 5. App, Policies, Edit, OAuth Policies, Permitted Users: "Admin approved users are pre-authorized". Save.
 6. Setup, Permission Sets, New (label for example Lab Access, license None), leave it empty. App, Policies, Edit, App Policies, Select
    Permission Sets: move it to Selected. Save.
 7. Permission set, Manage Assignments, Add Assignment: the Salesforce-licensed admin you will give below (not the built-in Integration User).
 8. Wait up to 10 minutes after creating the app. Copy the Consumer Key (Settings, OAuth Settings, Consumer Key and Secret; Salesforce emails a
    verification code to the app's contact email first). Copy only the Consumer Key. Use the exact Username from Setup, Users, not the email.
STEPS

if [ "$DRY" = 1 ]; then
  echo
  echo "Dry run: openssl found; nothing was generated, asked or written."
  exit 0
fi

# 1. Ask and check everything first. Nothing on disk changes until all three values are good. Messages never contain a value.
if [ "${SFPRIV_SETUP_NONINTERACTIVE:-}" = 1 ]; then
  ORG="${SFPRIV_SETUP_ORG_URL:-}"; CK="${SFPRIV_SETUP_CONSUMER_KEY:-}"; UN="${SFPRIV_SETUP_USERNAME:-}"
else
  echo
  read -r -p "Org URL (the org's My Domain origin, https, no path): " ORG
  read -r -s -p "Consumer Key (hidden): " CK; echo
  read -r -s -p "Username (hidden): " UN; echo
fi
fail() { echo "setup-real: $1. Nothing was changed." >&2; exit 4; }
# https and a host name made of letters, digits, dots and hyphens only (no port, path, query, user info or other characters); plain http only for a loopback stub.
HOST_RE='^https://[A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$'
LOOP_RE='^http://(127\.0\.0\.1|localhost):[0-9]{1,5}$'
[[ "$ORG" =~ $HOST_RE ]] || [[ "$ORG" =~ $LOOP_RE ]] || fail "the org URL must be https:// followed by a host name (letters, digits, dots and hyphens only), nothing else"
case "$ORG" in *..*) fail "the org URL has an empty host label" ;; esac
[ -n "$CK" ] || fail "the Consumer Key is empty"
[ -n "$UN" ] || fail "the Username is empty"
[ "${#CK}" -le 256 ] || fail "the Consumer Key is too long"
[ "${#UN}" -le 256 ] || fail "the Username is too long"
[[ "$CK" =~ ^[A-Za-z0-9._-]+$ ]] || fail "the Consumer Key has characters it never has (ASCII letters, digits, dot, underscore and hyphen only)"
[[ "$UN" =~ ^[A-Za-z0-9._@+-]+$ ]] || fail "the Username has characters that do not belong in a Salesforce Username (ASCII only)"

# 2. Build the new files next to the real ones, under temporary names.
mkdir -p -m 700 "$DIR/secrets"
SUFFIX="$$"
NEWKEY="$KEY.new.$SUFFIX"; NEWCRT="$CRT.new.$SUFFIX"; NEWENV="$ENVF.new.$SUFFIX"
BAK=(); ORIG=(); PLACED=()
cleanup() { rm -f "$NEWKEY" "$NEWCRT" "$NEWENV"; }
restore() {
  for p in "${PLACED[@]+"${PLACED[@]}"}"; do rm -f "$p"; done
  local i; for i in "${!BAK[@]}"; do mv -f "${BAK[$i]}" "${ORIG[$i]}"; done
}
trap 'rc=$?; cleanup; [ "$rc" = 0 ] || restore' EXIT

( umask 077; openssl genrsa -out "$NEWKEY" 2048 >/dev/null 2>&1 )
chmod 600 "$NEWKEY"
openssl req -x509 -new -key "$NEWKEY" -sha256 -days 730 -subj "/CN=salesforce-privilege-lab" -out "$NEWCRT" >/dev/null 2>&1
chmod 644 "$NEWCRT"
( umask 077
  printf 'SF_LOGIN_URL=%s\nSF_CLIENT_ID=%s\nSF_USERNAME=%s\nSF_PRIVATE_KEY_PATH=%s\n' "$ORG" "$CK" "$UN" "$KEY_IN_ENV" > "$NEWENV" )
chmod 600 "$NEWENV"
unset CK UN

# 3. Move into place. With --force each existing file is backed up first (unique name), and any failure puts them back.
STAMP="$(date +%Y%m%d%H%M%S)"
backup_of() { local f="$1" n=0 b; b="$f.bak.$STAMP.$SUFFIX.$n"; while [ -e "$b" ] || [ -L "$b" ]; do n=$((n+1)); b="$f.bak.$STAMP.$SUFFIX.$n"; done; echo "$b"; }
for f in "$KEY" "$ENVF" "$CRT"; do
  if [ -e "$f" ]; then
    b="$(backup_of "$f")"; mv "$f" "$b"; chmod 600 "$b"; BAK+=("$b"); ORIG+=("$f")
  fi
done
mv "$NEWKEY" "$KEY"; PLACED+=("$KEY")
mv "$NEWCRT" "$CRT"; PLACED+=("$CRT")
mv "$NEWENV" "$ENVF"; PLACED+=("$ENVF")

echo
echo "Made the key (mode 600, not shown), the certificate and $ENVF (mode 600). No secret was printed or logged."
echo "Upload $CRT in step 4."
if [ "${#BAK[@]}" -gt 0 ]; then
  echo "Backed up (mode 600, kept):"
  for b in "${BAK[@]}"; do echo "  $b"; done
fi
cat <<DONE
Next: restart the lab so it reads the file (docker compose up -d --build, or ./scripts/run.sh), then check that Real is available:
  curl -s http://127.0.0.1:7835/api/info    (realAvailable should be true; the header Real button is then enabled)
The page still opens in Mock. Real is one read-only look at your org, behind a confirm gate. Never commit .env or secrets/.
DONE
