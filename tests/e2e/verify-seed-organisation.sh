#!/bin/bash
#
# Exercise seed-organisation.ts's WRITE path against production-shaped data,
# on a throwaway local database, before it is ever pointed at production.
#
# The dry run only proves the read path. This builds a database at production's
# exact schema, inserts the 19 Esvagt accounts with the ship_name spellings
# production actually contains, runs the real script with --apply, and then
# checks three things:
#
#   1. every account landed on the vessel the dry run promised
#   2. nothing outside those 19 accounts was touched
#   3. the undo (DELETE FROM partners) really does restore the original state
#
# Local only: creates and drops its own database, and never reads .env.
#
#   ./tests/e2e/verify-seed-organisation.sh

set -e
cd "$(dirname "$0")/../.."
DB="verify_seed_org"

command -v psql >/dev/null || { echo "psql not found"; exit 1; }
pg_isready -q || { echo "local postgres is not running"; exit 1; }

dropdb --if-exists "$DB" >/dev/null 2>&1; createdb "$DB"
trap 'dropdb --if-exists "$DB" >/dev/null 2>&1' EXIT

echo "building production's schema (000-019)..."
for f in migrations/*.sql; do
  psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f" >/dev/null 2>&1 || echo "  MIGRATE FAIL $f"
done

# The 19 real accounts, with the ship_name exactly as production holds it —
# including the trailing space, the 'MV ' prefix, the 'Crapri' typo, the two
# who typed the company, and the one with no ship at all.
echo "inserting the 19 Esvagt accounts, spellings as production has them..."
psql -v ON_ERROR_STOP=1 -q -d "$DB" <<'SQL' >/dev/null
INSERT INTO users (email, password, role, is_active, company, ship_name) VALUES
 ('aurora@esvagtvessel.com','x','user',TRUE,'Esvagt A/S','Esvagt Aurora'),
 ('aurora.medic@esvagtvessel.com','x','user',TRUE,'Esvagt A/S','MV Esvagt Aurora'),
 ('capella@esvagtvessel.com','x','user',TRUE,'Esvagt','Esvagt Capella'),
 ('capella.medic@esvagtvessel.com','x','user',TRUE,'Esvagt','Esvagt Capella'),
 ('capri.medic@esvagtvessel.com','x','user',TRUE,'Esvagt','Esvagt Crapri'),
 ('christina@esvagtvessel.com','x','user',TRUE,'Esvagt A/S','Esvagt Christina'),
 ('christina.medic@esvagtvessel.com','x','user',TRUE,'Esvagt A/S','Esvagt Christina'),
 ('connector.medic@esvagtvessel.com','x','user',TRUE,'Esvagt A/S','Esvagt A/S'),
 ('dana@esvagtvessel.com','x','user',TRUE,'Esvagt ','Esvagt Dana '),
 ('dana.medic@esvagtvessel.com','x','user',TRUE,'Esvagt ','Esvagt Dana '),
 ('dee@esvagtvessel.com','x','user',TRUE,'Esvagt','Esvagt Dee'),
 ('dee.medic@esvagtvessel.com','x','user',TRUE,'Esvagt','Esvagt Dee'),
 ('havelok@esvagtvessel.com','x','user',TRUE,'Esvagt AS','Esvagt Havelok'),
 ('innovator@esvagtvessel.com','x','user',TRUE,'Esvagt A/S','Esvagt Innovator'),
 ('innovator.medic@esvagtvessel.com','x','user',TRUE,'Esvagt A/S','Esvagt Innovator'),
 ('leah@esvagtvessel.com','x','user',TRUE,'Esvagt A/S','Esvagt Leah'),
 ('leah.medic@esvagtvessel.com','x','user',TRUE,'Esvagt A/S','Esvagt Leah'),
 ('medic.havelok@esvagtvessel.com','x','user',TRUE,'Esvagt AS','Esvagt '),
 ('mercator@esvagtvessel.com','x','user',TRUE,NULL,NULL);

-- Bystanders that MUST NOT be touched: the personal-address accounts whose
-- company says Esvagt, and an unrelated user.
INSERT INTO users (email, password, role, is_active, company, ship_name) VALUES
 ('pkhbiesenbach@gmail.com','x','user',TRUE,'Esvagt','ESVAGT Dana'),
 ('jonsson.80@hotmail.com','x','user',TRUE,'Esvagt A/S','Esvagt Aurora'),
 ('mgl@esvagt.com','x','user',TRUE,'ESVAGT A/S','ESVAGT OFFICE'),
 ('someone@elsewhere.test','x','user',TRUE,'DFDS','King Seaways');
SQL

before=$(psql -t -A -d "$DB" -c "SELECT md5(string_agg(t::text,'|' ORDER BY t::text)) FROM users t")
echo "  fingerprint taken"

echo "running the real script with --apply..."
env -i PATH="$PATH" HOME="$HOME" \
  DATABASE_HOST=localhost DATABASE_PORT=5432 DATABASE_USER="$(whoami)" \
  DATABASE_PASSWORD=x DATABASE_NAME="$DB" DATABASE_SSL=disable \
  npx tsx scripts/seed-organisation.ts --org esvagt --apply 2>&1 | tail -3

fail=0
say() { printf '  %-5s %s\n' "$1" "$2"; [ "$1" = "FAIL" ] && fail=1; return 0; }

echo
echo "1. did every account land on the right vessel?"
psql -t -A -F'|' -d "$DB" -c "
  SELECT u.email, COALESCE(v.name,'(none)')
    FROM users u LEFT JOIN vessels v ON v.id=u.vessel_id
   WHERE lower(split_part(u.email,'@',2))='esvagtvessel.com'
   ORDER BY u.email" > /tmp/seed_actual.txt

cat > /tmp/seed_expected.txt <<'EOF'
aurora@esvagtvessel.com|Esvagt Aurora
aurora.medic@esvagtvessel.com|Esvagt Aurora
capella@esvagtvessel.com|Esvagt Capella
capella.medic@esvagtvessel.com|Esvagt Capella
capri.medic@esvagtvessel.com|Esvagt Capri
christina@esvagtvessel.com|Esvagt Christina
christina.medic@esvagtvessel.com|Esvagt Christina
connector.medic@esvagtvessel.com|Esvagt Connector
dana@esvagtvessel.com|Esvagt Dana
dana.medic@esvagtvessel.com|Esvagt Dana
dee@esvagtvessel.com|Esvagt Dee
dee.medic@esvagtvessel.com|Esvagt Dee
havelok@esvagtvessel.com|Esvagt Havelok
innovator@esvagtvessel.com|Esvagt Innovator
innovator.medic@esvagtvessel.com|Esvagt Innovator
leah@esvagtvessel.com|Esvagt Leah
leah.medic@esvagtvessel.com|Esvagt Leah
medic.havelok@esvagtvessel.com|Esvagt Havelok
mercator@esvagtvessel.com|Esvagt Mercator
EOF
sort -o /tmp/seed_actual.txt /tmp/seed_actual.txt
sort -o /tmp/seed_expected.txt /tmp/seed_expected.txt
if diff -q /tmp/seed_expected.txt /tmp/seed_actual.txt >/dev/null; then
  say ok "all 19 landed exactly as the dry run promised"
else
  say FAIL "vessel assignment differs from the plan:"
  diff /tmp/seed_expected.txt /tmp/seed_actual.txt | sed 's/^/       /'
fi

echo
echo "2. were the bystanders left alone?"
touched=$(psql -t -A -d "$DB" -c "
  SELECT COUNT(*) FROM users
   WHERE lower(split_part(email,'@',2)) <> 'esvagtvessel.com'
     AND (org_id IS NOT NULL OR vessel_id IS NOT NULL)")
[ "$touched" = "0" ] \
  && say ok "the 4 non-esvagtvessel accounts still have org_id and vessel_id NULL" \
  || say FAIL "$touched account(s) outside the fleet were modified"

roles=$(psql -t -A -d "$DB" -c "SELECT COUNT(*) FROM users WHERE role <> 'user'")
[ "$roles" = "0" ] && say ok "no role was changed" || say FAIL "$roles role(s) changed"

echo
echo "3. does the undo restore the original state?"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -c "DELETE FROM partners WHERE slug='esvagt';" >/dev/null
after=$(psql -t -A -d "$DB" -c "SELECT md5(string_agg(t::text,'|' ORDER BY t::text)) FROM users t")
[ "$before" = "$after" ] \
  && say ok "users table byte-identical to before the seed" \
  || say FAIL "undo did not restore users exactly"

left=$(psql -t -A -d "$DB" -c "SELECT (SELECT COUNT(*) FROM vessels)+(SELECT COUNT(*) FROM vessel_aliases)")
[ "$left" = "0" ] && say ok "vessels and aliases cascaded away" || say FAIL "$left row(s) left behind"

echo
[ "$fail" = "0" ] && echo "PASS — the write path does what the dry run says, and undoes cleanly." \
                  || { echo "FAILED"; exit 1; }
