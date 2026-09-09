/**
 * Turn a feature on or off for a fleet, or for one account.
 *
 *   npm run set-policy -- --org esvagt --show
 *   npm run set-policy -- --org esvagt --set pdf_download=false            # dry run
 *   npm run set-policy -- --org esvagt --set pdf_download=false --apply
 *   npm run set-policy -- --user chief@esvagtvessel.com --set pdf_download=true --apply
 *
 * Dry run by default, like every other script in here, and it prints the
 * accounts that will actually change rather than a count — the same per-account
 * plan seed-organisation.ts prints, for the same reason: a policy write is
 * invisible from the outside until an officer at sea cannot do something.
 *
 * MERGES, never replaces. The stored JSONB is updated key by key, so setting
 * pdf_download does not silently clear a flag someone set last month.
 */

import 'dotenv/config';
import { Pool } from 'pg';
import { POLICY_DEFAULTS, resolvePolicy, type PolicyKey } from '../src/lib/policy';

const pool = new Pool({
  host: process.env.DATABASE_HOST,
  port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  ssl: process.env.DATABASE_SSL === 'disable' ? false : { rejectUnauthorized: false },
  options: '--search_path=public',
});

const KEYS = Object.keys(POLICY_DEFAULTS) as PolicyKey[];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]?.trim() : undefined;
}

function parseSet(raw: string): { key: PolicyKey; value: boolean } {
  const [k, v] = raw.split('=').map((s) => s?.trim());
  if (!KEYS.includes(k as PolicyKey)) {
    throw new Error(`unknown policy key "${k}". known: ${KEYS.join(', ')}`);
  }
  if (v !== 'true' && v !== 'false') throw new Error(`value must be true or false, got "${v}"`);
  return { key: k as PolicyKey, value: v === 'true' };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const orgSlug = arg('org');
  const userEmail = arg('user');
  const set = arg('set');
  const show = process.argv.includes('--show');

  if (!orgSlug && !userEmail) {
    console.error('usage: --org <slug> | --user <email>   [--show | --set key=bool] [--apply]');
    console.error(`keys: ${KEYS.map((k) => `${k} (default ${POLICY_DEFAULTS[k]})`).join(', ')}`);
    process.exit(1);
  }

  // ---- locate the target -------------------------------------------------
  let orgId: string | null = null;
  let orgName = '';
  if (orgSlug) {
    const { rows } = await pool.query<{ id: string; name: string; policy: unknown }>(
      `SELECT id, name, policy FROM partners WHERE slug = $1`, [orgSlug],
    );
    if (!rows.length) { console.error(`[policy] no organisation with slug "${orgSlug}"`); process.exit(1); }
    orgId = rows[0].id; orgName = rows[0].name;
    console.log(`\n[policy] fleet: ${orgName} (${orgSlug})`);
    console.log(`[policy] stored fleet policy: ${JSON.stringify(rows[0].policy)}`);
  }

  let userId: string | null = null;
  if (userEmail) {
    const { rows } = await pool.query<{ id: string; email: string; policy: unknown; org: string | null }>(
      `SELECT u.id, u.email, u.policy, p.name AS org
         FROM users u LEFT JOIN partners p ON p.id = u.org_id
        WHERE lower(u.email) = lower($1)`, [userEmail],
    );
    if (!rows.length) { console.error(`[policy] no user with email "${userEmail}"`); process.exit(1); }
    userId = rows[0].id;
    console.log(`\n[policy] account: ${rows[0].email}  (fleet: ${rows[0].org ?? 'none'})`);
    console.log(`[policy] stored account override: ${JSON.stringify(rows[0].policy)}`);
  }

  // ---- who is affected, and what do they see today -----------------------
  const { rows: affected } = await pool.query<{
    email: string; is_active: boolean; user_policy: unknown; org_policy: unknown;
  }>(
    userId
      ? `SELECT u.email, u.is_active, u.policy AS user_policy, p.policy AS org_policy
           FROM users u LEFT JOIN partners p ON p.id = u.org_id WHERE u.id = $1`
      : `SELECT u.email, u.is_active, u.policy AS user_policy, p.policy AS org_policy
           FROM users u JOIN partners p ON p.id = u.org_id
          WHERE u.org_id = $1 ORDER BY u.email`,
    [userId ?? orgId],
  );

  console.log(`\n[policy] ${affected.length} account(s) in scope\n`);
  const width = Math.max(20, ...affected.map((a) => a.email.length));
  console.log(`  ${'account'.padEnd(width)}  active  ${KEYS.join('  ')}`);
  for (const a of affected) {
    const eff = resolvePolicy(a.org_policy, a.user_policy);
    const flags = KEYS.map((k) => String(eff[k]).padEnd(k.length)).join('  ');
    console.log(`  ${a.email.padEnd(width)}  ${a.is_active ? ' yes  ' : ' NO   '}  ${flags}`);
  }

  if (show || !set) {
    console.log(`\n[policy] read-only. Pass --set key=true|false to change something.`);
    return;
  }

  const { key, value } = parseSet(set);
  const target = userId ? `account ${userEmail}` : `fleet ${orgName}`;
  console.log(`\n[policy] WOULD SET ${key} = ${value} on ${target}`);
  if (userId) {
    console.log(`[policy] this overrides the fleet setting for this one account only.`);
  } else {
    const overridden = affected.filter(
      (a) => a.user_policy && typeof (a.user_policy as Record<string, unknown>)[key] === 'boolean',
    );
    if (overridden.length) {
      console.log(
        `[policy] NOTE: ${overridden.length} account(s) have their own override of ${key} ` +
          `and will NOT change: ${overridden.map((a) => a.email).join(', ')}`,
      );
    }
  }

  if (!apply) {
    console.log(`\n[policy] DRY RUN — nothing written. Re-run with --apply.`);
    return;
  }

  const patch = JSON.stringify({ [key]: value });
  if (userId) {
    await pool.query(
      `UPDATE users SET policy = COALESCE(policy, '{}'::jsonb) || $2::jsonb WHERE id = $1`,
      [userId, patch],
    );
  } else {
    await pool.query(`UPDATE partners SET policy = policy || $2::jsonb WHERE id = $1`, [orgId, patch]);
  }
  console.log(`\n[policy] written. ${key} = ${value} on ${target}.`);
  console.log(`[policy] takes effect on the next GET /auth/me; the API enforces it immediately.`);
}

main()
  .catch((err) => { console.error('[policy] fatal:', (err as Error).message); process.exitCode = 1; })
  .finally(() => pool.end());
