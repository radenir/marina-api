import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, transaction } from '../lib/db';
import { attachEncounter, logCaseEvent } from '../lib/caseStore';
import { buildTrend, type TrendEncounter } from '../lib/caseTrend';
import { rateLimit } from '../lib/rateLimit';
import { requireAuth } from '../middleware/requireAuth';
import { requireVerifiedActiveUser } from '../middleware/requireVerifiedActiveUser';

/**
 * The Case File.
 *
 * Cases are minted implicitly by sessions (see lib/caseStore) — there is
 * deliberately no POST /cases. What this router does is everything that
 * happens to a case *after* it exists: putting it on the officer's list,
 * running it, and recording how it ended.
 *
 * Scoped to the authenticated user throughout. The account is the vessel, so
 * user_id is the vessel filter; ownership lives in the WHERE clause rather
 * than in a check after the fact.
 */
export const casesRouter = Router();

const casesRateLimit = rateLimit({
  prefix: 'cases',
  limit: 2000,
  windowSeconds: 60 * 60,
  keyFn: (req) => req.user!.id,
});

const guard = [requireAuth, casesRateLimit, requireVerifiedActiveUser] as const;

/** Statuses that put a case on the officer's list. 'recording' is not one. */
const ACTIVE_STATUSES = ['open', 'awaiting_doctor', 'monitoring'] as const;
/** Statuses that still accept a new encounter. */
const ATTACHABLE_STATUSES = ['recording', ...ACTIVE_STATUSES] as const;
const TERMINAL_STATUSES = ['closed', 'discarded'] as const;

const OUTCOMES = [
  'resolved_aboard',
  'advised_remotely',
  'diverted',
  'evacuated',
  'repatriated',
  'unknown',
] as const;

/**
 * Event types a client may append. Lifecycle events (case_opened, case_closed,
 * encounter_recorded …) are written by this router alone — a client must not
 * be able to forge the record of what happened to a case.
 */
const CLIENT_EVENT_TYPES = [
  'observation_logged',
  'report_sent',
  'doctor_advice_recorded',
  'medicine_given',
  'note',
] as const;

const uuidSchema = z.string().uuid();

/**
 * Handlers below do their work inside a transaction and need to distinguish
 * "rolled back with a client error" from "succeeded". An explicit tagged
 * result keeps that distinction in the type system instead of throwing for
 * ordinary 400s and 404s.
 */
type RouteResult<T> =
  | { ok: true; body: T }
  | { ok: false; status: number; message: string };

const fail = (status: number, message: string) =>
  ({ ok: false, status, message }) as const;
const done = <T>(body: T) => ({ ok: true, body }) as const;

// ---------------------------------------------------------------------------
// GET /cases
//
// The list the officer picks from — and, because it is sorted by what is due,
// the reminder itself. No push, no scheduler: on a ship that is offline half
// the day, the screen they open is the only channel that reliably works.
// ---------------------------------------------------------------------------
const listQuerySchema = z.object({
  status: z
    .enum(['active', 'all', 'recording', ...ACTIVE_STATUSES, ...TERMINAL_STATUSES])
    .default('active'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().datetime().optional(),
});

casesRouter.get('/', ...guard, async (req: Request, res: Response): Promise<void> => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query', issues: parsed.error.issues });
    return;
  }
  const { status, limit, before } = parsed.data;

  const statuses =
    status === 'active'
      ? [...ACTIVE_STATUSES]
      : status === 'all'
        ? [...ATTACHABLE_STATUSES, ...TERMINAL_STATUSES]
        : [status];

  const params: unknown[] = [req.user!.id, statuses];
  let cursorClause = '';
  if (before) {
    params.push(before);
    cursorClause = ` AND k.created_at < $${params.length}`;
  }
  params.push(limit);

  // Active list is ordered by urgency; any other view is chronological, which
  // is also the only ordering the `before` cursor is meaningful against.
  const orderBy =
    status === 'active'
      ? `ORDER BY (k.next_check_due_at IS NOT NULL AND k.next_check_due_at <= NOW()) DESC,
                  k.next_check_due_at ASC NULLS LAST,
                  COALESCE(e.last_encounter_at, k.created_at) DESC`
      : 'ORDER BY k.created_at DESC';

  const result = await query(
    `SELECT k.id,
            k.patient_ref,
            k.status,
            k.severity,
            k.ship_name,
            k.call_sign,
            k.opened_at,
            k.next_check_due_at,
            k.outcome,
            k.closed_at,
            k.created_at,
            (k.next_check_due_at IS NOT NULL AND k.next_check_due_at <= NOW()) AS is_overdue,
            COALESCE(e.encounter_count, 0) AS encounter_count,
            e.last_encounter_at,
            e.chief_symptom
       FROM cases k
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int              AS encounter_count,
                MAX(c.last_message_at)     AS last_encounter_at,
                (ARRAY_AGG(c.chief_symptom ORDER BY c.encounter_seq DESC NULLS LAST)
                   FILTER (WHERE c.chief_symptom IS NOT NULL))[1] AS chief_symptom
           FROM conversations c
          WHERE c.case_id = k.id
       ) e ON TRUE
      WHERE k.user_id = $1
        AND k.status = ANY($2::varchar[])${cursorClause}
      ${orderBy}
      LIMIT $${params.length}`,
    params,
  );

  const items = result.rows;
  // Only chronological views can be paged — the urgency ordering has no cursor.
  const nextCursor =
    status !== 'active' && items.length === limit
      ? (items[items.length - 1].created_at as Date).toISOString()
      : null;

  res.json({ items, nextCursor });
});

// ---------------------------------------------------------------------------
// GET /cases/:id
// The case, its encounters in order, and its timeline.
// ---------------------------------------------------------------------------
casesRouter.get('/:id', ...guard, async (req: Request, res: Response): Promise<void> => {
  const parsedId = uuidSchema.safeParse(req.params.id);
  if (!parsedId.success) {
    res.status(400).json({ error: 'Invalid case id' });
    return;
  }
  const caseId = parsedId.data;

  const caseResult = await query(
    `SELECT id, patient_ref, status, severity, ship_name, call_sign,
            outcome, outcome_note, next_check_due_at,
            opened_at, closed_at, created_at, updated_at
       FROM cases
      WHERE id = $1 AND user_id = $2`,
    [caseId, req.user!.id],
  );

  const caseRow = caseResult.rows[0];
  if (!caseRow) {
    res.status(404).json({ error: 'Case not found' });
    return;
  }

  const [encounters, events] = await Promise.all([
    query(
      `SELECT id, encounter_seq, mode, chief_symptom, interview_stage,
              patient_language, medical_officer_language,
              jsonb_array_length(messages) AS message_count,
              (extracted_summary IS NOT NULL) AS has_summary,
              created_at, last_message_at
         FROM conversations
        WHERE case_id = $1 AND user_id = $2
        ORDER BY encounter_seq NULLS LAST, created_at`,
      [caseId, req.user!.id],
    ),
    query(
      // Ordered by seq, not created_at — events written in the same
      // transaction share a NOW() and would otherwise sort at random.
      `SELECT id, seq, event_type, conversation_id, payload, created_at
         FROM case_events
        WHERE case_id = $1
        ORDER BY seq`,
      [caseId],
    ),
  ]);

  res.json({
    case: caseRow,
    encounters: encounters.rows,
    events: events.rows,
  });
});

// ---------------------------------------------------------------------------
// GET /cases/:id/trend
//
// The vital-sign trend across a case's encounters — the chart that makes a
// second look worth taking. Deliberately reports numbers only: a score per
// encounter and the arithmetic difference from the previous one, with no
// judgement attached. Deciding that a patient is getting worse belongs to the
// Advisor and needs approval; drawing the line does not. See lib/caseTrend.
// ---------------------------------------------------------------------------
casesRouter.get('/:id/trend', ...guard, async (req: Request, res: Response): Promise<void> => {
  const parsedId = uuidSchema.safeParse(req.params.id);
  if (!parsedId.success) {
    res.status(400).json({ error: 'Invalid case id' });
    return;
  }
  const caseId = parsedId.data;

  const owned = await query(`SELECT 1 FROM cases WHERE id = $1 AND user_id = $2`, [
    caseId,
    req.user!.id,
  ]);
  if (owned.rowCount === 0) {
    res.status(404).json({ error: 'Case not found' });
    return;
  }

  const encounters = await query<TrendEncounter>(
    `SELECT id, encounter_seq, vital_signs, created_at, last_message_at
       FROM conversations
      WHERE case_id = $1 AND user_id = $2
      ORDER BY encounter_seq NULLS LAST, created_at`,
    [caseId, req.user!.id],
  );

  res.json({ case_id: caseId, points: buildTrend(encounters.rows) });
});

// ---------------------------------------------------------------------------
// PATCH /cases/:id
//
// Every transition a case can make. Two rules carry the product:
//
//   - promoting a case to the list requires naming the patient, because a row
//     the officer cannot recognise is a row they will not tap;
//   - closing a case requires an outcome. That is the whole of build item 1 —
//     "nobody writes down how it ended" is the gap being closed here, so the
//     API refuses to let a case finish silently.
// ---------------------------------------------------------------------------
const patchSchema = z
  .object({
    // The officer's own words. No crew roster, no foreign key.
    patient_ref: z.string().trim().min(1).max(120).optional(),
    // Officer-set, never computed from vitals: that judgement belongs to the
    // Advisor, which is the part needing medical device approval.
    //   1 routine · 2 keep an eye on it · 3 urgent, doctor now · 4 emergency
    // Deliberately left unconstrained in the DB so the scale can change
    // without a migration.
    severity: z.number().int().min(1).max(4).nullable().optional(),
    status: z.enum([...ACTIVE_STATUSES, ...TERMINAL_STATUSES]).optional(),
    next_check_due_at: z.string().datetime().nullable().optional(),
    outcome: z.enum(OUTCOMES).optional(),
    outcome_note: z.string().max(4000).nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

interface CaseStateRow {
  status: string;
  patient_ref: string | null;
  outcome: string | null;
}

casesRouter.patch('/:id', ...guard, async (req: Request, res: Response): Promise<void> => {
  const parsedId = uuidSchema.safeParse(req.params.id);
  if (!parsedId.success) {
    res.status(400).json({ error: 'Invalid case id' });
    return;
  }
  const parsedBody = patchSchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: 'Invalid body', issues: parsedBody.error.issues });
    return;
  }

  const caseId = parsedId.data;
  const userId = req.user!.id;
  const body = parsedBody.data;

  try {
    const result = await transaction<RouteResult<{ case: unknown }>>(async (client) => {
      // FOR UPDATE: two devices closing the same case must not interleave.
      const current = await client.query<CaseStateRow>(
        `SELECT status, patient_ref, outcome
           FROM cases
          WHERE id = $1 AND user_id = $2
          FOR UPDATE`,
        [caseId, userId],
      );

      const existing = current.rows[0];
      if (!existing) return fail(404, 'Case not found');

      const wasTerminal = (TERMINAL_STATUSES as readonly string[]).includes(existing.status);
      const nextStatus = body.status ?? existing.status;
      const isClosing = body.status === 'closed';
      const isDiscarding = body.status === 'discarded';
      const isReopening =
        wasTerminal && body.status !== undefined && !isClosing && !isDiscarding;

      // A terminal case only moves again by being explicitly reopened.
      if (wasTerminal && body.status === undefined) {
        return fail(400, `Case is ${existing.status}. Reopen it before editing.`);
      }

      const patientRef = body.patient_ref ?? existing.patient_ref;

      if ((ACTIVE_STATUSES as readonly string[]).includes(nextStatus) && !patientRef) {
        return fail(400, 'patient_ref is required to put a case on the list');
      }

      const outcome = body.outcome ?? existing.outcome;
      if (isClosing && !outcome) {
        return fail(400, 'outcome is required to close a case');
      }

      // Build the update from a whitelist, mirroring PUT /auth/me.
      const sets: string[] = [];
      const values: unknown[] = [];
      const set = (column: string, value: unknown) => {
        values.push(value);
        sets.push(`${column} = $${values.length}`);
      };

      if (body.patient_ref !== undefined) set('patient_ref', body.patient_ref);
      if (body.severity !== undefined) set('severity', body.severity);
      if (body.next_check_due_at !== undefined) set('next_check_due_at', body.next_check_due_at);
      if (body.outcome !== undefined) set('outcome', body.outcome);
      if (body.outcome_note !== undefined) set('outcome_note', body.outcome_note);

      if (body.status !== undefined) {
        set('status', body.status);

        if ((ACTIVE_STATUSES as readonly string[]).includes(body.status)) {
          // First promotion stamps opened_at; later status changes leave it.
          sets.push('opened_at = COALESCE(opened_at, NOW())');
        }
        if (isClosing) sets.push('closed_at = NOW()');
        if (isReopening) {
          // Reopening means it is not finished after all — the outcome goes.
          sets.push('closed_at = NULL', 'outcome = NULL', 'outcome_note = NULL');
        }
        if (isDiscarding) sets.push('closed_at = NOW()');
      }

      values.push(caseId, userId);
      const updated = await client.query(
        `UPDATE cases
            SET ${sets.join(', ')}
          WHERE id = $${values.length - 1} AND user_id = $${values.length}
        RETURNING id, patient_ref, status, severity, ship_name, call_sign,
                  outcome, outcome_note, next_check_due_at,
                  opened_at, closed_at, created_at, updated_at`,
        values,
      );

      // Timeline. Lifecycle transitions are named; plain edits are grouped.
      const owner = { userId };
      if (isReopening) {
        await logCaseEvent(client, caseId, 'case_reopened', {
          owner,
          payload: { from: existing.status, to: body.status },
        });
      } else if (isClosing) {
        await logCaseEvent(client, caseId, 'case_closed', {
          owner,
          payload: { outcome, outcome_note: body.outcome_note ?? null },
        });
      } else if (isDiscarding) {
        await logCaseEvent(client, caseId, 'case_discarded', { owner });
      } else if (body.status !== undefined && existing.status === 'recording') {
        await logCaseEvent(client, caseId, 'case_opened', {
          owner,
          payload: { patient_ref: patientRef, severity: body.severity ?? null },
        });
      } else if (body.status !== undefined) {
        await logCaseEvent(client, caseId, 'case_status_changed', {
          owner,
          payload: { from: existing.status, to: body.status },
        });
      }

      if (body.next_check_due_at !== undefined) {
        await logCaseEvent(client, caseId, 'check_scheduled', {
          owner,
          payload: { next_check_due_at: body.next_check_due_at },
        });
      }

      const edited = (['patient_ref', 'severity', 'outcome_note'] as const).filter(
        (k) => body[k] !== undefined,
      );
      if (edited.length > 0 && body.status === undefined) {
        await logCaseEvent(client, caseId, 'case_updated', {
          owner,
          payload: { fields: edited },
        });
      }

      return done({ case: updated.rows[0] });
    });

    if (!result.ok) {
      res.status(result.status).json({ error: result.message });
      return;
    }
    res.json(result.body);
  } catch (err) {
    console.error('[cases] patch failed:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /cases/:id/encounters
//
// Attach a session to this case — or move it here from another one. The move
// path is the undo for tapping the wrong row in the list, which someone will
// eventually do; making it reversible now is cheaper than a manual UPDATE
// against production later.
// ---------------------------------------------------------------------------
const attachSchema = z.object({ conversation_id: z.string().uuid() }).strict();

casesRouter.post(
  '/:id/encounters',
  ...guard,
  async (req: Request, res: Response): Promise<void> => {
    const parsedId = uuidSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      res.status(400).json({ error: 'Invalid case id' });
      return;
    }
    const parsedBody = attachSchema.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({ error: 'Invalid body', issues: parsedBody.error.issues });
      return;
    }

    const caseId = parsedId.data;
    const { conversation_id: conversationId } = parsedBody.data;
    const userId = req.user!.id;

    try {
      const result = await transaction<
        RouteResult<{ conversation_id: string; case_id: string; encounter_seq: number | null }>
      >(async (client) => {
        const target = await client.query<{ status: string }>(
          `SELECT status FROM cases WHERE id = $1 AND user_id = $2 FOR UPDATE`,
          [caseId, userId],
        );
        if (!target.rows[0]) return fail(404, 'Case not found');
        if (!(ATTACHABLE_STATUSES as readonly string[]).includes(target.rows[0].status)) {
          return fail(400, `Case is ${target.rows[0].status} and cannot take new encounters`);
        }

        const conversation = await client.query<{ case_id: string | null; mode: string }>(
          `SELECT case_id, mode FROM conversations WHERE id = $1 AND user_id = $2`,
          [conversationId, userId],
        );
        const conv = conversation.rows[0];
        if (!conv) return fail(404, 'Conversation not found');
        if (conv.mode === 'translator') {
          return fail(400, 'Translator sessions are not encounters');
        }
        if (conv.case_id === caseId) {
          return fail(409, 'Already an encounter on this case');
        }

        const seq = await attachEncounter(
          client,
          caseId,
          conversationId,
          { userId },
          conv.case_id ? 'encounter_moved' : 'encounter_recorded',
        );

        // Record the departure on the case it left, so neither timeline lies.
        if (conv.case_id) {
          await logCaseEvent(client, conv.case_id, 'encounter_moved', {
            owner: { userId },
            conversationId,
            payload: { to_case_id: caseId },
          });
        }

        return done({ conversation_id: conversationId, case_id: caseId, encounter_seq: seq });
      });

      if (!result.ok) {
        res.status(result.status).json({ error: result.message });
        return;
      }
      res.status(201).json(result.body);
    } catch (err) {
      console.error('[cases] attach encounter failed:', (err as Error).message);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// ---------------------------------------------------------------------------
// POST /cases/:id/events
// Append to the timeline: medicine given, advice received, a plain note.
// ---------------------------------------------------------------------------
const eventSchema = z
  .object({
    event_type: z.enum(CLIENT_EVENT_TYPES),
    conversation_id: z.string().uuid().optional(),
    payload: z.record(z.unknown()).optional(),
  })
  .strict();

casesRouter.post('/:id/events', ...guard, async (req: Request, res: Response): Promise<void> => {
  const parsedId = uuidSchema.safeParse(req.params.id);
  if (!parsedId.success) {
    res.status(400).json({ error: 'Invalid case id' });
    return;
  }
  const parsedBody = eventSchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: 'Invalid body', issues: parsedBody.error.issues });
    return;
  }

  const caseId = parsedId.data;
  const userId = req.user!.id;
  const { event_type: eventType, conversation_id: conversationId, payload } = parsedBody.data;

  try {
    const result = await transaction<RouteResult<{ ok: true }>>(async (client) => {
      const owned = await client.query(
        `SELECT 1 FROM cases WHERE id = $1 AND user_id = $2`,
        [caseId, userId],
      );
      if (owned.rowCount === 0) return fail(404, 'Case not found');

      if (conversationId) {
        const conv = await client.query(
          `SELECT 1 FROM conversations WHERE id = $1 AND user_id = $2`,
          [conversationId, userId],
        );
        if (conv.rowCount === 0) {
          return fail(404, 'Conversation not found');
        }
      }

      await logCaseEvent(client, caseId, eventType, {
        owner: { userId },
        conversationId: conversationId ?? null,
        payload: payload ?? null,
      });

      return done({ ok: true } as const);
    });

    if (!result.ok) {
      res.status(result.status).json({ error: result.message });
      return;
    }
    res.status(201).json(result.body);
  } catch (err) {
    console.error('[cases] append event failed:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});
