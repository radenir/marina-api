import type { PoolClient } from 'pg';
import { query } from './db.js';

/**
 * The Case File.
 *
 * A case outlives a single session. `conversations` rows are encounters
 * inside it: the first note-taker session, the check three days later, the
 * one after the doctor answered.
 *
 * Two distinct events, deliberately kept apart:
 *
 *   created — happens implicitly, the moment the first word is captured.
 *             Status 'recording'. Private to the ship, on no list, generating
 *             no reminders. Costs the officer nothing because they did not do
 *             anything to cause it.
 *
 *   opened  — happens on a deliberate act (naming the patient, setting a
 *             severity, sending the report ashore). Only then does the case
 *             count: it appears on the list and eventually owes an outcome.
 *
 * Without that split every translation session and mis-tap would land on the
 * office's fleet screen, and they would stop trusting it inside a week.
 *
 * Everything here takes an explicit PoolClient so the case row and the
 * conversation row commit together — see transaction() in ./db.
 */

/**
 * Owner of a case — either a Marina user or a partner organization (B2B
 * integration). Structurally identical to ConversationOwner in
 * ./conversationStore, and intentionally declared here rather than imported
 * so this module has no dependency back on its caller.
 */
export interface CaseOwner {
  userId?: string | null;
  partnerId?: string | null;
  partnerUserRef?: string | null;
}

/** Statuses a case can be in and still accept a new encounter. */
const ATTACHABLE_STATUSES = ['recording', 'open', 'awaiting_doctor', 'monitoring'];

export interface CaseEventOptions {
  owner?: CaseOwner;
  conversationId?: string | null;
  payload?: unknown;
}

/**
 * Append to the case timeline. Never throws on an unknown event_type — the
 * column is deliberately unconstrained, because losing the record is worse
 * than storing a value we did not anticipate.
 */
export async function logCaseEvent(
  client: PoolClient,
  caseId: string,
  eventType: string,
  opts: CaseEventOptions = {},
): Promise<void> {
  await client.query(
    `INSERT INTO case_events (
       case_id, event_type, actor_user_id, actor_partner_id,
       conversation_id, payload
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      caseId,
      eventType,
      opts.owner?.userId ?? null,
      opts.owner?.partnerId ?? null,
      opts.conversationId ?? null,
      opts.payload === undefined ? null : JSON.stringify(opts.payload),
    ],
  );
}

/**
 * Return the case this session belongs to, creating one if needed.
 *
 * `caseId` is supplied when the officer started from an existing case in the
 * list (encounter two, three, …) and omitted for a fresh session.
 *
 * A caseId that does not belong to this owner, or names a case already closed
 * or discarded, is logged and ignored rather than raising: the caller sits
 * inside a fail-open persistence block, and a fresh case is a far better
 * outcome than a session that fails to persist at all.
 *
 * ship_name and call_sign are copied off the owner's profile here and never
 * read live afterwards. Both are editable via PUT /auth/me, and a case must
 * not re-attribute itself to another vessel when someone corrects a typo.
 */
export async function resolveCase(
  client: PoolClient,
  owner: CaseOwner,
  caseId?: string | null,
): Promise<string> {
  if (caseId) {
    const existing = await client.query<{ id: string }>(
      `SELECT id
         FROM cases
        WHERE id = $1
          AND status = ANY($2::varchar[])
          AND (   (user_id    IS NOT NULL AND user_id    = $3)
               OR (partner_id IS NOT NULL AND partner_id = $4))`,
      [caseId, ATTACHABLE_STATUSES, owner.userId ?? null, owner.partnerId ?? null],
    );

    if (existing.rows[0]) return existing.rows[0].id;

    console.warn(
      `[caseStore] case ${caseId} is not open to this owner — creating a new case instead`,
    );
  }

  const created = await client.query<{ id: string }>(
    `INSERT INTO cases (
       user_id, partner_id, partner_user_ref, ship_name, call_sign
     ) VALUES (
       $1, $2, $3,
       (SELECT ship_name FROM users WHERE id = $1),
       (SELECT call_sign FROM users WHERE id = $1)
     )
     RETURNING id`,
    [owner.userId ?? null, owner.partnerId ?? null, owner.partnerUserRef ?? null],
  );

  const newCaseId = created.rows[0].id;
  await logCaseEvent(client, newCaseId, 'case_created', { owner });
  return newCaseId;
}

/**
 * Record which company a case belongs to.
 *
 * Deliberately its own statement outside the case transaction. Folding
 * `org_id` into the INSERT would mean that on a database where migration 016
 * has not run yet, creating a case fails — and with it the encounter link.
 * A case with no organisation is merely invisible to a fleet board that does
 * not exist yet; a case that was never created is lost.
 *
 * Frozen at creation for the same reason ship_name is: moving an account
 * between fleets must not rewrite which fleet a closed case belonged to.
 */
export async function stampCaseOrg(caseId: string, owner: CaseOwner): Promise<void> {
  try {
    await query(
      `UPDATE cases
          SET org_id = COALESCE((SELECT org_id FROM users WHERE id = $2), $3)
        WHERE id = $1 AND org_id IS NULL`,
      [caseId, owner.userId ?? null, owner.partnerId ?? null],
    );
  } catch (err) {
    console.error(`[caseStore] org stamp skipped for case ${caseId}: ${(err as Error).message}`);
  }
}

/**
 * Link a conversation to a case as the next encounter, and record it on the
 * timeline. Also used later to *move* an encounter between cases — the undo
 * for an officer tapping the wrong row in the list.
 *
 * The sequence subquery is evaluated against the pre-update snapshot, so the
 * first encounter on a case gets 1 and each subsequent one increments.
 */
export async function attachEncounter(
  client: PoolClient,
  caseId: string,
  conversationId: string,
  owner: CaseOwner,
  eventType: 'encounter_recorded' | 'encounter_moved' = 'encounter_recorded',
): Promise<number | null> {
  const updated = await client.query<{ encounter_seq: number | null }>(
    `UPDATE conversations
        SET case_id       = $1,
            encounter_seq = (SELECT COALESCE(MAX(encounter_seq), 0) + 1
                               FROM conversations
                              WHERE case_id = $1)
      WHERE id = $2
      RETURNING encounter_seq`,
    [caseId, conversationId],
  );

  const seq = updated.rows[0]?.encounter_seq ?? null;

  await logCaseEvent(client, caseId, eventType, {
    owner,
    conversationId,
    payload: { encounter_seq: seq },
  });

  return seq;
}
