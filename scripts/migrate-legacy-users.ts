/**
 * Port the legacy user base into marina-api's `users` table.
 *
 *   Usage:
 *     npm run migrate-legacy-users -- --dry-run
 *     npm run migrate-legacy-users
 *
 * Flags:
 *     --dry-run             Don't write to the destination; print what would be inserted.
 *     --batch-size N        Page size when SELECTing from the source (default 500).
 *     --legacy-env <path>   Path to the legacy app's .env (default:
 *                           ../production-marina/my-second-elevenlabs-ap/.env
 *                           relative to marina-api's project root).
 *
 * Connections:
 *   - Destination = marina-api's own DATABASE_* env vars (from marina-api/.env).
 *   - Source      = DATABASE_* keys read from the legacy app's own .env.
 *                   We parse that file with dotenv.parse so it never pollutes
 *                   process.env (which already has marina-api's destination creds).
 *
 * Source DB is treated as STRICTLY READ-ONLY: we open a `BEGIN READ ONLY`
 * transaction immediately after connecting and run every SELECT inside it.
 * The script never INSERTs/UPDATEs/DELETEs/DDLs the source.
 *
 * Idempotent: re-running is safe — `ON CONFLICT (email) DO NOTHING` skips users
 * already present in marina-api.
 *
 * What gets carried:
 *   email, bcrypt password hash, name (first+last concatenated),
 *   ship_name, imo_number, company, created_at, updated_at, legacy id (UUID).
 * Other legacy columns (date_of_birth, gender, nationality, call_sign,
 * satellite_phone, position_title, mmsi_number, flag_state, last_login_at)
 * are intentionally dropped — marina-api doesn't read them today.
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import dotenv from 'dotenv';
import { Client } from 'pg';
import { pool } from '../src/lib/db';

interface LegacyUser {
  id: string;
  email: string;
  password_hash: string;
  first_name: string | null;
  last_name: string | null;
  ship_name: string | null;
  imo_number: string | null;
  company: string | null;
  created_at: Date | null;
  updated_at: Date | null;
}

interface Args {
  dryRun: boolean;
  batchSize: number;
  legacyEnvPath: string;
}

function parseArgs(argv: string[]): Args {
  const dryRun = argv.includes('--dry-run');

  const bi = argv.indexOf('--batch-size');
  const batchSize = bi >= 0 ? parseInt(argv[bi + 1] ?? '', 10) : 500;
  if (Number.isNaN(batchSize) || batchSize <= 0) {
    throw new Error(`Invalid --batch-size: ${argv[bi + 1]}`);
  }

  const li = argv.indexOf('--legacy-env');
  const legacyEnvPath = li >= 0
    ? argv[li + 1] ?? ''
    : resolve(__dirname, '..', '..', 'production-marina', 'my-second-elevenlabs-ap', '.env');
  if (!legacyEnvPath) {
    throw new Error('--legacy-env requires a path argument');
  }

  return { dryRun, batchSize, legacyEnvPath };
}

interface DbCreds {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

function loadLegacyDbCreds(envPath: string): DbCreds {
  let raw: string;
  try {
    raw = readFileSync(envPath, 'utf8');
  } catch (err) {
    throw new Error(
      `Could not read legacy .env at ${envPath}: ${(err as Error).message}\n` +
        '  Pass --legacy-env <path> if the legacy project is elsewhere.'
    );
  }

  // Parse into an isolated object so we don't pollute process.env
  // (which already holds marina-api's DESTINATION credentials).
  const parsed = dotenv.parse(raw);

  const required = ['DATABASE_HOST', 'DATABASE_PORT', 'DATABASE_USER', 'DATABASE_PASSWORD', 'DATABASE_NAME'];
  const missing = required.filter((k) => !parsed[k]);
  if (missing.length > 0) {
    throw new Error(
      `Legacy .env at ${envPath} is missing required keys: ${missing.join(', ')}`
    );
  }

  const port = parseInt(parsed.DATABASE_PORT, 10);
  if (Number.isNaN(port)) {
    throw new Error(`Legacy DATABASE_PORT is not a number: ${parsed.DATABASE_PORT}`);
  }

  return {
    host: parsed.DATABASE_HOST,
    port,
    user: parsed.DATABASE_USER,
    password: parsed.DATABASE_PASSWORD,
    database: parsed.DATABASE_NAME,
  };
}

async function main(): Promise<void> {
  const { dryRun, batchSize, legacyEnvPath } = parseArgs(process.argv.slice(2));

  const source_creds = loadLegacyDbCreds(legacyEnvPath);

  console.log(
    `[migrate-users] dry-run=${dryRun} batch-size=${batchSize}\n` +
      `[migrate-users] source  = ${source_creds.user}@${source_creds.host}:${source_creds.port}/${source_creds.database}\n` +
      `[migrate-users] dest    = ${process.env.DATABASE_USER}@${process.env.DATABASE_HOST}:${process.env.DATABASE_PORT}/${process.env.DATABASE_NAME}`
  );

  if (
    source_creds.host === process.env.DATABASE_HOST &&
    source_creds.database === process.env.DATABASE_NAME
  ) {
    throw new Error(
      'Refusing to run: source and destination point at the same host+database. ' +
        'Check that marina-api/.env and the legacy .env are not the same DB.'
    );
  }

  const source = new Client({
    host: source_creds.host,
    port: source_creds.port,
    user: source_creds.user,
    password: source_creds.password,
    database: source_creds.database,
    ssl: { rejectUnauthorized: false },
  });

  await source.connect();
  // Belt-and-braces read-only enforcement on the source connection.
  // No INSERT/UPDATE/DELETE/DDL can be issued against the legacy DB.
  await source.query('BEGIN READ ONLY');

  let seen = 0;
  let inserted = 0;
  let skipped = 0;
  let errored = 0;
  let offset = 0;

  try {
    while (true) {
      const { rows } = await source.query<LegacyUser>(
        `SELECT id, email, password_hash,
                first_name, last_name,
                ship_name, imo_number, company,
                created_at, updated_at
         FROM users
         ORDER BY created_at NULLS FIRST, id
         LIMIT $1 OFFSET $2`,
        [batchSize, offset]
      );

      if (rows.length === 0) break;

      for (const row of rows) {
        seen++;
        const email = row.email.toLowerCase();
        const name = [row.first_name, row.last_name]
          .filter((s): s is string => Boolean(s && s.trim()))
          .join(' ')
          .trim() || null;

        if (dryRun) {
          console.log(`[dry-run] would insert ${email} (id=${row.id})`);
          continue;
        }

        try {
          const result = await pool.query(
            `INSERT INTO users (
               id, email, password, password_hash_algo,
               name, role, is_active, email_verified,
               ship_name, imo_number, company,
               created_at, updated_at
             ) VALUES (
               $1, $2, $3, 'bcrypt',
               $4, 'user', TRUE, TRUE,
               $5, $6, $7,
               COALESCE($8, NOW()), COALESCE($9, NOW())
             )
             ON CONFLICT (email) DO NOTHING`,
            [
              row.id,
              email,
              row.password_hash,
              name,
              row.ship_name,
              row.imo_number,
              row.company,
              row.created_at,
              row.updated_at,
            ]
          );

          if (result.rowCount && result.rowCount > 0) {
            inserted++;
          } else {
            skipped++;
          }
        } catch (err) {
          errored++;
          console.error(
            `[error] ${email}: ${(err as Error).message}`
          );
        }
      }

      offset += rows.length;
    }

    await source.query('COMMIT'); // no-op for a READ ONLY tx
  } finally {
    await source.end();
    await pool.end();
  }

  console.log(
    `[migrate-users] done — seen=${seen} inserted=${inserted} skipped=${skipped} errored=${errored}`
  );
  if (errored > 0) process.exit(1);
}

main().catch((err) => {
  console.error('[migrate-users] fatal:', (err as Error).message);
  process.exit(1);
});
