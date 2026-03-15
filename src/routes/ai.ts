import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { toFile } from 'openai';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireActiveUser } from '../middleware/requireActiveUser.js';
import { requireVerifiedEmail } from '../middleware/requireVerifiedEmail.js';
import { rateLimit } from '../lib/rateLimit.js';
import { nebius } from '../lib/nebius.js';
import { whisper } from '../lib/whisper.js';
import { query } from '../lib/db.js';
import { config } from '../config.js';
import { sha256hex } from '../lib/tokens.js';
import type { AuditEventType } from '../types/index.js';

export const aiRouter = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress ?? 'unknown';
}

async function auditLog(
  event_type: AuditEventType,
  req: Request,
  user_id: string,
  metadata: Record<string, unknown> = {}
) {
  const ip = getIp(req);
  const ua = req.headers['user-agent'] ?? '';
  try {
    await query(
      `INSERT INTO audit_logs (user_id, event_type, ip_address_hash, user_agent_hash, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [user_id, event_type, sha256hex(ip), sha256hex(ua), JSON.stringify(metadata)]
    );
  } catch (err) {
    console.error('[audit] failed to write log:', (err as Error).message);
  }
}

// ---------------------------------------------------------------------------
// Rate limiter — keyed by user id (requireAuth runs first, so req.user is set)
// ---------------------------------------------------------------------------

const summarizeRateLimit = rateLimit({
  prefix: 'ai-summarize',
  limit: 20,
  windowSeconds: 60 * 60,
  keyFn: (req) => req.user!.id,
});

const transcribeRateLimit = rateLimit({
  prefix: 'ai-transcribe',
  limit: 50,
  windowSeconds: 60 * 60,
  keyFn: (req) => req.user!.id,
});

// ---------------------------------------------------------------------------
// Multer — memory storage, 25MB limit, audio MIME types only
// ---------------------------------------------------------------------------

const ALLOWED_AUDIO_MIME_TYPES = new Set([
  'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg',
  'audio/wav', 'audio/x-wav', 'audio/m4a', 'audio/x-m4a',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_AUDIO_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(Object.assign(new Error('Unsupported audio format'), { status: 400 }));
    }
  },
});

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const SummarizeSchema = z.object({
  conversation: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().min(1).max(10000),
    })
  ).min(1).max(100),
});

// ---------------------------------------------------------------------------
// POST /ai/summarize
// Middleware order: requireAuth → summarizeRateLimit → requireVerifiedEmail → requireActiveUser → handler
// ---------------------------------------------------------------------------

aiRouter.post(
  '/summarize',
  requireAuth,
  summarizeRateLimit,
  requireVerifiedEmail,
  requireActiveUser,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = SummarizeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const { conversation } = parsed.data;

    let summary: string;
    try {
      const completion = await nebius.chat.completions.create({
        model: config.nebius.model,
        temperature: 0.3,
        max_tokens: 200,
        messages: [
          {
            role: 'system',
            content: 'You are a medical assistant. Summarize the following conversation in exactly one concise sentence. Return only the sentence, no preamble.',
          },
          ...conversation,
        ],
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        console.error('[ai/summarize] empty response from Nebius');
        res.status(502).json({ error: 'AI service unavailable' });
        return;
      }

      summary = content;
    } catch (err) {
      console.error('[ai/summarize] Nebius API error:', (err as Error).message);
      res.status(502).json({ error: 'AI service unavailable' });
      return;
    }

    await auditLog('conversation_summarized', req, req.user!.id, {
      message_count: conversation.length,
    });

    res.json({ summary });
  }
);

// ---------------------------------------------------------------------------
// POST /ai/transcribe
// Middleware order: requireAuth → transcribeRateLimit → requireVerifiedEmail → requireActiveUser → upload.single('audio') → handler
// ---------------------------------------------------------------------------

aiRouter.post(
  '/transcribe',
  requireAuth,
  transcribeRateLimit,
  requireVerifiedEmail,
  requireActiveUser,
  upload.single('audio'),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: 'No audio file provided' });
      return;
    }

    const language = typeof req.body.language === 'string' && req.body.language.length === 2
      ? req.body.language
      : undefined;

    let transcription: string;
    try {
      const file = await toFile(req.file.buffer, req.file.originalname, {
        type: req.file.mimetype,
      });

      const result = await whisper.audio.transcriptions.create({
        model: config.whisper.model,
        file,
        ...(language ? { language } : {}),
      });
      if (!result.text) {
        console.error('[ai/transcribe] empty response from Whisper');
        res.status(502).json({ error: 'Transcription service unavailable' });
        return;
      }
      transcription = result.text;
    } catch (err) {
      console.error('[ai/transcribe] Whisper API error:', (err as Error).message);
      res.status(502).json({ error: 'Transcription service unavailable' });
      return;
    }

    await auditLog('audio_transcribed', req, req.user!.id, {
      size_bytes: req.file.size,
      language: language ?? 'auto',
    });

    res.json({ transcription });
  }
);

// ---------------------------------------------------------------------------
// Multer error handler (must be 4-arg middleware after routes)
// ---------------------------------------------------------------------------

aiRouter.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Audio file too large (max 25MB)' });
  }
  if (err.status === 400) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});
