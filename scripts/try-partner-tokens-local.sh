#!/bin/bash
#
# Try short-lived partner tokens on this laptop, against a LOCAL database.
#
#   bash scripts/try-partner-tokens-local.sh setup   # fresh local DB + a test API key (printed once)
#   bash scripts/try-partner-tokens-local.sh serve   # API on http://localhost:4100 (Ctrl+C to stop)
#
# marina-api/.env points at the production OVH database and Redis. dotenv never
# overrides a variable that is already set, so every DATABASE_* and REDIS_URL is
# set explicitly here; the remaining .env values (AI provider keys) are still
# used, so transcription and extraction call the real providers.

set -e
cd "$(dirname "$0")/.."
DB=marina_partner_try
PORT=4100

case "$1" in
  setup)
    pg_isready -q || { echo "local postgres is not running"; exit 1; }
    dropdb --if-exists "$DB" >/dev/null 2>&1; createdb "$DB"
    for f in migrations/*.sql; do
      psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f" >/dev/null 2>&1 || echo "  migrate failed: $f"
    done
    KEY="mk_live_$(openssl rand -hex 32)"
    HASH=$(printf '%s' "$KEY" | shasum -a 256 | cut -d' ' -f1)
    psql -q -d "$DB" -v ON_ERROR_STOP=1 >/dev/null <<SQL
INSERT INTO partners (name, slug) VALUES ('Local Test Partner', 'local-test');
INSERT INTO partner_api_clients (partner_id, name, key_hash, key_prefix, scopes)
SELECT id, 'local', '$HASH', '${KEY:0:16}',
       ARRAY['transcribe:write','extract:write','pdf:write','pdf:email']
  FROM partners WHERE slug = 'local-test';
SQL
    echo "Local database '$DB' ready. Test API key (shown once):"
    echo
    echo "  $KEY"
    echo
    echo "Next: bash scripts/try-partner-tokens-local.sh serve"
    ;;
  serve)
    [ -f /tmp/marina-partner-try.secret ] || openssl rand -hex 32 > /tmp/marina-partner-try.secret
    PORT=$PORT \
    DATABASE_HOST=localhost DATABASE_PORT=5432 DATABASE_USER="$(whoami)" \
    DATABASE_PASSWORD=x DATABASE_NAME="$DB" \
    REDIS_URL=redis://localhost:6379 \
    PARTNER_TOKEN_SECRET="$(cat /tmp/marina-partner-try.secret)" \
    NODE_ENV=development \
      npx tsx src/index.ts
    ;;
  *)
    echo "usage: bash scripts/try-partner-tokens-local.sh setup|serve"; exit 1 ;;
esac
