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
