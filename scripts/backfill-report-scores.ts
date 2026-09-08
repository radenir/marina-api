/**
 * Score the reports a fleet already has.
 *
 * From migration 025 onward every new report is scored automatically, seconds
 * after extraction. Reports written before that have no score, and the fleet
 * dashboard says so rather than guessing. This fills them in.
 *
 * It costs real money: eight judges per report, seven of them LLM calls. Scoped
 * to one organisation on purpose — 852 reports platform-wide is ~6,800 calls,
 * while Esvagt and DFDS together are 57 reports and ~400. Run it for the fleets
 * that are actually being shown a dashboard.
 *
 * Deliberately NOT a migration: `npm run migrate` would then spend money and an
 * hour of wall time as part of a deploy.
 *
 *   npm run backfill-scores -- --org esvagt              # dry run
 *   npm run backfill-scores -- --org esvagt --apply
 *   npm run backfill-scores -- --org esvagt --apply --limit 5
 *
 * Idempotent: only touches reports with no score, so it can be re-run after an
 * interruption and will pick up where it stopped.
 */

import 'dotenv/config';
import { Pool } from 'pg';
import { scoreReport } from '../src/lib/reportScore';

const pool = new Pool({
  host: process.env.DATABASE_HOST,
  port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  ssl: process.env.DATABASE_SSL === 'disable' ? false : { rejectUnauthorized: false },
  options: '--search_path=public',
});

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]?.trim() : undefined;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const orgSlug = arg('org');
  const limit = parseInt(arg('limit') ?? '500', 10);

  if (!orgSlug) {
    console.error('usage: --org <slug> [--apply] [--limit n]');
    process.exit(1);
  }

  const { rows: orgs } = await pool.query<{ id: string; name: string }>(
    `SELECT id, name FROM partners WHERE slug = $1`, [orgSlug],
  );
  if (!orgs.length) {
    console.error(`[scores] no organisation with slug "${orgSlug}"`);
    process.exit(1);
  }
  const org = orgs[0];

  const { rows: pending } = await pool.query<{ id: string; summary: Record<string, string> }>(
    `SELECT c.id, c.extracted_summary AS summary
       FROM conversations c
       JOIN users u ON u.id = c.user_id
      WHERE u.org_id = $1
        AND c.extracted_summary IS NOT NULL
        AND c.report_score IS NULL
      ORDER BY c.created_at
      LIMIT $2`,
    [org.id, limit],
  );

  const { rows: already } = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM conversations c JOIN users u ON u.id = c.user_id
      WHERE u.org_id = $1 AND c.report_score IS NOT NULL`, [org.id],
  );

  console.log(`\n[scores] ${org.name} (${orgSlug})`);
  console.log(`[scores] already scored: ${already[0].n}`);
  console.log(`[scores] to score now:   ${pending.length}`);
  console.log(`[scores] judge calls:    ~${pending.length * 7} (vital signs is local)`);

  if (!apply) {
    console.log(`\n[scores] DRY RUN — nothing scored, nothing written.`);
    console.log(`[scores] re-run with --apply.`);
    return;
  }
  if (!pending.length) return;

  let done = 0, failed = 0, unknowns = 0;
  const started = Date.now();

  // One at a time. Seven judges already run in parallel per report, and firing
  // fifty reports at once would be a burst the scoring model answers by
  // timing out — which under the unknown-never-zero rule produces a report
  // full of unknowns rather than a fast result.
  for (const row of pending) {
    try {
      const score = await scoreReport(row.summary);
      await pool.query(
        `UPDATE conversations SET report_score = $2::jsonb WHERE id = $1`,
        [row.id, JSON.stringify(score)],
      );
      done++;
      unknowns += score.unknown.length;
      const mins = ((Date.now() - started) / 60000).toFixed(1);
      process.stdout.write(
        `\r[scores] ${done}/${pending.length}  clinical=${String(score.clinical ?? '-').padStart(3)}` +
          `  unknown=${score.unknown.length}  ${mins}m elapsed   `,
      );
    } catch (err) {
      failed++;
      console.log(`\n[scores] FAILED ${row.id}: ${(err as Error).message}`);
    }
  }

  console.log(`\n\n[scores] scored ${done}, failed ${failed}`);
  if (unknowns) {
    console.log(
      `[scores] ${unknowns} section(s) left unknown across the batch — a judge that ` +
        `could not be reached is never recorded as zero. Re-run to retry those reports.`,
    );
  }

  const { rows: after } = await pool.query<{ avg: string; n: string }>(
    `SELECT ROUND(AVG((c.report_score->>'clinical')::int))::text AS avg, COUNT(*)::text AS n
       FROM conversations c JOIN users u ON u.id = c.user_id
      WHERE u.org_id = $1 AND c.report_score->>'clinical' IS NOT NULL`, [org.id],
  );
  console.log(`[scores] ${org.name} clinical average: ${after[0].avg ?? '-'} across ${after[0].n} reports`);
}

main()
  .catch((err) => { console.error('[scores] fatal:', (err as Error).message); process.exitCode = 1; })
  .finally(() => pool.end());
