import { Router, Request, Response } from 'express';
import { createHash } from 'crypto';
import { z } from 'zod';
import multer from 'multer';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireActiveUser } from '../middleware/requireActiveUser.js';
import { requireVerifiedEmail } from '../middleware/requireVerifiedEmail.js';
import { rateLimit } from '../lib/rateLimit.js';
import {
  EXAM_MEDIA_PROTOCOLS,
  getProtocol,
  getShot,
  isValidAnswer,
  type MediaAnswer,
} from '../lib/examMediaProtocols.js';
import { analyzeExamPhoto } from '../lib/examMediaAnalyze.js';
import {
  insertExamMedia,
  getExamMediaForUser,
  confirmExamMedia,
  userOwnsConversation,
} from '../lib/examMediaStore.js';

// Mounted at /ai/exam-media. The officer photographs the patient for an
// examination; the vision model answers the questions it can see; the officer
// confirms or corrects; /v2/ai/extract then writes the confirmed answers into
// the report's "exam" field. See lib/examMediaProtocols.ts for which photo
// answers which question.
export const examMediaRouter = Router();

const examMediaRateLimit = rateLimit({
  prefix: 'ai-exam-media',
  limit: 200,
  windowSeconds: 60 * 60,
  keyFn: (req) => req.user!.id,
});

// The vision model reads JPEG, PNG and WebP. iPhones shoot HEIC — the app
// converts to JPEG before upload (it also downsizes to ~1600 px, which keeps the
// upload small over a satellite link).
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(Object.assign(new Error('Unsupported image format — send JPEG, PNG or WebP'), { status: 400 }));
    }
  },
});

// ---------------------------------------------------------------------------
// GET /ai/exam-media/protocols?exams=2,21
// Which photos to take for each examination, and which questions each answers.
// Without `exams`, every examination that has a photo protocol.
// ---------------------------------------------------------------------------

examMediaRouter.get('/protocols', requireAuth, examMediaRateLimit, (req: Request, res: Response): void => {
  const requested = typeof req.query.exams === 'string'
    ? req.query.exams.split(',').map((s) => parseInt(s, 10)).filter((n) => !isNaN(n))
    : Object.keys(EXAM_MEDIA_PROTOCOLS).map(Number);

  const protocols = requested
    .map((id) => getProtocol(id))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => ({
      examinationId: p.examinationId,
      name: p.name,
      shots: p.shots,
      questions: Object.values(p.questions).map((q) => ({
        questionNumber: q.questionNumber,
        text: q.text,
        options: q.options,
        needsSide: q.needsSide,
      })),
    }));

  res.json({ protocols });
});

// ---------------------------------------------------------------------------
// POST /ai/exam-media/analyze   (multipart: image, examinationId, shotId, conversationId?)
// Analyses one photo. Returns the answers for the officer to confirm — nothing
// is written to a report here.
// Middleware order: requireAuth → examMediaRateLimit → requireVerifiedEmail → requireActiveUser → upload.single('image') → handler
// ---------------------------------------------------------------------------

const AnalyzeFields = z.object({
  examinationId: z.coerce.number().int(),
  shotId: z.string().min(1).max(50),
  conversationId: z.string().uuid().optional(),
});

examMediaRouter.post(
  '/analyze',
  requireAuth,
  examMediaRateLimit,
  requireVerifiedEmail,
  requireActiveUser,
  upload.single('image'),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: 'No image provided' });
      return;
    }
    const parsed = AnalyzeFields.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }
    const { examinationId, shotId, conversationId } = parsed.data;

    const protocol = getProtocol(examinationId);
    if (!protocol) {
      res.status(400).json({ error: `No photo protocol for examination ${examinationId}` });
      return;
    }
    const shot = getShot(protocol, shotId);
    if (!shot) {
      res.status(400).json({ error: `Unknown shot "${shotId}" for ${protocol.name}` });
      return;
    }
    const userId = req.user!.id;
    if (conversationId && !(await userOwnsConversation(conversationId, userId))) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    let result;
    try {
      result = await analyzeExamPhoto(req.file.buffer, req.file.mimetype, protocol, shot);
    } catch (err) {
      console.error('[ai/exam-media/analyze] vision error:', (err as Error).message);
      res.status(502).json({ error: 'Photo analysis unavailable — please answer the questions in the conversation' });
      return;
    }

    const mediaId = await insertExamMedia({
      userId,
      conversationId: conversationId ?? null,
      examinationId,
      shotId,
      mimeType: req.file.mimetype,
      byteSize: req.file.size,
      sha256: createHash('sha256').update(req.file.buffer).digest('hex'),
      model: result.model,
      qualityOk: result.quality.ok,
      qualityReason: result.quality.reason ?? null,
      aiAnswers: result.answers,
    });

    res.json({
      mediaId,
      examinationId,
      shotId,
      quality: result.quality.ok ? 'ok' : 'retake',
      qualityReason: result.quality.reason,
      answers: result.answers.map((a) => ({
        ...a,
        question: protocol.questions[a.questionNumber]?.text,
      })),
    });
  },
);

// ---------------------------------------------------------------------------
// POST /ai/exam-media/:mediaId/confirm
// The officer's checked answers. Questions the officer leaves out (or marks
// not_assessed) stay unanswered and are asked in the conversation.
// ---------------------------------------------------------------------------

const ConfirmSchema = z.object({
  answers: z.array(z.object({
    questionNumber: z.number().int(),
    status: z.enum(['answered', 'not_assessed']),
    value: z.string().max(40).optional(),
    side: z.enum(['left', 'right', 'both']).optional(),
    detail: z.string().max(200).optional(),
  })).max(20),
});

examMediaRouter.post(
  '/:mediaId/confirm',
  requireAuth,
  examMediaRateLimit,
  requireVerifiedEmail,
  requireActiveUser,
  async (req: Request, res: Response): Promise<void> => {
    const mediaId = z.string().uuid().safeParse(req.params.mediaId);
    const parsed = ConfirmSchema.safeParse(req.body);
    if (!mediaId.success || !parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.success ? undefined : parsed.error.flatten() });
      return;
    }

    const userId = req.user!.id;
    const row = await getExamMediaForUser(mediaId.data, userId);
    if (!row) {
      res.status(404).json({ error: 'Photo not found' });
      return;
    }
    const protocol = getProtocol(row.examination_id)!;
    const shot = getShot(protocol, row.shot_id);
    const allowed = new Set(shot?.answers ?? []);

    const confirmed: MediaAnswer[] = [];
    for (const a of parsed.data.answers) {
      if (a.status !== 'answered') continue;
      const answer: MediaAnswer = { questionNumber: a.questionNumber, value: a.value ?? '', side: a.side, detail: a.detail };
      if (!allowed.has(a.questionNumber) || !isValidAnswer(protocol, answer)) {
        res.status(400).json({ error: `Invalid answer for question ${a.questionNumber}` });
        return;
      }
      confirmed.push(answer);
    }

    // Edited = the officer changed, added or dropped anything the model answered.
    const ai = new Map(
      row.ai_answers.filter((a) => a.status === 'answered').map((a) => [a.questionNumber, a]),
    );
    const officerEdited =
      confirmed.length !== ai.size ||
      confirmed.some((c) => {
        const a = ai.get(c.questionNumber);
        return !a || a.value !== c.value || (a.side ?? null) !== (c.side ?? null);
      });

    await confirmExamMedia(row.id, userId, confirmed, officerEdited);
    res.json({ mediaId: row.id, confirmed, officerEdited });
  },
);
