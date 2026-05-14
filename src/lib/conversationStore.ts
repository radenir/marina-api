import { query } from './db.js';
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

export async function createConversation(
  userId: string,
  state: InterviewState,
): Promise<string> {
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
  return result.rows[0].id;
}

export interface NoteTakerInsert {
  messages: { role: 'user' | 'assistant'; content: string }[];
  summary: unknown;
  patientLanguage: string;
  medicalOfficerLanguage: string;
  chiefSymptom: string | null;
}

export async function createNoteTakerConversation(
  userId: string,
  input: NoteTakerInsert,
): Promise<string> {
  const result = await query<{ id: string }>(
    `INSERT INTO conversations (
       user_id, chief_symptom, messages, extracted_summary,
       patient_language, medical_officer_language,
       mode, last_message_at
     ) VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, 'note_taker', NOW())
     RETURNING id`,
    [
      userId,
      input.chiefSymptom,
      JSON.stringify(input.messages),
      JSON.stringify(input.summary),
      input.patientLanguage,
      input.medicalOfficerLanguage,
    ],
  );
  return result.rows[0].id;
}

export interface NoteTakerSaveInput {
  messages: { role: 'user' | 'assistant'; content: string }[];
  patientLanguage: string;
  medicalOfficerLanguage: string;
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
): Promise<string> {
  const messagesJson = JSON.stringify(input.messages);
  const chiefSymptom = deriveNoteTakerChiefSymptom(input.messages);

  if (!conversationId) {
    const result = await query<{ id: string }>(
      `INSERT INTO conversations (
         user_id, chief_symptom, messages,
         patient_language, medical_officer_language,
         mode, last_message_at
       ) VALUES ($1, $2, $3::jsonb, $4, $5, 'note_taker', NOW())
       RETURNING id`,
      [
        userId,
        chiefSymptom,
        messagesJson,
        input.patientLanguage,
        input.medicalOfficerLanguage,
      ],
    );
    return result.rows[0].id;
  }

  await query(
    `UPDATE conversations
        SET messages              = $1::jsonb,
            chief_symptom         = COALESCE(chief_symptom, $2),
            patient_language      = $3,
            medical_officer_language = $4,
            last_message_at       = NOW()
      WHERE id = $5 AND user_id = $6 AND mode = 'note_taker'`,
    [
      messagesJson,
      chiefSymptom,
      input.patientLanguage,
      input.medicalOfficerLanguage,
      conversationId,
      userId,
    ],
  );
  return conversationId;
}

export async function updateFromChat(
  conversationId: string,
  userId: string,
  state: InterviewState,
): Promise<void> {
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
}

export async function updateFromExtract(
  conversationId: string,
  userId: string,
  summary: unknown,
): Promise<void> {
  await query(
    `UPDATE conversations
        SET extracted_summary = $1::jsonb,
            last_message_at   = NOW()
      WHERE id = $2 AND user_id = $3`,
    [JSON.stringify(summary), conversationId, userId],
  );
}
