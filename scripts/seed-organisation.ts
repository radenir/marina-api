/**
 * Attach a real fleet to an organisation: the company, its vessels, the
 * spelling aliases, and the accounts that belong to it.
 *
 * Deliberately NOT a .sql file under migrations/: `npm run migrate` would then
 * run it as part of a deploy. This writes to `partners`, `vessels`,
 * `vessel_aliases` and — the only UPDATE in the whole thing — `users.org_id`
 * and `users.vessel_id`. That should be a separate, deliberate step that
 * somebody watches.
 *
 * Only ever INSERTs, plus an UPDATE that fills org_id/vessel_id where they are
 * currently NULL. It never overwrites an account already attached to a
 * different organisation, never touches conversations, and never deletes.
 *
 * Usage:
 *   npm run seed-organisation -- --org esvagt            # dry run
 *   npm run seed-organisation -- --org esvagt --apply
 *
 *   # ...and grant one existing account the office view:
 *   npm run seed-organisation -- --org esvagt --management mgl@esvagt.com --apply
 *
 * `--management` promotes an account that already exists rather than creating
 * one, so this script never invents a password. The role is purely additive:
 * `role` is read only by requireRole, so the account keeps working at sea
 * exactly as before and gains the fleet screens. It is never defaulted —
 * deciding who in a customer's office may see fleet-wide medical activity is
 * not a decision a seed script should make quietly.
 */

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.DATABASE_HOST,
  port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  // TLS is on by default for the OVH managed database. DATABASE_SSL=disable is
  // for a local throwaway Postgres, which has no TLS — it is what lets
  // tests/e2e/verify-seed-organisation.sh exercise this exact write path
  // before it is ever pointed at production. Production never sets it.
  ssl: process.env.DATABASE_SSL === 'disable' ? false : { rejectUnauthorized: false },
  options: '--search_path=public',
});

interface VesselSpec {
  name: string;
  call_sign?: string;
  imo?: string;
  /** Spellings seen in the wild that mean this ship. Normalised before use. */
  aliases?: string[];
}

interface OrgSpec {
  slug: string;
  name: string;
  kind: 'owner' | 'provider' | 'integrator';
  /** Email domains whose accounts belong to this company. */
  domains: string[];
  /** Free-text `users.company` values, matched case-insensitively after trim. */
  companyText: string[];
  vessels: VesselSpec[];
  /**
   * Labels that appear in users.ship_name but are not ships. Their sessions
   * still count for the fleet; they simply get no vessel.
   */
  notVessels?: string[];
  /**
   * email -> vessel, for accounts no amount of string matching can place:
   * someone who typed the company where the ship goes, or left it blank.
   * Outranks everything else, because it is the one assignment a person made
   * deliberately rather than a guess about what they meant.
   */
  accountVessels?: Record<string, string>;
}

/**
 * Esvagt.
 *
 * The vessel list is what the data actually contains, not Esvagt's real fleet
 * — those are two different things and only Esvagt can reconcile them. Every
 * name here was seen in `users.ship_name` on an account with an Esvagt email
 * domain or company.
 *
 * 'Crapri' is the interesting one. It is almost certainly Capri, but a typo is
 * not a fact, so it is recorded as an alias of Capri where a person can see it
 * and correct it — rather than silently merged by a fuzzy match, or silently
 * left as a ninth ship that does not exist.
 */
const ORGS: Record<string, OrgSpec> = {
  esvagt: {
    slug: 'esvagt',
    name: 'Esvagt A/S',
    kind: 'owner',

    // ONE domain, and no company-text matching at all.
    //
    // `users.company` is free text a person typed, and matching on it pulled in
    // eight accounts on gmail/hotmail/live.dk — including one with 90 sessions
    // that turned out to be Marina's own testing on Dana, not an Esvagt medic.
    // That single account was 85 of the 88 sessions the dashboard would have
    // attributed to Esvagt Dana.
    //
    // Confirmed by Adrian 2026-09-08: Esvagt crew accounts are @esvagtvessel.com
    // and nothing else. Matching a customer's fleet on a field they typed
    // themselves is how you show a customer someone else's numbers.
    domains: ['esvagtvessel.com'],
    companyText: [],
    vessels: [
      { name: 'Esvagt Dana', aliases: ['Dana', 'Svagt Dana'] },
      { name: 'Esvagt Dee', aliases: ['Dee'] },
      { name: 'Esvagt Aurora', aliases: ['Aurora'] },
      { name: 'Esvagt Capri', aliases: ['Capri', 'Crapri'] },
      { name: 'Esvagt Christina', aliases: ['Christina'] },
      { name: 'Esvagt Innovator', aliases: ['Innovator'] },
      { name: 'Esvagt Capella', aliases: ['Capella'] },
      { name: 'Esvagt Leah', aliases: ['Leah'] },
      { name: 'Esvagt Havelok', aliases: ['Havelok'] },
      { name: 'Esvagt Mercator', aliases: ['Mercator'] },
      // 'A/S' is what connector.medic@esvagtvessel.com typed in the ship field
      // — the company name, not a vessel. Confirmed by Adrian 2026-09-08 that
      // the account is Connector. Safe as an alias because aliases are scoped
      // per organisation and no other Esvagt account typed it.
      { name: 'Esvagt Connector', aliases: ['Connector', 'A/S'] },
    ],
    // 'Esvagt' on its own is the company, not a ship. Kept as a not-a-ship
    // label so a future account typing it is not filed onto someone's vessel
    // by accident — medic.havelok@ is placed by accountVessels instead.
    notVessels: ['Esvagt'],

    // Confirmed by Adrian 2026-09-08. Neither can be reached by matching:
    // medic.havelok@ typed the company name, and mercator@ recorded no ship
    // at all, so there is no string for an alias to match on.
    accountVessels: {
      'medic.havelok@esvagtvessel.com': 'Esvagt Havelok',
      'mercator@esvagtvessel.com': 'Esvagt Mercator',
    },
  },
};

/** Mirrors normalise_vessel_name() in migration 018. Keep the two in step. */
function normaliseVessel(raw: string): string {
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  const noType = collapsed.replace(/^\s*(M\/?V|M\/?S|S\/?S|MT)\s+/i, '');
  const noOwner = noType.replace(/^\s*(ESVAGT|DFDS|MAERSK|TORM)\s+/i, '');
  return noOwner
    .trim()
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ');
}

async function main() {
  const apply = process.argv.includes('--apply');
  const orgArgIdx = process.argv.indexOf('--org');
  const orgSlug = orgArgIdx >= 0 ? process.argv[orgArgIdx + 1] : undefined;
  const mgmtIdx = process.argv.indexOf('--management');
  const managementEmail =
    mgmtIdx >= 0 ? process.argv[mgmtIdx + 1]?.trim().toLowerCase() : undefined;

  if (!orgSlug || !ORGS[orgSlug]) {
    console.error(`usage: --org <${Object.keys(ORGS).join('|')}> [--apply]`);
    process.exit(1);
  }
  const spec = ORGS[orgSlug];
  const client = await pool.connect();

  try {
    // ---- who would be attached -------------------------------------------
    const { rows: accounts } = await client.query<{
      id: string;
      email: string;
      company: string | null;
      ship_name: string | null;
      org_id: string | null;
      sessions: string;
    }>(
      `SELECT u.id, u.email, u.company, u.ship_name, u.org_id,
              (SELECT COUNT(*) FROM conversations c WHERE c.user_id = u.id)::text AS sessions
         FROM users u
        WHERE lower(split_part(u.email,'@',2)) = ANY($1::text[])
           OR lower(trim(coalesce(u.company,''))) = ANY($2::text[])
        ORDER BY u.email`,
      [spec.domains, spec.companyText],
    );

    const free = accounts.filter((a) => a.org_id === null);
    const taken = accounts.filter((a) => a.org_id !== null);

    console.log(`\n[seed] organisation: ${spec.name} (${spec.slug})`);
    console.log(`[seed] accounts matched: ${accounts.length}`);
    console.log(`[seed]   attachable (org_id is null): ${free.length}`);
    if (taken.length) {
      console.log(`[seed]   already attached elsewhere, will be left alone: ${taken.length}`);
      for (const a of taken) console.log(`[seed]     - ${a.email}`);
    }

    // ---- vessel resolution, and what it cannot resolve ---------------------
    const aliasToVessel = new Map<string, string>();
    for (const v of spec.vessels) {
      aliasToVessel.set(normaliseVessel(v.name), v.name);
      for (const al of v.aliases ?? []) aliasToVessel.set(normaliseVessel(al), v.name);
    }
    const notVessel = new Set((spec.notVessels ?? []).map(normaliseVessel));

    const shipCounts = new Map<string, number>();
    for (const a of accounts) {
      if (!a.ship_name || !a.ship_name.trim()) continue;
      const key = normaliseVessel(a.ship_name);
      shipCounts.set(key, (shipCounts.get(key) ?? 0) + Number(a.sessions));
    }

    // One resolver, used by both the preview and the write, so the plan you
    // read is by construction the plan that runs.
    const explicit = spec.accountVessels ?? {};
    const resolveVessel = (email: string, shipName: string | null): string | undefined => {
      const direct = explicit[email.trim().toLowerCase()];
      if (direct) return direct;
      const key = shipName ? normaliseVessel(shipName) : null;
      if (!key || notVessel.has(key)) return undefined;
      return aliasToVessel.get(key);
    };

    const unresolved = [...shipCounts.keys()].filter(
      (k) => !aliasToVessel.has(k) && !notVessel.has(k),
    );

    console.log(`\n[seed] vessels to create: ${spec.vessels.length}`);
    console.log(`[seed] aliases to create:  ${aliasToVessel.size + notVessel.size}`);
    if (unresolved.length) {
      console.log(
        `\n[seed] !! ${unresolved.length} ship_name value(s) match no vessel and no` +
          ` not-a-vessel rule.\n[seed]    Their sessions will count for the fleet but show no ship:`,
      );
      for (const u of unresolved) console.log(`[seed]      - "${u}" (${shipCounts.get(u)} sessions)`);
    }

    // The collision normalise_vessel_name() can cause: two genuinely different
    // ships whose type prefixes differ collapse to one label. Worth seeing
    // before it silently merges a fleet's medical activity.
    const collisions = new Map<string, Set<string>>();
    for (const a of accounts) {
      if (!a.ship_name?.trim()) continue;
      const key = normaliseVessel(a.ship_name);
      if (!collisions.has(key)) collisions.set(key, new Set());
      collisions.get(key)!.add(a.ship_name.trim());
    }
    const merged = [...collisions.entries()].filter(([, raws]) => raws.size > 1);
    if (merged.length) {
      console.log(`\n[seed] spellings that normalise together (expected, but check):`);
      for (const [key, raws] of merged) {
        console.log(`[seed]      ${key}  <-  ${[...raws].map((r) => `"${r}"`).join(', ')}`);
      }
    }

    if (managementEmail) {
      const match = accounts.find((a) => a.email.toLowerCase() === managementEmail);
      if (!match) {
        console.log(
          `\n[seed] !! --management ${managementEmail} matches no account in this fleet.` +
            `\n[seed]    It must be an existing account whose email domain or company` +
            `\n[seed]    already places it in ${spec.name}.`,
        );
        if (apply) {
          console.log('[seed] refusing to continue.');
          process.exitCode = 1;
          return;
        }
      } else {
        console.log(`\n[seed] would grant the office view to: ${match.email}`);
      }
    } else {
      console.log(
        `\n[seed] note: no --management account given, so nobody will be able to` +
          `\n[seed]       open the dashboard for this fleet yet.`,
      );
    }

    // Exactly what would happen to each account, one line each. A summary
    // count is not reviewable; a list is.
    console.log(`\n[seed] per-account plan (org_id and vessel_id are both NULL today):`);
    console.log(
      `[seed]   ${'email'.padEnd(36)}${'ship_name as typed'.padEnd(22)}-> vessel_id`,
    );
    for (const a of accounts) {
      const key = a.ship_name ? normaliseVessel(a.ship_name) : null;
      const vesselName = resolveVessel(a.email, a.ship_name);
      const assigned = !!explicit[a.email.trim().toLowerCase()];
      const outcome = a.org_id
        ? 'SKIPPED (already in another organisation)'
        : vesselName
          ? vesselName + (assigned ? '   [assigned by email]' : '')
          : key && notVessel.has(key)
            ? '(none — not a ship)'
            : '(none — no ship recorded)';
      console.log(
        `[seed]   ${a.email.padEnd(36)}${(a.ship_name ?? '—').padEnd(22)}-> ${outcome}`,
      );
    }

    if (!apply) {
      console.log(
        `\n[seed] DRY RUN — nothing written.\n` +
          `[seed] would create 1 organisation, ${spec.vessels.length} vessels,` +
          ` ${aliasToVessel.size + notVessel.size} aliases,` +
          ` and attach ${free.length} accounts.\n` +
          `[seed] re-run with --apply to write.`,
      );
      return;
    }

    // ---- write ------------------------------------------------------------
    await client.query('BEGIN');
    try {
      const { rows: orgRows } = await client.query<{ id: string }>(
        `INSERT INTO partners (name, slug, kind)
         VALUES ($1, $2, $3)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [spec.name, spec.slug, spec.kind],
      );
      const orgId = orgRows[0].id;

      const vesselIds = new Map<string, string>();
      for (const v of spec.vessels) {
        const { rows } = await client.query<{ id: string }>(
          // Explicit casts: $1 and $2 appear both as inserted values and in the
          // NOT EXISTS comparison, and without them Postgres cannot deduce a
          // single type for each — it fails outright with "inconsistent types
          // deduced for parameter $2" rather than guessing.
          `INSERT INTO vessels (org_id, name, call_sign, imo)
           SELECT $1::uuid, $2::varchar, $3::varchar, $4::varchar
            WHERE NOT EXISTS (
              SELECT 1 FROM vessels WHERE org_id = $1::uuid AND name = $2::varchar)
           RETURNING id`,
          [orgId, v.name, v.call_sign ?? null, v.imo ?? null],
        );
        const id =
          rows[0]?.id ??
          (
            await client.query<{ id: string }>(
              `SELECT id FROM vessels WHERE org_id = $1 AND name = $2 LIMIT 1`,
              [orgId, v.name],
            )
          ).rows[0].id;
        vesselIds.set(v.name, id);
      }

      for (const [alias, vesselName] of aliasToVessel) {
        await client.query(
          `INSERT INTO vessel_aliases (org_id, alias, vessel_id, is_vessel)
           VALUES ($1, $2, $3, TRUE)
           ON CONFLICT (org_id, alias) DO NOTHING`,
          [orgId, alias, vesselIds.get(vesselName)],
        );
      }
      for (const alias of notVessel) {
        await client.query(
          `INSERT INTO vessel_aliases (org_id, alias, vessel_id, is_vessel)
           VALUES ($1, $2, NULL, FALSE)
           ON CONFLICT (org_id, alias) DO NOTHING`,
          [orgId, alias],
        );
      }

      // Attach accounts, and their vessel where the name resolves. Only rows
      // whose org_id is still NULL: an account already belonging to someone
      // else is never re-homed by a seed script.
      let attached = 0;
      for (const a of free) {
        const vesselName = resolveVessel(a.email, a.ship_name);
        const vesselId = vesselName ? vesselIds.get(vesselName) : null;
        const { rowCount } = await client.query(
          `UPDATE users
              SET org_id = $2,
                  vessel_id = COALESCE(vessel_id, $3)
            WHERE id = $1 AND org_id IS NULL`,
          [a.id, orgId, vesselId ?? null],
        );
        attached += rowCount ?? 0;
      }

      // Additive only: role is consulted by requireRole and nowhere else, so
      // this grants the fleet screens without changing anything the account
      // can already do at sea.
      if (managementEmail) {
        const { rowCount } = await client.query(
          `UPDATE users SET role = 'management'
            WHERE lower(email) = $1 AND org_id = $2`,
          [managementEmail, orgId],
        );
        console.log(
          rowCount
            ? `[seed]      granted the office view to ${managementEmail}`
            : `[seed]      !! could not grant ${managementEmail} — not in this organisation`,
        );
      }

      await client.query('COMMIT');
      console.log(`\n[seed] OK — organisation ${orgId}`);
      console.log(`[seed]      ${spec.vessels.length} vessels, ${attached} accounts attached`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[seed] fatal:', (err as Error).message);
  process.exit(1);
});
