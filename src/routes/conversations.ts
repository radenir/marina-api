import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../lib/db';
import { requireAuth } from '../middleware/requireAuth';

export const conversationsRouter = Router();

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().datetime().optional(),
});

const uuidSchema = z.string().uuid();

interface ConversationSummaryRow {
  id: string;
  title: string | null;
  chief_symptom: string | null;
  interview_stage: string | null;
  patient_language: string;
  medical_officer_language: string;
  message_count: number;
  has_summary: boolean;
  created_at: Date;
  updated_at: Date;
  last_message_at: Date;
}

// ---------------------------------------------------------------------------
// GET /conversations
// List the authenticated user's conversations (summary fields only).
// Cursor pagination via ?before=<ISO timestamp>&limit=<1..100>.
// ---------------------------------------------------------------------------
conversationsRouter.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query', issues: parsed.error.issues });
    return;
  }
  const { limit, before } = parsed.data;

  const params: unknown[] = [req.user!.id];
  let cursorClause = '';
  if (before) {
    params.push(before);
    cursorClause = ` AND last_message_at < $${params.length}`;
  }
  params.push(limit);

  const result = await query<ConversationSummaryRow>(
    `SELECT id,
            title,
            chief_symptom,
            interview_stage,
            patient_language,
            medical_officer_language,
            jsonb_array_length(messages) AS message_count,
            (extracted_summary IS NOT NULL) AS has_summary,
            created_at,
            updated_at,
            last_message_at
       FROM conversations
      WHERE user_id = $1${cursorClause}
      ORDER BY last_message_at DESC
      LIMIT $${params.length}`,
    params,
  );

  const items = result.rows;
  const nextCursor =
    items.length === limit ? items[items.length - 1].last_message_at.toISOString() : null;

  res.json({ items, nextCursor });
});

// ---------------------------------------------------------------------------
// GET /conversations/:id
// Full conversation row, scoped to the authenticated user.
// ---------------------------------------------------------------------------
conversationsRouter.get('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const parsedId = uuidSchema.safeParse(req.params.id);
  if (!parsedId.success) {
    res.status(400).json({ error: 'Invalid conversation id' });
    return;
  }

  const result = await query(
    `SELECT id, title, chief_symptom, messages, reference_notifications,
            vital_signs, interview_stage, examination_progress, extracted_summary,
            patient_language, medical_officer_language,
            created_at, updated_at, last_message_at
       FROM conversations
      WHERE id = $1 AND user_id = $2`,
    [parsedId.data, req.user!.id],
  );

  const conversation = result.rows[0];
  if (!conversation) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }

  res.json({ conversation });
});
