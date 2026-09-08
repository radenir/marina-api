/**
 * Prove that fleet_mews() in SQL agrees with calculateMEWS() in TypeScript.
 *
 * Migration 021 mirrors the M-EWS thresholds into SQL, because a view cannot
 * call into the application and the score is not stored anywhere. That leaves
 * two copies of a clinical scoring rule, which is a hazard: if they drift, the
 * fleet dashboard and the ship app disagree about how sick somebody was.
 *
 * This walks every band boundary of every vital — the values where a threshold
 * flips — plus the combinations that matter, and asserts the two agree exactly.
 *
 * src/lib/mewsCalculator.ts is the authority. If this fails, the SQL is wrong.
 *
 *   DATABASE_SSL=disable DATABASE_NAME=... npx tsx tests/e2e/verify-mews-parity.ts
 *
 * Local only: reads no .env, so it cannot reach production by accident.
 */

import { Pool } from 'pg';
import { calculateMEWS } from '../../src/lib/mewsCalculator';

const pool = new Pool({
  host: process.env.DATABASE_HOST ?? 'localhost',
  port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  ssl: process.env.DATABASE_SSL === 'disable' ? false : { rejectUnauthorized: false },
});

/** Every value where a band flips, plus one either side. */
const HR = [null, 30, 40, 41, 50, 51, 90, 91, 110, 111, 130, 131, 200];
const RR = [null, 5, 8, 9, 11, 12, 20, 21, 24, 25, 40];
const TP = [null, 34.0, 34.9, 35.0, 35.5, 35.6, 38.0, 38.1, 39.0, 39.1, 39.5, 39.6, 41];
const BP = [null, 80, 90, 91, 100, 101, 110, 111, 180, 181, 219, 220, 240];
const SP = [null, 88, 91, 92, 93, 94, 95, 96, 100];
const AV = [null, 'Alert', 'Voice', 'Pain', 'Unresponsive'];

type Case = {
  pulse: number | null;
  resp: number | null;
  temp: number | null;
  bp: number | null;
  spo2: number | null;
  avpu: string | null;
};

/** One vital swept at a time, then a set of realistic combinations. */
function buildCases(): Case[] {
  const base: Case = { pulse: 70, resp: 16, temp: 37, bp: 120, spo2: 98, avpu: 'Alert' };
  const cases: Case[] = [];
  for (const v of HR) cases.push({ ...base, pulse: v });
  for (const v of RR) cases.push({ ...base, resp: v });
  for (const v of TP) cases.push({ ...base, temp: v });
  for (const v of BP) cases.push({ ...base, bp: v });
  for (const v of SP) cases.push({ ...base, spo2: v });
  for (const v of AV) cases.push({ ...base, avpu: v });

  // Nothing recorded at all — both must say 0, and the view must then decline
  // to call it a band.
  cases.push({ pulse: null, resp: null, temp: null, bp: null, spo2: null, avpu: null });
  // A genuinely sick patient across several axes at once.
  cases.push({ pulse: 135, resp: 26, temp: 39.8, bp: 85, spo2: 90, avpu: 'Voice' });
  cases.push({ pulse: 45, resp: 10, temp: 35.2, bp: 105, spo2: 94, avpu: 'Alert' });
  return cases;
}

function toSummary(c: Case): Record<string, string> {
  const s: Record<string, string> = {};
  if (c.pulse !== null) s['circulation_pulse_per_min'] = String(c.pulse);
  if (c.resp !== null) s['breathing_num_breaths_per_min'] = String(c.resp);
  if (c.temp !== null) s['expose_temperature_measured_mouth'] = String(c.temp);
  if (c.bp !== null) s['circulation_systole'] = String(c.bp);
  if (c.spo2 !== null) s['breathing_oxygen_saturation'] = String(c.spo2);
  if (c.avpu !== null) s['avpu'] = c.avpu;
  return s;
}

async function main() {
  const cases = buildCases();
  let failures = 0;

  for (const c of cases) {
    const ts = calculateMEWS({
      pulse_per_min: c.pulse,
      respiration_per_min: c.resp,
      temperature_celsius: c.temp,
      blood_pressure_systolic: c.bp,
      oxygen_saturation_percent: c.spo2,
      oxygen_requirements: null,
      avpu: c.avpu as 'Alert' | 'Voice' | 'Pain' | 'Unresponsive' | null,
    }).total_score;

    const { rows } = await pool.query<{ score: number }>(
      'SELECT fleet_mews($1::jsonb) AS score',
      [JSON.stringify(toSummary(c))],
    );
    const sql = Number(rows[0].score);

    if (sql !== ts) {
      failures++;
      console.log(
        `  FAIL  ${JSON.stringify(c)}\n        typescript=${ts}  sql=${sql}`,
      );
    }
  }

  // The units are what officers actually type: "72 bpm", "36.8 °C".
  const messy = await pool.query<{ score: number }>(
    `SELECT fleet_mews('{"circulation_pulse_per_min":"135 bpm",
                         "expose_temperature_measured_mouth":"39.8 C"}'::jsonb) AS score`,
  );
  if (Number(messy.rows[0].score) !== 6) {
    failures++;
    console.log(`  FAIL  units stripped wrongly: expected 6, got ${messy.rows[0].score}`);
  }

  // A blood pressure written whole must never be read as 12080.
  const bp = await pool.query<{ score: number }>(
    `SELECT fleet_mews('{"circulation_systole":"120/80"}'::jsonb) AS score`,
  );
  if (Number(bp.rows[0].score) !== 0) {
    failures++;
    console.log(`  FAIL  "120/80" misparsed: expected 0, got ${bp.rows[0].score}`);
  }

  console.log(
    failures === 0
      ? `\nALL PASS — ${cases.length + 2} cases, SQL agrees with mewsCalculator.ts`
      : `\n${failures} FAILURE(S) of ${cases.length + 2}`,
  );
  await pool.end();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('fatal:', (err as Error).message);
  process.exit(1);
});
