#!/bin/bash
#
# Exercise provision-management-account.ts's WRITE path — and, more importantly,
# prove the password never appears on screen.
#
# The script hides typing by muting process.stdout while readline echoes. If
# that hack failed, the password would be printed into the terminal's
# scrollback, which is exactly the outcome the script exists to prevent. That
# is not something to take on trust, so this drives it through a real pty and
# greps the captured output for the password.
#
# Checks:
#   1. the password never appears in the terminal output
#   2. the account is created with the right role/org/flags
#   3. the stored hash is argon2id and verifies against the typed password
#   4. running it twice refuses rather than resetting the password
#
# Local only: creates and drops its own database, never reads .env.
#
#   ./tests/e2e/verify-provision-management.sh

set -e
cd "$(dirname "$0")/../.."
DB="verify_provision"
PW="correct-horse-battery-staple-42"
OUT="/tmp/provision_pty_output.txt"

command -v psql >/dev/null || { echo "psql not found"; exit 1; }
pg_isready -q || { echo "local postgres is not running"; exit 1; }

dropdb --if-exists "$DB" >/dev/null 2>&1; createdb "$DB"
trap 'dropdb --if-exists "$DB" >/dev/null 2>&1' EXIT

echo "building the schema and an organisation to attach to..."
for f in migrations/*.sql; do
  psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f" >/dev/null 2>&1 || echo "  MIGRATE FAIL $f"
done
psql -v ON_ERROR_STOP=1 -q -d "$DB" \
  -c "INSERT INTO partners (name, slug, kind) VALUES ('Esvagt A/S','esvagt','owner');" >/dev/null

fail=0
say() { printf '  %-5s %s\n' "$1" "$2"; [ "$1" = "FAIL" ] && fail=1; return 0; }

# `script` gives the child a real pty, which the script requires (it refuses to
# read a password off a pipe). Everything the terminal would have shown is
# captured to $OUT, password included if the muting fails.
echo "running it through a pty, typing the password twice..."
printf '%s\n%s\n' "$PW" "$PW" | script -q "$OUT" \
  env DATABASE_HOST=localhost DATABASE_PORT=5432 DATABASE_USER="$(whoami)" \
      DATABASE_PASSWORD=x DATABASE_NAME="$DB" DATABASE_SSL=disable \
      npx tsx scripts/provision-management-account.ts \
        --org esvagt --email fleet@esvagt.com --apply >/dev/null 2>&1 || true

echo
echo "1. did the password stay off the screen?"
if grep -qF "$PW" "$OUT"; then
  say FAIL "THE PASSWORD WAS ECHOED — it is in the terminal scrollback"
  grep -nF "$PW" "$OUT" | head -3 | sed 's/^/       /'
else
  say ok "password does not appear anywhere in the terminal output"
fi

echo
echo "2. was the account created correctly?"
row=$(psql -t -A -F'|' -d "$DB" -c "
  SELECT u.role, u.is_active, u.email_verified, p.slug, u.password_hash_algo
    FROM users u JOIN partners p ON p.id=u.org_id
   WHERE lower(u.email)='fleet@esvagt.com'")
[ "$row" = "management|t|t|esvagt|argon2id" ] \
  && say ok "role=management, active, verified, org=esvagt, argon2id" \
  || say FAIL "unexpected row: '$row'"

echo
echo "3. does the stored hash actually verify against the typed password?"
hash=$(psql -t -A -d "$DB" -c "SELECT password FROM users WHERE lower(email)='fleet@esvagt.com'")
if [ -z "$hash" ]; then
  say FAIL "no hash stored"
else
  ok=$(npx tsx -e "
    import argon2 from 'argon2';
    argon2.verify(process.argv[1], process.argv[2])
      .then(v => console.log(v ? 'yes' : 'no')).catch(() => console.log('error'));
  " "$hash" "$PW" 2>/dev/null | tail -1)
  [ "$ok" = "yes" ] \
    && say ok "the password you type is the password that logs in" \
    || say FAIL "hash does not verify (got '$ok')"
fi

echo
echo "4. does a second run refuse instead of resetting the password?"
second=$(printf '%s\n%s\n' "other-password-entirely" "other-password-entirely" | script -q /dev/null \
  env DATABASE_HOST=localhost DATABASE_PORT=5432 DATABASE_USER="$(whoami)" \
      DATABASE_PASSWORD=x DATABASE_NAME="$DB" DATABASE_SSL=disable \
      npx tsx scripts/provision-management-account.ts \
        --org esvagt --email fleet@esvagt.com --apply 2>&1 || true)
hash2=$(psql -t -A -d "$DB" -c "SELECT password FROM users WHERE lower(email)='fleet@esvagt.com'")
if printf '%s' "$second" | grep -q "already exists"; then
  [ "$hash" = "$hash2" ] \
    && say ok "refused, and the existing password hash is untouched" \
    || say FAIL "refused but the hash changed"
else
  say FAIL "second run did not refuse"
fi

count=$(psql -t -A -d "$DB" -c "SELECT COUNT(*) FROM users")
[ "$count" = "1" ] && say ok "exactly one user row exists" || say FAIL "$count user rows"

echo
rm -f "$OUT"
[ "$fail" = "0" ] && echo "PASS — creates the account, hides the password, refuses to overwrite." \
                  || { echo "FAILED"; exit 1; }
