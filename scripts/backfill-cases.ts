/**
 * Backfill one case per existing conversation (migration 015).
 *
 * Deliberately NOT a .sql file under migrations/: `npm run migrate` would then
 * run it automatically as part of a deploy. This touches every historical row
 * in a production database and should be a separate, deliberate step that
 * someone watches.
 *
 * Every backfilled case lands as status 'closed' with a NULL outcome — which
 * is both the honest state (we genuinely do not know how these finished) and
 * the prompt to go and ask. Those answers are the only real evidence available
 * about what actually happens to these patients, and they decide whether the
 * six values in cases_outcome_chk are the right six.
 *
 * Translator sessions are excluded: two people talking through the app is not
 * a case.
 *
 * Idempotent — only ever touches conversations with case_id IS NULL, so it is
 * safe to run again after new rows appear.
 *
 * Usage:
 *   npm run backfill-cases           # dry run, reports what it would do
 *   npm run backfill-cases -- --apply
 */

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.DATABASE_HOST,
  port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  ssl: { rejectUnauthorized: false },
  options: '--search_path=public',
});

const BACKFILL_SQL = `
WITH src AS (
  SELECT c.id              AS conversation_id,
         gen_random_uuid() AS case_id,
         c.user_id,
         c.partner_id,
         c.partner_user_ref,
         u.ship_name,
         u.call_sign,
         c.created_at,
         c.last_message_at
    FROM conversations c
    LEFT JOIN users u ON u.id = c.user_id
   WHERE c.case_id IS NULL
     AND c.mode IN ('marina', 'note_taker')
),
ins AS (
  INSERT INTO cases (
    id, user_id, partner_id, partner_user_ref,
    ship_name, call_sign, status,
    opened_at, closed_at, created_at
  )
  SELECT case_id, user_id, partner_id, partner_user_ref,
         ship_name, call_sign, 'closed',
         created_at, last_message_at, created_at
    FROM src
)
UPDATE conversations
   SET case_id       = src.case_id,
       encounter_seq = 1
  FROM src
 WHERE conversations.id = src.conversation_id
`;

async function main() {
  const apply = process.argv.includes('--apply');
  const client = await pool.connect();

  try {
    const { rows: pending } = await client.query<{
      mode: string;
      count: string;
    }>(
      `SELECT mode, COUNT(*)::text AS count
         FROM conversations
        WHERE case_id IS NULL
        GROUP BY mode
        ORDER BY mode`,
    );

    if (pending.length === 0) {
      console.log('[backfill-cases] nothing to do — every conversation has a case');
      return;
    }

    console.log('[backfill-cases] conversations with no case:');
    for (const row of pending) {
      const skipped = row.mode === 'translator' ? '  (skipped — not a case)' : '';
      console.log(`  ${row.mode.padEnd(12)} ${row.count.padStart(6)}${skipped}`);
    }

    const willCreate = pending
      .filter((r) => r.mode !== 'translator')
      .reduce((sum, r) => sum + parseInt(r.count, 10), 0);

    if (!apply) {
      console.log(
        `\n[backfill-cases] DRY RUN — would create ${willCreate} case(s).\n` +
          '[backfill-cases] re-run with --apply to write.',
      );
      return;
    }

    await client.query('BEGIN');
    try {
      const result = await client.query(BACKFILL_SQL);
      await client.query('COMMIT');
      console.log(`\n[backfill-cases] ✓ linked ${result.rowCount} conversation(s) to new cases`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }

    const { rows: check } = await client.query<{ orphans: string }>(
      `SELECT COUNT(*)::text AS orphans
         FROM conversations
        WHERE case_id IS NULL
          AND mode IN ('marina', 'note_taker')`,
    );
    console.log(`[backfill-cases] remaining unlinked (should be 0): ${check[0].orphans}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[backfill-cases] fatal:', err.message);
  process.exit(1);
});
