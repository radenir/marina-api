/**
 * Rotate a partner API key. Issues a NEW key alongside the old one,
 * inheriting the old key's partner, scopes, allowed_ips, and name.
 * The old key remains valid for `--overlap-days` (default 14) and then
 * automatically expires — partner can switch over at their leisure.
 *
 * Usage:
 *   tsx scripts/rotate-partner-key.ts --id <api-client-uuid> [--overlap-days 14]
 */

import 'dotenv/config';
import { Pool } from 'pg';
import { randomBytes, createHash } from 'crypto';

const KEY_PREFIX = 'mk_live_';

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

interface ExistingKey {
  partner_id: string;
  name: string;
  scopes: string[];
  allowed_ips: string[] | null;
}

async function main() {
  const args = parseArgs();
  const id = args['id'];
  if (!id) {
    console.error('error: --id <api-client-uuid> is required');
    process.exit(1);
  }
  const overlapDays = args['overlap-days'] ? parseInt(args['overlap-days'], 10) : 14;
  if (!Number.isFinite(overlapDays) || overlapDays < 0) {
    console.error('error: --overlap-days must be a non-negative integer');
    process.exit(1);
  }

  const plaintext = `${KEY_PREFIX}${randomBytes(32).toString('hex')}`;
  const keyHash = createHash('sha256').update(plaintext).digest('hex');
  const keyPrefixStored = plaintext.slice(0, 16);

  const pool = new Pool({
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    ssl: { rejectUnauthorized: false },
    options: '--search_path=public',
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const oldResult = await client.query<ExistingKey>(
      `SELECT partner_id, name, scopes, allowed_ips
         FROM partner_api_clients
        WHERE id = $1 AND revoked_at IS NULL`,
      [id],
    );
    if (oldResult.rows.length === 0) {
      console.error('error: no active key with that id');
      process.exit(1);
    }
    const old = oldResult.rows[0];

    const newResult = await client.query<{ id: string }>(
      `INSERT INTO partner_api_clients
         (partner_id, name, key_hash, key_prefix, scopes, allowed_ips)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        old.partner_id,
        `${old.name}-rotated`,
        keyHash,
        keyPrefixStored,
        old.scopes,
        old.allowed_ips,
      ],
    );

    const overlapExpiry = new Date(Date.now() + overlapDays * 24 * 60 * 60 * 1000);
    await client.query(
      `UPDATE partner_api_clients SET expires_at = $1 WHERE id = $2`,
      [overlapExpiry, id],
    );

    await client.query('COMMIT');

    console.log('\n=========================================================================');
    console.log('  PARTNER API KEY ROTATED');
    console.log('=========================================================================');
    console.log(`  Old key id:       ${id}  (expires ${overlapExpiry.toISOString()})`);
    console.log(`  New key id:       ${newResult.rows[0].id}`);
    console.log('-------------------------------------------------------------------------');
    console.log(`  NEW KEY:          ${plaintext}`);
    console.log('=========================================================================');
    console.log(`  Hand the new key to the partner. The old key remains valid for`);
    console.log(`  ${overlapDays} days to allow a clean cutover.`);
    console.log('=========================================================================\n');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
