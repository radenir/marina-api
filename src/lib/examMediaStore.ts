import { query } from './db.js';
import type { AiAnswer } from './examMediaAnalyze.js';
import type { MediaAnswer } from './examMediaProtocols.js';

export interface ExamMediaRow {
  id: string;
  user_id: string;
  conversation_id: string | null;
  examination_id: number;
  shot_id: string;
  ai_answers: AiAnswer[];
  confirmed_answers: MediaAnswer[] | null;
  confirmed_at: string | null;
}

export async function insertExamMedia(row: {
  userId: string;
  conversationId: string | null;
  examinationId: number;
  shotId: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  model: string;
  qualityOk: boolean;
  qualityReason: string | null;
  aiAnswers: AiAnswer[];
}): Promise<string> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO exam_media
       (user_id, conversation_id, examination_id, shot_id, mime_type, byte_size, sha256,
        model, quality_ok, quality_reason, ai_answers)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [
      row.userId, row.conversationId, row.examinationId, row.shotId, row.mimeType, row.byteSize,
      row.sha256, row.model, row.qualityOk, row.qualityReason, JSON.stringify(row.aiAnswers),
    ],
  );
  return rows[0].id;
}

export async function getExamMediaForUser(id: string, userId: string): Promise<ExamMediaRow | null> {
  const { rows } = await query<ExamMediaRow>(
    `SELECT id, user_id, conversation_id, examination_id, shot_id, ai_answers, confirmed_answers, confirmed_at
       FROM exam_media WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return rows[0] ?? null;
}

export async function confirmExamMedia(
  id: string,
  userId: string,
  answers: MediaAnswer[],
  officerEdited: boolean,
): Promise<void> {
  await query(
    `UPDATE exam_media
        SET confirmed_answers = $3, officer_edited = $4, confirmed_at = NOW()
      WHERE id = $1 AND user_id = $2`,
    [id, userId, JSON.stringify(answers), officerEdited],
  );
}

/** Confirmed rows among `ids` that belong to `userId`, oldest first. Unconfirmed or foreign ids are skipped. */
export async function getConfirmedExamMedia(ids: string[], userId: string): Promise<ExamMediaRow[]> {
  if (!ids.length) return [];
  const { rows } = await query<ExamMediaRow>(
    `SELECT id, user_id, conversation_id, examination_id, shot_id, ai_answers, confirmed_answers, confirmed_at
       FROM exam_media
      WHERE id = ANY($1::uuid[]) AND user_id = $2 AND confirmed_at IS NOT NULL
      ORDER BY created_at`,
    [ids, userId],
  );
  return rows;
}

/** Attach note-taker photos to the conversation row once /v2/ai/extract has created it. */
export async function linkExamMediaToConversation(ids: string[], userId: string, conversationId: string): Promise<void> {
  if (!ids.length) return;
  await query(
    `UPDATE exam_media SET conversation_id = $3
      WHERE id = ANY($1::uuid[]) AND user_id = $2 AND conversation_id IS NULL`,
    [ids, userId, conversationId],
  );
}

/** Whether `conversationId` belongs to `userId` — guards linking a photo to someone else's conversation. */
export async function userOwnsConversation(conversationId: string, userId: string): Promise<boolean> {
  const { rows } = await query('SELECT 1 FROM conversations WHERE id = $1 AND user_id = $2', [conversationId, userId]);
  return rows.length > 0;
}
