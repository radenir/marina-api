/**
 * Seed the LOCAL demo database with an Esvagt-shaped fleet.
 *
 * The point is to judge the overview screen against realistic proportions
 * before writing anything to production. So this reproduces the *shape* of the
 * real Esvagt data — 238 sessions, the same per-vessel counts, the same month
 * curve, the same language and complaint mix, the same 13 red flags — while
 * copying none of its content.
 *
 * Nothing real is duplicated. No transcript, no extracted report, no patient
 * detail, and no actual person's email address: every account here is on a
 * `.test` domain that cannot exist. The messy spellings ARE copied, because
 * they are the thing the normalisation has to survive — 'ESVAGT Dana' beside
 * 'Esvagt Dana ', 'MV Esvagt Aurora' beside 'Esvagt Aurora', the 'Crapri'
 * typo, and 'ESVAGT OFFICE' used as a ship.
 *
 * Deterministic: a fixed PRNG seed, so re-running produces the same fixture and
 * a screenshot stays reproducible.
 *
 * Usage:
 *   npx tsx scripts/seed-demo-esvagt.ts          # wipes and reseeds the demo org
 */

import 'dotenv/config';
import { Pool } from 'pg';

// ---------------------------------------------------------------------------
// Refuse to run anywhere but a local demo database.
//
// This script DELETEs before it inserts. marina-api's .env points at the OVH
// production database, so the single most likely way to cause real damage here
// is to run it having forgotten that. Both conditions must hold, and there is
// no flag to override them.
// ---------------------------------------------------------------------------
const HOST = process.env.DATABASE_HOST ?? '';
const DB = process.env.DATABASE_NAME ?? '';
const isLocal = ['localhost', '127.0.0.1', '::1'].includes(HOST);
const isDemo = /demo/i.test(DB);

if (!isLocal || !isDemo) {
  console.error(
    `\n[seed-demo] REFUSING TO RUN.\n` +
      `[seed-demo]   host: ${HOST || '(unset)'}   database: ${DB || '(unset)'}\n` +
      `[seed-demo] This script deletes rows. It only runs against a database whose\n` +
      `[seed-demo] host is local AND whose name contains "demo".\n` +
      `[seed-demo] Run it via ./dev-stack.sh's environment, not marina-api's .env.\n`,
  );
  process.exit(1);
}

const pool = new Pool({
  host: HOST,
  port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: DB,
  ssl: false,
});

/** Mulberry32 — small, seeded, reproducible. */
function rng(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260908);

function shuffle<T>(a: T[]): T[] {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
/** Repeat each [value, count] pair into a flat list. */
function expand<T>(pairs: [T, number][]): T[] {
  return pairs.flatMap(([v, n]) => Array.from({ length: n }, () => v));
}

// ---------------------------------------------------------------------------
// The real shape, measured read-only from production on 2026-09-08.
// ---------------------------------------------------------------------------

/** ship_name exactly as officers typed it, with the count of their sessions. */
const VESSELS: { raw: string; sessions: number; first: string; last: string }[] = [
  { raw: 'ESVAGT Dana', sessions: 82, first: '2026-05-18', last: '2026-08-12' },
  { raw: 'Esvagt Dee', sessions: 48, first: '2026-07-18', last: '2026-08-20' },
  { raw: 'Esvagt Aurora', sessions: 33, first: '2026-07-21', last: '2026-08-25' },
  { raw: 'MV Esvagt Aurora', sessions: 2, first: '2026-08-01', last: '2026-08-25' },
  { raw: 'Esvagt Crapri', sessions: 31, first: '2026-06-17', last: '2026-08-09' },
  { raw: 'Esvagt Christina', sessions: 27, first: '2026-06-11', last: '2026-08-13' },
  { raw: 'ESVAGT OFFICE', sessions: 4, first: '2026-07-27', last: '2026-07-28' },
  { raw: 'Esvagt Dana ', sessions: 3, first: '2026-08-09', last: '2026-08-14' },
  { raw: 'Esvagt Capella', sessions: 3, first: '2026-08-09', last: '2026-08-09' },
  { raw: 'Esvagt Innovator', sessions: 3, first: '2026-08-10', last: '2026-08-10' },
  { raw: 'Esvagt A/S', sessions: 2, first: '2026-08-27', last: '2026-08-27' },
];

const MONTHS: [string, number][] = [
  ['2026-05', 18],
  ['2026-06', 7],
  ['2026-07', 57],
  ['2026-08', 156],
];

const LANGUAGES: [string, number][] = [
  // Both spellings on purpose: the client has sent an ISO code and an English
  // name at different points, and normalise_language() has to fold them.
  ['en', 111],
  ['English', 65],
  ['da', 18],
  ['Danish', 14],
  ['Polish', 14],
  ['pl', 10],
  ['de', 5],
  ['Russian', 1],
];

const MODES: [string, number][] = [
  ['note_taker', 118],
  ['marina', 110],
  ['translator', 10],
];

/** The 104 that match a named pathway. */
const PATHWAYS: [string, number][] = [
  ['Headache', 47],
  ['Nausea and Vomiting', 21],
  ['Shortness of Breath', 14],
  ['Abdominal Pain', 5],
  ['Back Pain', 4],
  ['Chest pain', 3],
  ['Musculoskeletal injuries', 2],
  ['Joint Pain or Swelling', 2],
  ['Diarrhea', 1],
  ['Eye Foreign Body', 1],
  ['Obstipation', 1],
  ['Throat Pain and Sore Throat', 1],
  ['Trauma', 1],
  ['Dental Pain', 1],
];

/**
 * The 134 that do not. This is what chief_symptom actually contains when the
 * transcriber captures the first thing it hears — including, eight times in
 * production, Marina's own Danish greeting recorded as the patient's
 * complaint. It is reproduced here rather than tidied away because the
 * overview is supposed to show how much it cannot classify.
 */
const JUNK: [string | null, number][] = [
  ['[silence]', 24],
  ['Hi', 12],
  ['Jeg er Marina, din medicinske stemme', 8],
  ['Hello', 7],
  ['[background noise]', 6],
  ['Hej', 4],
  ['[unintelligible audio]', 4],
  ['Nu skal jeg lige se', 3],
  ['Cześć', 3],
  ['Boli mnie głowa', 2],
  ['[pause] [clicking]', 2],
  ['Hey', 2],
  [null, 57],
];

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // A known demo password, reused rather than invented: copy the hash off
    // the account dev-stack.sh already tells you to sign in with.
    const { rows: pwRows } = await client.query<{ password: string }>(
      `SELECT password FROM users WHERE email = 'office@marinahealth.test' LIMIT 1`,
    );
    if (!pwRows.length) {
      throw new Error(
        'office@marinahealth.test not found — run ./dev-stack.sh once to build the demo db first',
      );
    }
    const password = pwRows[0].password;

    // ---- wipe any previous run of THIS fixture only ------------------------
    // Scoped to the esvagt org, so the existing Marina Health demo fleet and
    // its six cases are left exactly as they are.
    const { rows: existing } = await client.query<{ id: string }>(
      `SELECT id FROM partners WHERE slug = 'esvagt-demo'`,
    );
    if (existing.length) {
      const orgId = existing[0].id;
      await client.query(
        `DELETE FROM conversations WHERE user_id IN (SELECT id FROM users WHERE org_id = $1)`,
        [orgId],
      );
      await client.query(`DELETE FROM users WHERE org_id = $1`, [orgId]);
      // vessels and vessel_aliases cascade from partners
      await client.query(`DELETE FROM partners WHERE id = $1`, [orgId]);
      console.log('[seed-demo] removed the previous fixture');
    }

    // ---- organisation, vessels, aliases ------------------------------------
    const { rows: orgRows } = await client.query<{ id: string }>(
      `INSERT INTO partners (name, slug, kind) VALUES ('Esvagt A/S (demo)', 'esvagt-demo', 'owner')
       RETURNING id`,
    );
    const orgId = orgRows[0].id;

    const canonical: Record<string, string> = {
      'ESVAGT Dana': 'Esvagt Dana',
      'Esvagt Dana ': 'Esvagt Dana',
      'Esvagt Dee': 'Esvagt Dee',
      'Esvagt Aurora': 'Esvagt Aurora',
      'MV Esvagt Aurora': 'Esvagt Aurora',
      'Esvagt Crapri': 'Esvagt Capri',
      'Esvagt Christina': 'Esvagt Christina',
      'Esvagt Capella': 'Esvagt Capella',
      'Esvagt Innovator': 'Esvagt Innovator',
    };
    const shipNames = [...new Set(Object.values(canonical))];
    const vesselIds = new Map<string, string>();
    for (const name of shipNames) {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO vessels (org_id, name) VALUES ($1, $2) RETURNING id`,
        [orgId, name],
      );
      vesselIds.set(name, rows[0].id);
    }

    // normalise_vessel_name() collapses casing, spacing and the MV/ESVAGT
    // prefixes; the aliases below are the ones it cannot know — the typo, and
    // the three labels that are not ships at all.
    const aliases: [string, string | null, boolean][] = [
      ['Crapri', vesselIds.get('Esvagt Capri') ?? null, true],
      ['Office', null, false],
      ['A/S', null, false],
      ['Esvagt', null, false],
    ];
    for (const [alias, vesselId, isVessel] of aliases) {
      await client.query(
        `INSERT INTO vessel_aliases (org_id, alias, vessel_id, is_vessel)
         VALUES ($1, $2, $3, $4) ON CONFLICT (org_id, alias) DO NOTHING`,
        [orgId, alias, vesselId, isVessel],
      );
    }

    // ---- accounts ----------------------------------------------------------
    // .test addresses: a fixture must never contain a real person's email.
    const userIds = new Map<string, string>();
    // The index disambiguates: 'ESVAGT Dana' and 'Esvagt Dana ' are two real
    // accounts that slug to the same address, which is exactly the kind of
    // near-duplicate this fixture exists to reproduce.
    for (const [n, v] of VESSELS.entries()) {
      const slug = v.raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');
      const email = `${slug}.${n}@esvagt.test`;
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO users (email, password, role, is_active, email_verified,
                            company, ship_name, org_id, vessel_id, last_seen_at, created_at)
         VALUES ($1, $2, 'user', TRUE, TRUE, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          email,
          password,
          rand() > 0.5 ? 'Esvagt A/S' : 'Esvagt',
          v.raw,
          orgId,
          vesselIds.get(canonical[v.raw] ?? '') ?? null,
          new Date(`${v.last}T12:00:00Z`),
          new Date(`${v.first}T08:00:00Z`),
        ],
      );
      userIds.set(v.raw, rows[0].id);
    }

    // The office account that can actually open the dashboard.
    await client.query(
      `INSERT INTO users (email, password, role, is_active, email_verified,
                          company, first_name, last_name, org_id, last_seen_at, created_at)
       VALUES ('office@esvagt.test', $1, 'management', TRUE, TRUE,
               'Esvagt A/S', 'Fleet', 'Office', $2, NOW(), '2026-05-01')`,
      [password, orgId],
    );

    // ---- month assignment --------------------------------------------------
    // Exact month totals AND a plausible joint distribution: each session gets
    // a month from the real pool, drawn only from months the vessel was
    // actually active in. Narrowest windows are served first or they starve.
    const monthPool = shuffle(expand(MONTHS));
    const ordered = [...VESSELS].sort(
      (a, b) =>
        new Date(a.last).getTime() -
        new Date(a.first).getTime() -
        (new Date(b.last).getTime() - new Date(b.first).getTime()),
    );

    const sessions: { raw: string; when: Date }[] = [];
    for (const v of ordered) {
      const lo = v.first.slice(0, 7);
      const hi = v.last.slice(0, 7);
      for (let i = 0; i < v.sessions; i++) {
        let idx = monthPool.findIndex((m) => m >= lo && m <= hi);
        if (idx === -1) idx = 0; // window exhausted; keep totals exact
        const month = monthPool.splice(idx, 1)[0];
        const day = 1 + Math.floor(rand() * 27);
        const hour = 6 + Math.floor(rand() * 14);
        sessions.push({
          raw: v.raw,
          when: new Date(`${month}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:20:00Z`),
        });
      }
    }

    // ---- per-session attributes, exact marginals ---------------------------
    const langs = shuffle(expand(LANGUAGES));
    const modes = shuffle(expand(MODES));
    const symptoms = shuffle([...expand(PATHWAYS), ...expand(JUNK)]);

    // 134 sessions carry a report; 13 of those raised a red flag; 57 have
    // enough turns to count as a real consultation.
    const hasReport = shuffle(expand<boolean>([[true, 134], [false, 104]]));
    const redFlagSlots = shuffle(expand<boolean>([[true, 13], [false, 121]]));
    const substantive = shuffle(expand<boolean>([[true, 57], [false, 181]]));

    let redIdx = 0;
    const shuffled = shuffle(sessions);

    for (let i = 0; i < shuffled.length; i++) {
      const s = shuffled[i];
      const report = hasReport[i];
      const red = report ? redFlagSlots[redIdx++] : false;
      const turns = substantive[i] ? 6 + Math.floor(rand() * 40) : 1 + Math.floor(rand() * 3);

      // Message bodies are deliberately empty of content: the view counts them,
      // it never reads them, and a fixture has no business inventing a
      // consultation.
      const messages = Array.from({ length: turns }, (_, k) => ({
        role: k % 2 === 0 ? 'user' : 'assistant',
        content: '',
      }));

      const summary = report
        ? { redFlag: red ? 'yes' : '', chiefSymptom: '', shipName: s.raw }
        : null;

      await client.query(
        `INSERT INTO conversations
           (user_id, chief_symptom, messages, extracted_summary,
            patient_language, medical_officer_language, mode,
            created_at, updated_at, last_message_at)
         VALUES ($1,$2,$3::jsonb,$4::jsonb,$5,$6,$7,$8,$8,$8)`,
        [
          userIds.get(s.raw),
          symptoms[i],
          JSON.stringify(messages),
          summary ? JSON.stringify(summary) : null,
          langs[i],
          langs[i],
          modes[i],
          s.when,
        ],
      );
    }

    await client.query('COMMIT');

    console.log(`\n[seed-demo] Esvagt-shaped fixture written to ${DB}`);
    console.log(`[seed-demo]   organisation: Esvagt A/S (demo)`);
    console.log(`[seed-demo]   ${shipNames.length} vessels, ${VESSELS.length} accounts,`
      + ` ${shuffled.length} sessions`);
    console.log(`[seed-demo]   sign in: office@esvagt.test / demo1234`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[seed-demo] fatal:', (err as Error).message);
  process.exit(1);
});
