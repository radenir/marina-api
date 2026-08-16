#!/bin/bash
#
# End-to-end suites for the Case File and Fleet Dashboard.
#
# Each suite boots the real Express app against a throwaway local Postgres and
# drives it over HTTP. Nothing here can reach production: every process is
# launched with `env -i`, so it cannot inherit DATABASE_* from your shell, and
# the scripts deliberately do not load dotenv — marina-api/.env points at OVH.
#
#   ./tests/e2e/run.sh            every suite
#   ./tests/e2e/run.sh fleet      one suite by name
#
# The `pre015` and `pre016` runs are the important ones. They execute the
# current code against OLDER schemas — the state production would be in if the
# code shipped ahead of a migration — and assert the existing endpoints behave
# identically. That is what "additive" means here, and it is checked rather
# than asserted.

set -e
cd "$(dirname "$0")/../.."
ROOT="$PWD"
RUN="/tmp/marina-e2e"
mkdir -p "$RUN"

command -v psql >/dev/null || { echo "psql not found"; exit 1; }
pg_isready -q || { echo "local postgres is not running"; exit 1; }

[ -f "$RUN/keys.json" ] || node -e "
const {generateKeyPairSync}=require('crypto');
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048,
  publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
require('fs').writeFileSync('$RUN/keys.json',JSON.stringify({privateKey,publicKey}));"
PRIV=$(node -e "process.stdout.write(require('$RUN/keys.json').privateKey.replace(/\n/g,'\\\\n'))")
PUB=$(node -e "process.stdout.write(require('$RUN/keys.json').publicKey.replace(/\n/g,'\\\\n'))")

fail=0

suite() {  # name  script  port  schema(full|pre015|pre016)
  local DB="e2e_$1" SCRIPT="$2" PORT="$3" UPTO="$4"
  dropdb --if-exists "$DB" >/dev/null 2>&1; createdb "$DB"
  for f in migrations/*.sql; do
    case "$UPTO" in
      pre015) case "$f" in *015_*|*016_*) continue;; esac ;;
      pre016) case "$f" in *016_*) continue;; esac ;;
    esac
    psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f" >/dev/null 2>&1 || echo "  MIGRATE FAIL $f"
  done
  local out rc
  set +e
  out=$(env -i PATH="$PATH" HOME="$HOME" PORT="$PORT" NODE_ENV=test \
    DATABASE_HOST=localhost DATABASE_PORT=5432 DATABASE_USER="$(whoami)" \
    DATABASE_PASSWORD=x DATABASE_NAME="$DB" REDIS_URL=redis://localhost:6379 \
    JWT_PRIVATE_KEY="$PRIV" JWT_PUBLIC_KEY="$PUB" \
    EMAIL_SECRET=aaa RESET_SECRET=bbb MAILJET_API_KEY=x MAILJET_SECRET_KEY=x \
    EMAIL_FROM=x@x.test NEBIUS_API_KEY=x WHISPER_API_KEY=x WHISPER_BASE_URL=http://x \
    npx tsx "$ROOT/tests/e2e/$SCRIPT" 2>&1)
  rc=$?
  set -e
  local verdict count
  verdict=$(printf '%s' "$out" | grep -oE 'ALL PASS|WATCHDOG|[0-9]+ FAILURE\(S\)' | tail -1)
  count=$(printf '%s' "$out" | grep -c '^  ok  ')
  printf '%-24s %-8s %-12s %s assertions\n' "$SCRIPT" "[$UPTO]" "${verdict:-NO OUTPUT}" "$count"
  if [ "$verdict" != "ALL PASS" ]; then
    fail=1
    # A suite that dies before printing anything is the confusing case —
    # show its tail rather than leaving a blank line.
    if [ -z "$verdict" ]; then
      echo "     suite exited $rc without a verdict:"
      printf '%s' "$out" | tail -6 | sed 's/^/       /'
    else
      printf '%s' "$out" | grep ' FAIL ' | sed 's/^/     /'
    fi
  fi
  dropdb --if-exists "$DB" >/dev/null 2>&1
}

only="${1:-}"
run() { [ -z "$only" ] || [ "$only" = "$1" ]; }

run cases    && suite c1 verify-cases.ts        4701 full
run phase2   && suite c2 phase2-e2e.ts          4702 full
run phase3   && suite c3 phase3-e2e.ts          4703 full
run fleet    && suite c4 fleet-e2e.ts           4704 full
run additive && suite c5 safety-no-migration.ts 4705 pre015
run additive && suite c6 phase2-e2e.ts          4706 pre016
run additive && suite c7 phase3-e2e.ts          4707 pre016

exit $fail
