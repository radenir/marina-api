/**
 * Revoke a partner API key. Once revoked, the key can no longer authenticate
 * (the authenticate middleware filters on `revoked_at IS NULL`).
 *
 * Usage:
 *   tsx scripts/revoke-partner-key.ts --id <api-client-uuid>
 *   tsx scripts/revoke-partner-key.ts --key-prefix mk_live_abcd1234
 */

import 'dotenv/config';
import { Pool } from 'pg';

function parseArgs(): Record<string, string> {
  const out: Record<string, string> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const val = argv[i + 1];
    if (!val || val.startsWith('--')) {
      console.error(`error: missing value for --${key}`);
      process.exit(1);
    }
    out[key] = val;
    i++;
  }
  return out;
}

async function main() {
  const args = parseArgs();
  const id = args['id'];
  const keyPrefix = args['key-prefix'];

  if (!id && !keyPrefix) {
    console.error('error: provide --id <uuid> or --key-prefix <prefix>');
    process.exit(1);
  }

  const pool = new Pool({
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    ssl: { rejectUnauthorized: false },
    options: '--search_path=public',
  });

  try {
    const result = await pool.query<{ id: string; key_prefix: string; partner_id: string }>(
      `UPDATE partner_api_clients
          SET revoked_at = NOW()
        WHERE revoked_at IS NULL
          AND ($1::uuid IS NULL OR id = $1::uuid)
          AND ($2::text IS NULL OR key_prefix = $2::text)
        RETURNING id, key_prefix, partner_id`,
      [id ?? null, keyPrefix ?? null],
    );

    if (result.rows.length === 0) {
      console.error('error: no matching active key found');
      process.exit(1);
    }
    if (result.rows.length > 1) {
      console.warn(`warning: revoked ${result.rows.length} keys (selector was ambiguous)`);
    }

    for (const row of result.rows) {
      console.log(`revoked  id=${row.id}  prefix=${row.key_prefix}  partner=${row.partner_id}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
