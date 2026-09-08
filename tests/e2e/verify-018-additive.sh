#!/bin/bash
#
# Prove the fleet migrations (018–025) are additive, rather than asserting it.
#
# Builds a database at the exact schema production is on today (000–017), fills
# every table 018 could conceivably touch with rows, and fingerprints the lot:
# table list, every column's name/type/nullability/default, every constraint,
# every index, and an MD5 of the actual row contents. Then applies 018 and
# fingerprints again.
#
# Any difference in the "before" objects is a failure. New objects are expected
# and are listed separately so you can see exactly what appeared.
#
# This is the same method used to clear 015 and 016 for production, generalised
# so it can be re-run.
#
#   ./tests/e2e/verify-018-additive.sh
#
# Local only: creates and drops a throwaway database, and never reads .env.

set -e
cd "$(dirname "$0")/../.."
DB="verify_018_additive"

command -v psql >/dev/null || { echo "psql not found"; exit 1; }
pg_isready -q || { echo "local postgres is not running"; exit 1; }

dropdb --if-exists "$DB" >/dev/null 2>&1; createdb "$DB"
trap 'dropdb --if-exists "$DB" >/dev/null 2>&1' EXIT

echo "building the schema before the fleet migrations (000-017)..."
for f in migrations/*.sql; do
  case "$f" in *018_*|*019_*|*020_*|*021_*|*022_*|*023_*|*024_*|*025_*) continue;; esac
  psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f" >/dev/null
done

# Rows in every table 018 mentions or joins to. If 018 could damage data, this
# is the data it would damage.
echo "seeding representative rows..."
psql -v ON_ERROR_STOP=1 -q -d "$DB" <<'SQL' >/dev/null
INSERT INTO partners (id, name, slug) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Acme Shipping', 'acme');
INSERT INTO vessels (id, org_id, name, call_sign) VALUES
  ('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'MV Acme', 'ACME1');
INSERT INTO users (id, email, password, role, is_active, company, ship_name, org_id, vessel_id) VALUES
  ('cccccccc-0000-4000-8000-000000000001', 'a@acme.test', 'x', 'user', TRUE,
   'Acme Shipping', 'MV Acme', 'aaaaaaaa-0000-4000-8000-000000000001',
   'bbbbbbbb-0000-4000-8000-000000000001'),
  ('cccccccc-0000-4000-8000-000000000002', 'b@acme.test', 'x', 'user', TRUE,
   NULL, NULL, NULL, NULL);
INSERT INTO cases (id, user_id, ship_name, status) VALUES
  ('dddddddd-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'MV Acme', 'recording');
INSERT INTO conversations (id, user_id, chief_symptom, messages, extracted_summary,
                           patient_language, medical_officer_language, mode) VALUES
  ('eeeeeeee-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
   'Headache', '[{"role":"user","content":"x"}]'::jsonb, '{"redFlag":"yes"}'::jsonb,
   'en', 'en', 'note_taker'),
  ('eeeeeeee-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000002',
   '[silence]', '[]'::jsonb, NULL, 'da', 'da', 'marina');
SQL

# ---------------------------------------------------------------------------
# The fingerprint. Structure and contents, ordered deterministically.
# ---------------------------------------------------------------------------
# The columns each table had BEFORE the migrations, captured once. Row contents
# are hashed over exactly these, so a migration that ADDS a column does not read
# as having changed every row: to_jsonb(t) gains a key, t::text gains a field,
# and the hash moves even though no stored value did.
#
# That distinction is the whole point of this script. 025 adds
# conversations.report_score and must be provably harmless to the 1,028 rows
# already there.
snapshot_columns() {
  for t in partners vessels users cases case_events conversations case_referrals case_decisions; do
    cols=$(psql -t -A -d "$DB" -c "
      SELECT string_agg(quote_ident(column_name), ',' ORDER BY column_name)
        FROM information_schema.columns
       WHERE table_schema='public' AND table_name='$t'")
    echo "$t|$cols"
  done
}

fingerprint() {
  psql -t -A -d "$DB" <<'SQL'
SELECT 'TABLE ' || table_name FROM information_schema.tables
 WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name;
SELECT 'COLUMN ' || table_name || '.' || column_name || ' ' || data_type || ' ' ||
       is_nullable || ' ' || coalesce(column_default,'-')
  FROM information_schema.columns WHERE table_schema='public'
 ORDER BY table_name, column_name;
SELECT 'CONSTRAINT ' || conrelid::regclass || ' ' || conname || ' ' || pg_get_constraintdef(oid)
  FROM pg_constraint WHERE connamespace='public'::regnamespace
 ORDER BY conrelid::regclass::text, conname;
SELECT 'INDEX ' || indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY indexname;
SQL
  # Row contents, hashed over the pre-migration columns only.
  while IFS='|' read -r t cols; do
    [ -n "$cols" ] || continue
    n=$(psql -t -A -d "$DB" -c "SELECT count(*) FROM $t" 2>/dev/null || echo NA)
    h=$(psql -t -A -d "$DB" -c "
      SELECT coalesce(md5(string_agg(r::text, '|' ORDER BY r::text)), 'empty')
        FROM (SELECT ROW($cols) AS r FROM $t) x" 2>/dev/null || echo NA)
    echo "ROWS $t $n $h"
  done < /tmp/018_columns.txt
}

snapshot_columns > /tmp/018_columns.txt

fingerprint > /tmp/018_before.txt
echo "  fingerprint: $(wc -l < /tmp/018_before.txt | tr -d ' ') facts recorded"

echo "applying 018 through 025..."
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f migrations/018_fleet_activity.sql >/dev/null
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f migrations/019_fleet_activity_explicit_vessel.sql >/dev/null
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f migrations/020_fleet_activity_operational.sql >/dev/null
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f migrations/021_fleet_activity_urgency.sql >/dev/null
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f migrations/022_fleet_activity_demographics.sql >/dev/null
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f migrations/023_fleet_activity_patient_key.sql >/dev/null
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f migrations/024_fleet_activity_completeness.sql >/dev/null
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f migrations/025_report_score.sql >/dev/null

fingerprint > /tmp/018_after.txt

# ---------------------------------------------------------------------------
# Anything REMOVED or CHANGED is a failure. Anything ADDED is the migration.
# ---------------------------------------------------------------------------
# comm requires sorted input. Without this the comparison is meaningless, and
# it only ever passed because the two files happened to be byte-identical.
sort -o /tmp/018_before.txt /tmp/018_before.txt
sort -o /tmp/018_after.txt  /tmp/018_after.txt
removed=$(comm -23 /tmp/018_before.txt /tmp/018_after.txt)
added=$(comm -13 /tmp/018_before.txt /tmp/018_after.txt)

echo
if [ -n "$removed" ]; then
  echo "FAIL — the fleet migrations changed or removed pre-existing schema/data:"
  printf '%s\n' "$removed" | sed 's/^/    - /'
  exit 1
fi

echo "PASS — nothing pre-existing was changed or removed."
echo
echo "What they added:"
printf '%s\n' "$added" | grep -E '^(TABLE|INDEX|CONSTRAINT)' | sed 's/^/    + /'
echo
echo "Row counts and content hashes, before -> after:"
paste <(grep '^ROWS' /tmp/018_before.txt) <(grep '^ROWS' /tmp/018_after.txt) \
  | awk '{printf "    %-16s %s rows  %s\n", $2, $3, ($4==$8 ? "identical" : "CHANGED")}'
