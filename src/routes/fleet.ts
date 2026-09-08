import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../lib/db';
import { rateLimit } from '../lib/rateLimit';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';

/**
 * The Fleet Dashboard's API — what the office can see.
 *
 * Two rules hold this whole namespace together:
 *
 *   1. Every case query reads `v_fleet_cases`, never `cases`. That view does
 *      not contain patient_ref, outcome_note, or any join to conversation
 *      content. The office cannot reach a symptom because the columns are not
 *      there, not because a filter removed them — which is a far easier
 *      sentence to put in front of a customer's lawyer, and one that survives
 *      a careless `SELECT *` next year.
 *
 *   2. There is no write endpoint here, at all. The absence is the guarantee.
 *      Management acts on what it sees — diverts the ship, calls the agent —
 *      but never authors clinical content, which is what keeps the record
 *      defensible.
 *
 * Everything is scoped to `req.orgId`, set by requireRole from the account's
 * row. A management account without an organisation is rejected rather than
 * defaulted to "everything".
 */
export const fleetRouter = Router();

const fleetRateLimit = rateLimit({
  prefix: 'fleet',
  limit: 4000,
  windowSeconds: 60 * 60,
  keyFn: (req) => req.user!.id,
});

const guard = [requireAuth, fleetRateLimit, requireRole('management')] as const;

/** Statuses that put a case on the board. `recording` is never one of them. */
const ACTIVE_STATUSES = ['open', 'awaiting_doctor', 'monitoring'] as const;

// ---------------------------------------------------------------------------
// GET /fleet/board
//
// The screen someone leaves open. Every case currently running in the fleet,
// what each is waiting for, and — in plain sight — how long since that vessel
// last reached us.
// ---------------------------------------------------------------------------
fleetRouter.get('/board', ...guard, async (req: Request, res: Response): Promise<void> => {
  const result = await query(
    `SELECT c.id,
            c.ship_name,
            c.call_sign,
            c.status,
            c.severity,
            c.opened_at,
            c.next_check_due_at,
            c.is_overdue,
            c.encounter_count,
            c.last_activity_at,
            v.id   AS vessel_id,
            v.name AS vessel_name,
            -- Newest connection from any account on this vessel. NULL means
            -- we have never heard from them, which the screen must say.
            (SELECT MAX(u.last_seen_at) FROM users u
              WHERE u.vessel_id = v.id) AS vessel_last_seen_at
       FROM v_fleet_cases c
       -- LATERAL with LIMIT 1: real fleets contain the same ship name twice
       -- (a vessel re-registered under a new call sign, a name reused). A
       -- plain join would then show the case once per match. Call sign wins
       -- over name because it is the more specific identifier.
       LEFT JOIN LATERAL (
         SELECT vv.id, vv.name
           FROM vessels vv
          WHERE vv.org_id = c.org_id
            AND (vv.call_sign = c.call_sign OR vv.name = c.ship_name)
          ORDER BY (vv.call_sign IS NOT DISTINCT FROM c.call_sign) DESC, vv.created_at
          LIMIT 1
       ) v ON TRUE
      WHERE c.org_id = $1
        AND c.status = ANY($2::varchar[])
      ORDER BY c.is_overdue DESC,
               c.severity DESC NULLS LAST,
               c.next_check_due_at ASC NULLS LAST,
               c.opened_at ASC`,
    [req.orgId, [...ACTIVE_STATUSES]],
  );

  res.json({ items: result.rows, as_of: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// GET /fleet/vessels
// Every ship, whether it has anything running, and when it last connected.
// ---------------------------------------------------------------------------
fleetRouter.get('/vessels', ...guard, async (req: Request, res: Response): Promise<void> => {
  const result = await query(
    `SELECT v.id,
            v.name,
            v.call_sign,
            v.imo,
            (SELECT MAX(u.last_seen_at) FROM users u WHERE u.vessel_id = v.id) AS last_seen_at,
            -- Match on call sign when the vessel has one, otherwise on name.
            -- Without this a case counts against every same-named vessel.
            (SELECT COUNT(*)::int FROM v_fleet_cases c
              WHERE c.org_id = v.org_id
                AND (CASE WHEN v.call_sign IS NOT NULL
                          THEN c.call_sign = v.call_sign
                          ELSE c.ship_name = v.name END)
                AND c.status = ANY($2::varchar[])) AS open_cases,
            (SELECT COUNT(*)::int FROM v_fleet_cases c
              WHERE c.org_id = v.org_id
                AND (CASE WHEN v.call_sign IS NOT NULL
                          THEN c.call_sign = v.call_sign
                          ELSE c.ship_name = v.name END)
                AND c.status = 'closed') AS closed_cases
       FROM vessels v
      WHERE v.org_id = $1
      ORDER BY v.name`,
    [req.orgId, [...ACTIVE_STATUSES]],
  );

  res.json({ items: result.rows });
});

// ---------------------------------------------------------------------------
// GET /fleet/cases — redacted history
// ---------------------------------------------------------------------------
const historyQuerySchema = z.object({
  status: z.enum(['active', 'all', 'closed']).default('all'),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

fleetRouter.get('/cases', ...guard, async (req: Request, res: Response): Promise<void> => {
  const parsed = historyQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query', issues: parsed.error.issues });
    return;
  }
  const { status, from, to, limit } = parsed.data;

  const statuses =
    status === 'active' ? [...ACTIVE_STATUSES] : status === 'closed' ? ['closed'] : null;

  const params: unknown[] = [req.orgId];
  let where = 'WHERE org_id = $1';
  if (statuses) {
    params.push(statuses);
    where += ` AND status = ANY($${params.length}::varchar[])`;
  } else {
    where += ` AND status <> 'recording'`;
  }
  if (from) {
    params.push(from);
    where += ` AND created_at >= $${params.length}`;
  }
  if (to) {
    params.push(to);
    where += ` AND created_at <= $${params.length}`;
  }
  params.push(limit);

  const result = await query(
    `SELECT id, ship_name, call_sign, status, severity, opened_at, closed_at,
            next_check_due_at, outcome, encounter_count, created_at
       FROM v_fleet_cases
       ${where}
      ORDER BY created_at DESC
      LIMIT $${params.length}`,
    params,
  );

  res.json({ items: result.rows });
});

// ---------------------------------------------------------------------------
// GET /fleet/decisions
// What crews recorded about diverting or evacuating. No clinical content, so
// the office reads it directly rather than through the redacted view.
// ---------------------------------------------------------------------------
fleetRouter.get('/decisions', ...guard, async (req: Request, res: Response): Promise<void> => {
  const result = await query(
    `SELECT d.id, d.case_id, d.decision, d.method, d.port_name,
            d.notified, d.note, d.decided_at,
            c.ship_name, c.call_sign, c.status AS case_status
       FROM case_decisions d
       JOIN v_fleet_cases c ON c.id = d.case_id
      WHERE c.org_id = $1
      ORDER BY d.decided_at DESC
      LIMIT 200`,
    [req.orgId],
  );

  res.json({ items: result.rows });
});

// ---------------------------------------------------------------------------
// GET /fleet/stats
//
// What it is costing, minus the money: the crew records that a helicopter
// came, not what it invoiced. A per-fleet cost constant is applied by the
// client, so the number the API returns stays a fact rather than an estimate.
// ---------------------------------------------------------------------------
fleetRouter.get('/stats', ...guard, async (req: Request, res: Response): Promise<void> => {
  const [byOutcome, decisions, latency, totals] = await Promise.all([
    query(
      `SELECT COALESCE(outcome, 'not_recorded') AS outcome, COUNT(*)::int AS n
         FROM v_fleet_cases
        WHERE org_id = $1 AND status = 'closed'
        GROUP BY 1 ORDER BY 2 DESC`,
      [req.orgId],
    ),
    query(
      `SELECT d.decision, COUNT(*)::int AS n
         FROM case_decisions d
         JOIN v_fleet_cases c ON c.id = d.case_id
        WHERE c.org_id = $1
        GROUP BY 1 ORDER BY 2 DESC`,
      [req.orgId],
    ),
    // How long a case runs, opening to closing. The round-trip count that
    // Esvagt's CEO actually cares about needs referrals, so it is not here yet.
    query(
      `SELECT ROUND(AVG(EXTRACT(EPOCH FROM (closed_at - opened_at)) / 3600)::numeric, 1) AS avg_hours,
              COUNT(*)::int AS n
         FROM v_fleet_cases
        WHERE org_id = $1 AND status = 'closed'
          AND opened_at IS NOT NULL AND closed_at IS NOT NULL`,
      [req.orgId],
    ),
    query(
      `SELECT COUNT(*) FILTER (WHERE status = ANY($2::varchar[]))::int AS open_now,
              COUNT(*) FILTER (WHERE status = 'closed')::int            AS closed_total,
              COUNT(*) FILTER (WHERE status <> 'recording')::int        AS cases_total
         FROM v_fleet_cases
        WHERE org_id = $1`,
      [req.orgId, [...ACTIVE_STATUSES]],
    ),
  ]);

  res.json({
    outcomes: byOutcome.rows,
    decisions: decisions.rows,
    duration: latency.rows[0] ?? { avg_hours: null, n: 0 },
    totals: totals.rows[0] ?? { open_now: 0, closed_total: 0, cases_total: 0 },
    as_of: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// GET /fleet/activity — the report the office can actually be given today
//
// /fleet/board and /fleet/stats describe cases: open, overdue, closed, with an
// outcome. Production contains 264 cases, every one still `recording`, and no
// decisions at all — because promoting a case is a thing no client can do yet.
// Those endpoints are therefore correct and empty.
//
// This one reads sessions, which are populated: a thousand of them, four
// months, real ships. It answers the questions a shipowner actually asks —
// how much is this being used, by which vessels, in which languages, for what
// — without requiring any new behaviour from an officer at sea.
//
// Two disclosure rules are enforced here rather than trusted to the client:
//
//   1. A complaint is only ever reported as one of the 44 named pathways.
//      `fleet_pathway()` in the database maps anything else to 'Unclassified',
//      so the patient's own words cannot reach their employer even if this
//      handler is rewritten carelessly.
//
//   2. The complaint mix is fleet-wide and is NOT broken down by vessel. On an
//      eighteen-person standby vessel, "Capella: 1 x Mental Health Crisis"
//      names a person to the company that employs them.
// ---------------------------------------------------------------------------
const activityQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

/** Vessel labels that are too thin to stand alone in a per-ship breakdown. */
const MIN_VESSEL_SESSIONS = 1;

/**
 * The smallest number of reports a demographic category may be shown with.
 *
 * Age, sex, rank and nationality describe a person, and stop describing one
 * only because there are enough of them. On an eighteen-berth standby vessel,
 * "one female, 25-34, Filipino, in August" is a name — so a category below
 * this threshold is not returned at all, and the number of suppressed reports
 * is returned in its place.
 *
 * Enforced here rather than in the client: a rule that only exists in a React
 * component is one refactor away from not existing.
 */
const MIN_CELL = 5;

/**
 * Demographics are counted once per account, not once per report.
 *
 * There is no patient identifier in this system, deliberately — cases.patient_ref
 * is the officer's own words and is not a foreign key, because a crew roster
 * keyed to named individuals is a health register. The consequence is that
 * "the same patient twenty-nine times" and "twenty-nine different patients"
 * are indistinguishable.
 *
 * That is not hypothetical. On Esvagt, 29 of 31 reports recording a female
 * patient are one person — same first name, same date of birth, same
 * nationality, same account — a demonstration patient run repeatedly. Counted
 * raw, the dashboard would have told a shipowner that 69% of their patients
 * were women aged 25-34, all Danish.
 *
 * Counting distinct accounts is the conservative answer: it undercounts a ship
 * that genuinely saw several different people, and it cannot be inflated by
 * repetition. Given the choice, a fleet report should understate rather than
 * invent, and the card says what it is counting.
 */

interface Cell {
  label: string | null;
  n: number;
}

/**
 * Drop every category below MIN_CELL, and say how much was dropped.
 *
 * Reporting the suppressed total matters: a chart quietly missing its tail
 * reads as a complete picture, and the office would draw conclusions from a
 * denominator that is not the one on screen.
 */
function suppress(rows: Cell[]): { items: Cell[]; suppressed: number; hidden_categories: number } {
  const kept = rows.filter((r) => r.label !== null && r.n >= MIN_CELL);
  const dropped = rows.filter((r) => r.label === null || r.n < MIN_CELL);
  return {
    items: kept,
    suppressed: dropped.reduce((a, r) => a + r.n, 0),
    hidden_categories: dropped.length,
  };
}

fleetRouter.get('/activity', ...guard, async (req: Request, res: Response): Promise<void> => {
  // Express 4 does not catch a rejected async handler: without this the
  // request never answers and the browser hangs until it times out, which is
  // a far worse failure than a 500. Learned the hard way — a missing column
  // in the view left the dashboard spinning forever with no error on screen.
  try {
  const parsed = activityQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query', issues: parsed.error.issues });
    return;
  }
  const { from, to } = parsed.data;

  // requireRole has already established that this account belongs to an
  // organisation; confirm the organisation still exists before reporting on it.
  const org = await query<{ slug: string }>(
    `SELECT slug FROM partners WHERE id = $1`,
    [req.orgId],
  );
  if (org.rows.length === 0) {
    res.status(403).json({ error: 'Organisation not found' });
    return;
  }

  // Membership is org_id and nothing else.
  //
  // This used to fall back to matching users.company and the email domain, so
  // a fleet could be reported on before anyone was attached to it. That was a
  // mistake. `company` is free text a person typed at registration, and on
  // real data `LIKE 'esvagt%'` matched four accounts on gmail, hotmail and a
  // personal .dk address — 96 sessions, 90 of them Marina's own testing. They
  // would have appeared on Esvagt's own dashboard as Esvagt's usage, no matter
  // how carefully the seed script excluded them.
  //
  // Deciding which company a person belongs to is not a string comparison. It
  // is a deliberate act, recorded in org_id by seed-organisation.ts, and the
  // dashboard now shows exactly who was attached — which is auditable, and
  // wrong in a way somebody can find and fix rather than silently.
  const scope = `a.org_id = $1`;

  const params: unknown[] = [req.orgId];
  let window = '';
  if (from) {
    params.push(from);
    window += ` AND a.created_at >= $${params.length}`;
  }
  if (to) {
    params.push(to);
    window += ` AND a.created_at <= $${params.length}`;
  }
  const where = `WHERE ${scope}${window}`;

  const [byMonth, byVessel, byLanguage, byPathway, byMode, totals] = await Promise.all([
    query(
      `SELECT to_char(a.month, 'YYYY-MM') AS month,
              COUNT(*)::int                                      AS sessions,
              COUNT(*) FILTER (WHERE a.substantive)::int         AS substantive,
              COUNT(*) FILTER (WHERE a.has_report)::int          AS reports,
              COUNT(*) FILTER (WHERE a.red_flag)::int            AS red_flags,
              COUNT(DISTINCT a.vessel_name)::int                 AS vessels
         FROM v_fleet_activity a ${where}
        GROUP BY 1 ORDER BY 1`,
      params,
    ),
    query(
      `SELECT a.vessel_name,
              COUNT(*)::int                              AS sessions,
              COUNT(*) FILTER (WHERE a.substantive)::int AS substantive,
              COUNT(*) FILTER (WHERE a.red_flag)::int    AS red_flags,
              MAX(a.created_at)                          AS last_session_at
         FROM v_fleet_activity a ${where}
          AND a.vessel_name IS NOT NULL
        GROUP BY 1
       HAVING COUNT(*) >= ${MIN_VESSEL_SESSIONS}
        ORDER BY 2 DESC`,
      params,
    ),
    query(
      `SELECT a.patient_language AS language, COUNT(*)::int AS n
         FROM v_fleet_activity a ${where}
          AND a.patient_language IS NOT NULL
        GROUP BY 1 ORDER BY 2 DESC`,
      params,
    ),
    // Fleet-wide only. See rule 2 above — never grouped with vessel_name.
    query(
      `SELECT a.pathway, COUNT(*)::int AS n
         FROM v_fleet_activity a ${where}
          AND a.pathway <> 'Unclassified'
        GROUP BY 1 ORDER BY 2 DESC`,
      params,
    ),
    query(
      `SELECT a.mode, COUNT(*)::int AS n
         FROM v_fleet_activity a ${where}
        GROUP BY 1 ORDER BY 2 DESC`,
      params,
    ),
    query(
      `SELECT COUNT(*)::int                                        AS sessions,
              COUNT(DISTINCT a.vessel_name)::int                   AS vessels,
              COUNT(*) FILTER (WHERE a.substantive)::int           AS substantive,
              COUNT(*) FILTER (WHERE a.has_report)::int            AS reports,
              COUNT(*) FILTER (WHERE a.red_flag)::int              AS red_flags,
              COUNT(*) FILTER (WHERE a.pathway <> 'Unclassified')::int AS classified,
              MIN(a.created_at)                                    AS first_session_at,
              MAX(a.created_at)                                    AS last_session_at
         FROM v_fleet_activity a ${where}`,
      params,
    ),
  ]);

  // ---- the operational figures the printed report carried ---------------
  const [
    byHour, byDuration, byMismatch, byPort,
    byAge, bySex, byRank, byNationality, deranged,
    byDestination, byUrgency, extras, output,
  ] = await Promise.all([
    // When work happens. The printed report's most quoted operational fact —
    // 61% of consultations start in the forenoon watch.
    query(
      `SELECT EXTRACT(HOUR FROM a.created_at)::int AS hour, COUNT(*)::int AS n
         FROM v_fleet_activity a ${where}
        GROUP BY 1 ORDER BY 1`,
      params,
    ),
    // Percentiles, not a mean. Consultation length is heavily skewed — a
    // handful of long sessions drag an average somewhere no real consultation
    // sits, which is why the report quotes a median of 4 minutes against an
    // average of 8.2.
    query(
      `SELECT COUNT(*)::int AS n,
              ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY a.duration_minutes)::numeric, 1) AS median_minutes,
              ROUND(percentile_cont(0.25) WITHIN GROUP (ORDER BY a.duration_minutes)::numeric, 1) AS p25_minutes,
              ROUND(percentile_cont(0.75) WITHIN GROUP (ORDER BY a.duration_minutes)::numeric, 1) AS p75_minutes
         FROM v_fleet_activity a ${where} AND a.duration_minutes IS NOT NULL`,
      params,
    ),
    // The clearest number in the whole printed report for what Marina is for:
    // how often the officer and the patient had no language in common.
    query(
      `SELECT a.officer_language, a.patient_language, COUNT(*)::int AS n
         FROM v_fleet_activity a ${where}
          AND a.officer_language IS NOT NULL AND a.patient_language IS NOT NULL
          AND a.officer_language <> a.patient_language
        GROUP BY 1,2 ORDER BY 3 DESC LIMIT 8`,
      params,
    ),
    query(
      `SELECT a.nearest_port AS port, COUNT(*)::int AS n
         FROM v_fleet_activity a ${where} AND a.nearest_port IS NOT NULL
        GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
      params,
    ),
    // Demographics. Fleet-wide only — deliberately never grouped with
    // vessel_name, which is what makes the suppression threshold meaningful.
    query(
      `SELECT a.age_band AS label, COUNT(DISTINCT a.account_ref)::int AS n
         FROM v_fleet_activity a ${where} AND a.age_band IS NOT NULL
        GROUP BY 1 ORDER BY 1`,
      params,
    ),
    query(
      `SELECT a.sex AS label, COUNT(DISTINCT a.account_ref)::int AS n
         FROM v_fleet_activity a ${where} AND a.sex IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`,
      params,
    ),
    query(
      `SELECT a.rank_group AS label, COUNT(DISTINCT a.account_ref)::int AS n
         FROM v_fleet_activity a ${where} AND a.rank_group IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`,
      params,
    ),
    query(
      `SELECT a.nationality AS label, COUNT(DISTINCT a.account_ref)::int AS n
         FROM v_fleet_activity a ${where} AND a.nationality IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`,
      params,
    ),
    // Derangement. A rate over what was measured — never a reading, never a
    // person — so no suppression is needed.
    query(
      `SELECT COUNT(*) FILTER (WHERE a.abnormal_pulse)::int AS pulse,
              COUNT(*) FILTER (WHERE a.abnormal_bp)::int    AS bp,
              COUNT(*) FILTER (WHERE a.abnormal_resp)::int  AS resp,
              COUNT(*) FILTER (WHERE a.abnormal_spo2)::int  AS spo2,
              COUNT(*) FILTER (WHERE a.abnormal_temp)::int  AS temp,
              COUNT(*) FILTER (WHERE a.abnormal_pulse OR a.abnormal_bp OR a.abnormal_resp
                                  OR a.abnormal_spo2 OR a.abnormal_temp)::int AS any_abnormal
         FROM v_fleet_activity a ${where}`,
      params,
    ),
    query(
      `SELECT a.destination AS port, COUNT(*)::int AS n
         FROM v_fleet_activity a ${where} AND a.destination IS NOT NULL
        GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
      params,
    ),
    // Urgency, and the M-EWS band underneath it. Reported only for the
    // reports that carried an observation — a session where nothing was
    // measured has no urgency, and grading it "low" would invent reassurance.
    query(
      `SELECT a.urgency, COUNT(*)::int AS n,
              COUNT(*) FILTER (WHERE a.mews_score BETWEEN 0 AND 1)::int AS mews_0_1,
              COUNT(*) FILTER (WHERE a.mews_score BETWEEN 2 AND 3)::int AS mews_2_3,
              COUNT(*) FILTER (WHERE a.mews_score >= 4)::int            AS mews_4_plus
         FROM v_fleet_activity a ${where} AND a.urgency IS NOT NULL
        GROUP BY 1`,
      params,
    ),
    query(
      `SELECT COUNT(*) FILTER (WHERE a.is_injury)::int                       AS injuries,
              COUNT(*) FILTER (WHERE a.is_injury IS FALSE)::int              AS illnesses,
              COUNT(*) FILTER (WHERE a.has_vitals)::int                      AS with_vitals,
              COUNT(*) FILTER (WHERE a.officer_language IS NOT NULL
                                 AND a.patient_language IS NOT NULL
                                 AND a.officer_language <> a.patient_language)::int AS language_gap,
              COUNT(*) FILTER (WHERE a.officer_language IS NOT NULL
                                 AND a.patient_language IS NOT NULL)::int    AS language_known,
              -- The printed report's de-duplication: a scenario demonstrated
              -- forty times on one login counts once, so it cannot drown out
              -- forty real cases on forty ships.
              COUNT(DISTINCT (a.account_ref, a.pathway))
                FILTER (WHERE a.pathway <> 'Unclassified')::int              AS distinct_presentations,
              COUNT(*) FILTER (WHERE a.vital_pulse)::int                     AS vital_pulse,
              COUNT(*) FILTER (WHERE a.vital_bp)::int                        AS vital_bp,
              COUNT(*) FILTER (WHERE a.vital_resp)::int                      AS vital_resp,
              COUNT(*) FILTER (WHERE a.vital_spo2)::int                      AS vital_spo2,
              COUNT(*) FILTER (WHERE a.vital_temp)::int                      AS vital_temp,
              COUNT(*) FILTER (WHERE a.vital_pulse AND a.vital_bp AND a.vital_resp
                                 AND a.vital_spo2 AND a.vital_temp)::int     AS vital_full_set,
              COUNT(*) FILTER (WHERE a.has_past_history)::int                AS history_past,
              COUNT(*) FILTER (WHERE a.has_allergies)::int                   AS history_allergies,
              COUNT(*) FILTER (WHERE a.has_medications)::int                 AS history_medications,
              COUNT(*) FILTER (WHERE a.has_location)::int                    AS with_location,
              COUNT(*) FILTER (WHERE a.mews_score IS NOT NULL)::int          AS with_mews
         FROM v_fleet_activity a ${where}`,
      params,
    ),
    // What the ship did with the report. audit_logs is not part of the view —
    // it is scoped here by joining the organisation's own accounts.
    query(
      `SELECT l.event_type, COUNT(*)::int AS n
         FROM audit_logs l
         JOIN users u ON u.id = l.user_id
        WHERE u.org_id = $1
          AND l.event_type IN ('pdf_generated', 'pdf_emailed')
        GROUP BY 1`,
      [req.orgId],
    ),
  ]);

  const outputCounts = Object.fromEntries(
    (output.rows as { event_type: string; n: number }[]).map((r) => [r.event_type, r.n]),
  );

  const t = totals.rows[0] as Record<string, number | string | null>;

  res.json({
    by_month: byMonth.rows,
    by_vessel: byVessel.rows,
    by_language: byLanguage.rows,
    by_pathway: byPathway.rows,
    by_mode: byMode.rows,
    by_hour: byHour.rows,
    by_port: byPort.rows,
    by_destination: byDestination.rows,
    demographics: {
      age: suppress(byAge.rows as Cell[]),
      sex: suppress(bySex.rows as Cell[]),
      rank: suppress(byRank.rows as Cell[]),
      nationality: suppress(byNationality.rows as Cell[]),
      min_cell: MIN_CELL,
    },
    abnormal: deranged.rows[0] as Record<string, number>,
    by_urgency: byUrgency.rows,
    language_pairs: byMismatch.rows,
    duration: byDuration.rows[0] ?? { n: 0, median_minutes: null, p25_minutes: null, p75_minutes: null },
    operational: {
      ...(extras.rows[0] as Record<string, number>),
      pdfs_generated: outputCounts['pdf_generated'] ?? 0,
      pdfs_emailed: outputCounts['pdf_emailed'] ?? 0,
    },
    totals: t,
    // Stated, not hidden. Roughly half of chief_symptom in production is
    // '[silence]', a greeting, or noise from the transcriber, and a complaint
    // chart that quietly drops those would overstate what we know.
    coverage: {
      classified: Number(t?.classified ?? 0),
      sessions: Number(t?.sessions ?? 0),
    },
    // The office is never given the free-text symptom, so say so in the payload
    // rather than only in a code comment.
    redaction: 'pathway-only; unmatched complaints are reported as Unclassified',
    as_of: new Date().toISOString(),
  });
  } catch (err) {
    console.error('[fleet/activity]', (err as Error).message);
    res.status(500).json({ error: 'Could not build the fleet report' });
  }
});
