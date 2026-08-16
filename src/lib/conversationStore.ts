import { query, transaction } from './db.js';
import { attachEncounter, resolveCase, stampCaseOrg, type CaseOwner } from './caseStore.js';
import type { InterviewState } from './interviewTypes.js';

function deriveChiefSymptom(state: InterviewState): string | null {
  const v = state.variables.symptom?.trim();
  if (v) return v.slice(0, 200);

  const firstUser = state.conversationHistory.find(
    (m) => (m as { role?: string }).role === 'user',
  );
  const content = (firstUser as { content?: string } | undefined)?.content;
  if (!content) return null;
  return content.split(/[.!?]/)[0].slice(0, 200);
}

/**
 * What a persistence call gives back. The caseId travels with the
 * conversationId so a client can promote the case, schedule the next check or
 * record the outcome without a second round trip to find out which case its
 * session landed in.
 */
export interface PersistResult {
  conversationId: string;
  caseId: string | null;
}

/**
 * Attach a conversation to a case, and never let that failure reach the
 * caller.
 *
 * The conversation row is written and committed *before* this runs. Cases are
 * new; the endpoints that persist conversations are not, and three live apps
 * depend on them. Wrapping the case work in its own transaction and swallowing
 * its errors means a fault anywhere in the case code — a missing table on a
 * half-finished deploy, a constraint we did not anticipate — costs a case
 * link, never the clinical record of what was said.
 *
 * A conversation with case_id IS NULL is the state every historical row is
 * already in, and scripts/backfill-cases.ts repairs exactly that.
 */
async function attachCaseBestEffort(
  owner: CaseOwner,
  conversationId: string,
  caseId?: string | null,
): Promise<string | null> {
  try {
    const resolved = await transaction(async (client) => {
      const inner = await resolveCase(client, owner, caseId);
      await attachEncounter(client, inner, conversationId, owner);
      return inner;
    });
    // Separate statement, after the case is safely committed.
    await stampCaseOrg(resolved, owner);
    return resolved;
  } catch (err) {
    console.error(
      `[conversationStore] case attach failed for conversation ${conversationId} ` +
        `(the conversation itself is saved): ${(err as Error).message}`,
    );
    return null;
  }
}

/** Read a conversation's case, returning null rather than throwing. */
async function lookupCaseId(conversationId: string): Promise<string | null> {
  try {
    const result = await query<{ case_id: string | null }>(
      'SELECT case_id FROM conversations WHERE id = $1',
      [conversationId],
    );
    return result.rows[0]?.case_id ?? null;
  } catch (err) {
    console.error('[conversationStore] case lookup failed:', (err as Error).message);
    return null;
  }
}

function projectFromState(state: InterviewState) {
  return {
    messages: JSON.stringify(state.conversationHistory),
    interview_stage: String(state.stage),
    vital_signs: JSON.stringify(state.data.vitals ?? []),
    examination_progress: JSON.stringify(state.data.examFindings ?? []),
    patient_language: state.variables.patientLanguage ?? 'en',
    medical_officer_language: state.variables.medicalOfficerLanguage ?? 'en',
    chief_symptom: deriveChiefSymptom(state),
  };
}

/**
 * `caseId` is passed when the officer started this session from an existing
 * case in their list; omitted for a fresh session, in which case a new
 * 'recording' case is minted.
 *
 * The conversation INSERT is unchanged and commits on its own; the case is
 * attached afterwards, best-effort. See attachCaseBestEffort.
 */
export async function createConversation(
  userId: string,
  state: InterviewState,
  caseId?: string | null,
): Promise<PersistResult> {
  const p = projectFromState(state);
  const fullState = JSON.stringify(state);

  const result = await query<{ id: string }>(
    `INSERT INTO conversations (
       user_id, chief_symptom, messages, vital_signs, examination_progress,
       interview_stage, patient_language, medical_officer_language,
       state, mode, last_message_at
     ) VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6, $7, $8, $9::jsonb, 'marina', NOW())
     RETURNING id`,
    [
      userId,
      p.chief_symptom,
      p.messages,
      p.vital_signs,
      p.examination_progress,
      p.interview_stage,
      p.patient_language,
      p.medical_officer_language,
      fullState,
    ],
  );

  const conversationId = result.rows[0].id;
  return {
    conversationId,
    caseId: await attachCaseBestEffort({ userId }, conversationId, caseId),
  };
}

export interface NoteTakerInsert {
  messages: { role: 'user' | 'assistant'; content: string }[];
  summary: unknown;
  patientLanguage: string;
  medicalOfficerLanguage: string;
  chiefSymptom: string | null;
}

/**
 * Owner of a note-taker conversation — either a Marina user or a partner
 * organization (B2B integration). At least one of `userId` or `partnerId`
 * must be set; the DB check constraint `conversations_owner_chk` enforces
 * this.
 */
export interface ConversationOwner {
  userId?: string | null;
  partnerId?: string | null;
  partnerUserRef?: string | null;
}

export async function createNoteTakerConversation(
  owner: ConversationOwner,
  input: NoteTakerInsert,
  caseId?: string | null,
): Promise<PersistResult> {
  const result = await query<{ id: string }>(
    `INSERT INTO conversations (
       user_id, partner_id, partner_user_ref,
       chief_symptom, messages, extracted_summary,
       patient_language, medical_officer_language,
       mode, last_message_at
     ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, 'note_taker', NOW())
     RETURNING id`,
    [
      owner.userId ?? null,
      owner.partnerId ?? null,
      owner.partnerUserRef ?? null,
      input.chiefSymptom,
      JSON.stringify(input.messages),
      JSON.stringify(input.summary),
      input.patientLanguage,
      input.medicalOfficerLanguage,
    ],
  );

  const conversationId = result.rows[0].id;
  return {
    conversationId,
    caseId: await attachCaseBestEffort(owner, conversationId, caseId),
  };
}

export type TranscriptionMode = 'note_taker' | 'translator';

export interface NoteTakerSaveInput {
  messages: { role: 'user' | 'assistant'; content: string }[];
  patientLanguage: string;
  medicalOfficerLanguage: string;
  mode?: TranscriptionMode;
}

function deriveNoteTakerChiefSymptom(
  messages: { role: string; content: string }[],
): string | null {
  const firstPatient = messages.find((m) => m.role === 'user');
  if (!firstPatient?.content) return null;
  return firstPatient.content.split(/[.!?]/)[0].slice(0, 200);
}

/**
 * Upsert the messages array on a note-taker conversation. Creates the row on
 * first call (no conversationId); updates it thereafter. Preserves the
 * existing extracted_summary so saves don't clobber a generated report.
 */
export async function saveNoteTaker(
  userId: string,
  conversationId: string | null,
  input: NoteTakerSaveInput,
  caseId?: string | null,
): Promise<PersistResult> {
  const messagesJson = JSON.stringify(input.messages);
  const chiefSymptom = deriveNoteTakerChiefSymptom(input.messages);
  const mode: TranscriptionMode = input.mode ?? 'note_taker';

  if (!conversationId) {
    const result = await query<{ id: string }>(
      `INSERT INTO conversations (
         user_id, chief_symptom, messages,
         patient_language, medical_officer_language,
         mode, last_message_at
       ) VALUES ($1, $2, $3::jsonb, $4, $5, $6, NOW())
       RETURNING id`,
      [
        userId,
        chiefSymptom,
        messagesJson,
        input.patientLanguage,
        input.medicalOfficerLanguage,
        mode,
      ],
    );

    const newId = result.rows[0].id;

    // A translator session is two people talking through the app, not a
    // patient being worked up. It never becomes a case.
    if (mode === 'translator') return { conversationId: newId, caseId: null };

    return {
      conversationId: newId,
      caseId: await attachCaseBestEffort({ userId }, newId, caseId),
    };
  }

  await query(
    `UPDATE conversations
        SET messages              = $1::jsonb,
            chief_symptom         = COALESCE(chief_symptom, $2),
            patient_language      = $3,
            medical_officer_language = $4,
            last_message_at       = NOW()
      WHERE id = $5 AND user_id = $6 AND mode = $7`,
    [
      messagesJson,
      chiefSymptom,
      input.patientLanguage,
      input.medicalOfficerLanguage,
      conversationId,
      userId,
      mode,
    ],
  );
  return { conversationId, caseId: await lookupCaseId(conversationId) };
}

export async function updateFromChat(
  conversationId: string,
  userId: string,
  state: InterviewState,
): Promise<string | null> {
  const p = projectFromState(state);
  const fullState = JSON.stringify(state);
  await query(
    `UPDATE conversations
        SET messages              = $1::jsonb,
            vital_signs           = $2::jsonb,
            examination_progress  = $3::jsonb,
            interview_stage       = $4,
            chief_symptom         = COALESCE($5, chief_symptom),
            patient_language      = $6,
            medical_officer_language = $7,
            state                 = $8::jsonb,
            last_message_at       = NOW()
      WHERE id = $9 AND user_id = $10`,
    [
      p.messages,
      p.vital_signs,
      p.examination_progress,
      p.interview_stage,
      p.chief_symptom,
      p.patient_language,
      p.medical_officer_language,
      fullState,
      conversationId,
      userId,
    ],
  );
  return lookupCaseId(conversationId);
}

export async function updateFromExtract(
  conversationId: string,
  userId: string,
  summary: unknown,
): Promise<string | null> {
  await query(
    `UPDATE conversations
        SET extracted_summary = $1::jsonb,
            last_message_at   = NOW()
      WHERE id = $2 AND user_id = $3`,
    [JSON.stringify(summary), conversationId, userId],
  );
  return lookupCaseId(conversationId);
}
