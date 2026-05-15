/**
 * Provision a new partner API key.
 *
 * Usage:
 *   tsx scripts/provision-partner-key.ts \
 *     --partner-slug mmg \
 *     --partner-name "MMG Healthcare" \
 *     --name production \
 *     --scopes transcribe:write,extract:write \
 *     --allowed-ips 203.0.113.42,198.51.100.0/24 \
 *     [--expires-days 365]
 *
 * Prints the plaintext key ONCE to stdout. Save it before closing the shell —
 * it is not stored and cannot be recovered. Only the sha256 hash is persisted.
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
      fatal(`Missing value for --${key}`);
    }
    out[key] = val;
    i++;
  }
  return out;
}

function fatal(msg: string): never {
  console.error(`error: ${msg}`);
  process.exit(1);
}

function required(args: Record<string, string>, key: string): string {
  const v = args[key];
  if (!v) fatal(`Missing required flag --${key}`);
  return v;
}

async function main() {
  const args = parseArgs();
  const partnerSlug = required(args, 'partner-slug');
  const partnerName = required(args, 'partner-name');
  const keyName = required(args, 'name');
  const scopes = required(args, 'scopes').split(',').map(s => s.trim()).filter(Boolean);
  const allowedIpsRaw = args['allowed-ips'];
  const allowedIps = allowedIpsRaw
    ? allowedIpsRaw.split(',').map(s => s.trim()).filter(Boolean)
    : null;
  const expiresDays = args['expires-days'] ? parseInt(args['expires-days'], 10) : null;

  if (scopes.length === 0) fatal('--scopes must be a non-empty comma-separated list');
  if (expiresDays !== null && (!Number.isFinite(expiresDays) || expiresDays <= 0)) {
    fatal('--expires-days must be a positive integer');
  }
  if (!allowedIps) {
    console.warn('WARNING: no --allowed-ips set. The key will accept calls from any IP.');
    console.warn('         In production, every partner key SHOULD be IP-locked.');
  }

  const plaintext = `${KEY_PREFIX}${randomBytes(32).toString('hex')}`;
  const keyHash = createHash('sha256').update(plaintext).digest('hex');
  const keyPrefixStored = plaintext.slice(0, 16); // mk_live_ + 8 hex chars

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

    const partnerResult = await client.query<{ id: string }>(
      `INSERT INTO partners (slug, name)
       VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [partnerSlug, partnerName],
    );
    const partnerId = partnerResult.rows[0].id;

    const expiresAt = expiresDays
      ? new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000)
      : null;

    const apiClientResult = await client.query<{ id: string }>(
      `INSERT INTO partner_api_clients
         (partner_id, name, key_hash, key_prefix, scopes, allowed_ips, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        partnerId,
        keyName,
        keyHash,
        keyPrefixStored,
        scopes,
        allowedIps,
        expiresAt,
      ],
    );
    const apiClientId = apiClientResult.rows[0].id;

    await client.query('COMMIT');

    console.log('\n=========================================================================');
    console.log('  PARTNER API KEY — store this NOW, it will not be shown again');
    console.log('=========================================================================');
    console.log(`  Partner:        ${partnerName}  (${partnerSlug})`);
    console.log(`  Key name:       ${keyName}`);
    console.log(`  Key id:         ${apiClientId}`);
    console.log(`  Scopes:         ${scopes.join(', ')}`);
    console.log(`  Allowed IPs:    ${allowedIps?.join(', ') ?? 'ANY  (development only)'}`);
    console.log(`  Expires:        ${expiresAt ? expiresAt.toISOString() : 'never'}`);
    console.log('-------------------------------------------------------------------------');
    console.log(`  KEY:            ${plaintext}`);
    console.log('=========================================================================');
    console.log('  Usage:');
    console.log('    curl -H "Authorization: Bearer <KEY>" \\');
    console.log('         -H "X-Partner-User-Ref: <your-internal-user-id>" \\');
    console.log('         https://api.marinahealth.eu/ai/extract');
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
