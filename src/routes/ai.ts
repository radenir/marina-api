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
import { parallelExtract } from '../lib/medicalExtract.js';
import type { UserProfile } from '../lib/medicalExtract.js';
import { fillRmdFormPdftk, checkPdftkAvailable } from '../lib/pdftk.js';
import { mapSummaryToRmdFields, extractMedicationFields } from '../lib/rmdMapper.js';
import * as fs from 'fs';
import { query } from '../lib/db.js';
import { sendEmail } from '../lib/email.js';
import { config } from '../config.js';
import { sha256hex } from '../lib/tokens.js';
import type { AuditEventType } from '../types/index.js';
import { createFreshState } from '../lib/interviewTypes.js';
import { runAgent, generateGreeting } from '../lib/interviewAgent.js';

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

const translateRateLimit = rateLimit({
  prefix: 'ai-translate',
  limit: 100,
  windowSeconds: 60 * 60,
  keyFn: (req) => req.user!.id,
});

const extractRateLimit = rateLimit({
  prefix: 'ai-extract',
  limit: 20,
  windowSeconds: 60 * 60,
  keyFn: (req) => req.user!.id,
});

const pdfRateLimit = rateLimit({
  prefix: 'ai-pdf',
  limit: 10,
  windowSeconds: 60 * 60,
  keyFn: (req) => req.user!.id,
});

const pdfEmailRateLimit = rateLimit({
  prefix: 'ai-pdf-email',
  limit: 5,
  windowSeconds: 60 * 60,
  keyFn: (req) => req.user!.id,
});

const interviewRateLimit = rateLimit({
  prefix: 'ai-interview',
  limit: 100,
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

const LANG_MAP: Record<string, string> = {
  en: 'English', pl: 'Polish',     es: 'Spanish',    de: 'German',
  fr: 'French',  it: 'Italian',    pt: 'Portuguese',  ru: 'Russian',
  zh: 'Chinese', ja: 'Japanese',   da: 'Danish',      hi: 'Hindi',
  ur: 'Urdu',    fa: 'Farsi',      ar: 'Arabic',      tr: 'Turkish',
  nl: 'Dutch',   sv: 'Swedish',    no: 'Norwegian',   fi: 'Finnish',
  ko: 'Korean',  vi: 'Vietnamese', th: 'Thai',        id: 'Indonesian',
};
const LANG_CODES = Object.keys(LANG_MAP) as [string, ...string[]];

const TranslateSchema = z.object({
  text:     z.string().min(1).max(5000),
  fromLang: z.enum(LANG_CODES),
  toLang:   z.enum(LANG_CODES),
});

const ExtractSchema = z.object({
  conversation: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().min(1).max(10000),
    })
  ).min(1).max(100),
  userProfile: z.object({
    ship_name:       z.string().optional(),
    call_sign:       z.string().optional(),
    satellite_phone: z.string().optional(),
    company:         z.string().optional(),
    email:           z.string().optional(),
    first_name:      z.string().optional(),
    last_name:       z.string().optional(),
    date_of_birth:   z.string().optional(),
    gender:          z.string().optional(),
    nationality:     z.string().optional(),
  }).optional(),
});

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
// POST /ai/translate
// Middleware order: requireAuth → translateRateLimit → requireVerifiedEmail → requireActiveUser → handler
// ---------------------------------------------------------------------------

function createTranslationPrompt(fromLanguageName: string, toLanguageName: string): string {
  return `You are a professional accurate medical translator. You never change the meaning of the message and always translate accurately. If the user's message is in ${toLanguageName} translate to ${fromLanguageName}.
  If the user's message is in ${fromLanguageName} translate to ${toLanguageName}.

CRITICAL INSTRUCTIONS:
1. The user's message IS the text to translate
2. Translate it immediately to ${toLanguageName} or ${fromLanguageName}
3. Output ONLY the translation - nothing else
4. Do NOT ask "what text should I translate"
5. Do NOT say "here's the translation"
6. Do NOT add quotes or explanations
7. Just output the direct ${toLanguageName} or ${fromLanguageName} translation.
8. You never output translation in the same language as user's message.

SPECIAL RULES FOR MEDICAL TRANSLATION:
- This is a MEDICAL conversation - translate medical terms accurately
- Be extremely careful with symptom names (headache, sore throat, chest pain, etc.)
- Pay close attention to words indicating time/onset (suddenly, gradually, etc.)
- Preserve the exact medical meaning - do NOT guess or substitute similar words
- Translate everything to ${toLanguageName} with medical precision
- If you don't know how to translate output '-'
- CRITICAL: When translating language references (e.g., "in Polish", "he speaks German"), translate the language name literally - do NOT substitute with the target language

The text to translate will be in the user message. Start translating immediately with medical accuracy.`;
}

aiRouter.post(
  '/translate',
  requireAuth,
  translateRateLimit,
  requireVerifiedEmail,
  requireActiveUser,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = TranslateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const { text, fromLang, toLang } = parsed.data;

    if (fromLang === toLang) {
      res.status(400).json({ error: 'fromLang and toLang must be different' });
      return;
    }

    const fromLanguageName = LANG_MAP[fromLang];
    const toLanguageName = LANG_MAP[toLang];

    let translation: string;
    try {
      const completion = await nebius.chat.completions.create({
        model: config.nebius.model,
        temperature: 0.3,
        top_p: 0.9,
        max_tokens: 1000,
        messages: [
          { role: 'system', content: createTranslationPrompt(fromLanguageName, toLanguageName) },
          { role: 'user', content: text },
        ],
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        console.error('[ai/translate] empty response from Nebius');
        res.status(502).json({ error: 'Translation service unavailable' });
        return;
      }

      translation = content;
    } catch (err) {
      console.error('[ai/translate] Nebius API error:', (err as Error).message);
      res.status(502).json({ error: 'Translation service unavailable' });
      return;
    }

    await auditLog('text_translated', req, req.user!.id, {
      from_lang: fromLang,
      to_lang: toLang,
      char_count: text.length,
    });

    res.json({ translation });
  }
);

// ---------------------------------------------------------------------------
// POST /ai/extract
// Middleware order: requireAuth → extractRateLimit → requireVerifiedEmail → requireActiveUser → handler
// ---------------------------------------------------------------------------

aiRouter.post(
  '/extract',
  requireAuth,
  extractRateLimit,
  requireVerifiedEmail,
  requireActiveUser,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = ExtractSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const { conversation, userProfile } = parsed.data;

    let summary: Record<string, string | boolean>;
    try {
      summary = await parallelExtract(conversation, userProfile as UserProfile | undefined);
    } catch (err) {
      console.error('[ai/extract] extraction error:', (err as Error).message);
      res.status(502).json({ error: 'Extraction service unavailable' });
      return;
    }

    const fieldsPopulated = Object.values(summary).filter(v => v !== '' && v !== false && v !== null && v !== undefined).length;

    await auditLog('medical_record_extracted', req, req.user!.id, {
      message_count: conversation.length,
      fields_populated: fieldsPopulated,
    });

    res.json({ summary });
  }
);

// ---------------------------------------------------------------------------
// POST /ai/generate-pdf
// Middleware order: requireAuth → pdfRateLimit → requireVerifiedEmail → requireActiveUser → handler
// ---------------------------------------------------------------------------

const GeneratePdfSchema = z.object({
  summary: z.record(z.string(), z.union([z.string(), z.boolean(), z.null()])),
});

aiRouter.post(
  '/generate-pdf',
  requireAuth,
  pdfRateLimit,
  requireVerifiedEmail,
  requireActiveUser,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = GeneratePdfSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const available = await checkPdftkAvailable();
    if (!available) {
      res.status(503).json({ error: 'pdftk not available on this server' });
      return;
    }

    const { summary } = parsed.data;
    const medFields = extractMedicationFields(summary.currentMedications);
    const summaryWithMeds = { ...summary, ...medFields };
    const rmdFields = mapSummaryToRmdFields(summaryWithMeds);

    const outputPath = `/tmp/marina_rmd_${Date.now()}.pdf`;
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await fillRmdFormPdftk(rmdFields, outputPath);
    } catch (err) {
      console.error('[ai/generate-pdf] pdftk error:', (err as Error).message);
      res.status(502).json({ error: 'PDF generation failed' });
      return;
    } finally {
      try {
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      } catch { /* ignore cleanup errors */ }
    }

    const fieldsPopulated = Object.values(summary).filter(
      v => v !== '' && v !== false && v !== null && v !== undefined
    ).length;

    await auditLog('pdf_generated', req, req.user!.id, {
      fields_populated: fieldsPopulated,
      file_size_bytes: pdfBuffer.length,
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="rmd-maritime-medical-report.pdf"',
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  }
);

// ---------------------------------------------------------------------------
// POST /ai/email-pdf
// Middleware order: requireAuth → pdfEmailRateLimit → requireVerifiedEmail → requireActiveUser → handler
// ---------------------------------------------------------------------------

aiRouter.post(
  '/email-pdf',
  requireAuth,
  pdfEmailRateLimit,
  requireVerifiedEmail,
  requireActiveUser,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = GeneratePdfSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const available = await checkPdftkAvailable();
    if (!available) {
      res.status(503).json({ error: 'pdftk not available on this server' });
      return;
    }

    const { rows } = await query('SELECT email FROM users WHERE id = $1', [req.user!.id]);
    if (!rows[0]?.email) {
      res.status(500).json({ error: 'Could not retrieve user email' });
      return;
    }
    const userEmail: string = rows[0].email;

    const { summary } = parsed.data;
    const medFields = extractMedicationFields(summary.currentMedications);
    const summaryWithMeds = { ...summary, ...medFields };
    const rmdFields = mapSummaryToRmdFields(summaryWithMeds);

    const outputPath = `/tmp/marina_rmd_email_${Date.now()}.pdf`;
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await fillRmdFormPdftk(rmdFields, outputPath);
    } catch (err) {
      console.error('[ai/email-pdf] pdftk error:', (err as Error).message);
      res.status(502).json({ error: 'PDF generation failed' });
      return;
    } finally {
      try {
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      } catch { /* ignore cleanup errors */ }
    }

    const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    try {
      await sendEmail({
        to: userEmail,
        subject: 'Your RMD Maritime Medical Report',
        html: `<p>Please find your RMD maritime medical report attached.</p><p>Generated by Marina Health on ${dateStr}.</p>`,
        attachments: [
          {
            filename: 'rmd-maritime-medical-report.pdf',
            content: pdfBuffer,
            contentType: 'application/pdf',
          },
        ],
      });
    } catch (err) {
      console.error('[ai/email-pdf] sendEmail error:', (err as Error).message);
      res.status(502).json({ error: 'Failed to send email' });
      return;
    }

    const fieldsPopulated = Object.values(summary).filter(
      v => v !== '' && v !== false && v !== null && v !== undefined
    ).length;

    await auditLog('pdf_emailed', req, req.user!.id, {
      fields_populated: fieldsPopulated,
      file_size_bytes: pdfBuffer.length,
    });

    res.json({ message: 'Report sent to your email address' });
  }
);

// ---------------------------------------------------------------------------
// POST /ai/interview/chat
// Middleware order: requireAuth → interviewRateLimit → requireVerifiedEmail → requireActiveUser → handler
// ---------------------------------------------------------------------------

const InterviewDataSchema = z.object({
  vitals: z.array(z.object({
    type: z.string(),
    value: z.string(),
    unit: z.string(),
    timestamp: z.string(),
  })),
  investigations: z.array(z.object({
    marker: z.string(),
    question: z.string(),
    timestamp: z.string(),
  })),
  examFindings: z.array(z.object({
    marker: z.string(),
    finding: z.string(),
    questionNumber: z.number(),
    totalQuestions: z.number(),
    timestamp: z.string(),
  })),
});

const InterviewVariablesSchema = z.object({
  patientLanguage: z.string(),
  medicalOfficerLanguage: z.string(),
  symptom: z.string(),
  historyTaking: z.string(),
  associatedSymtpoms: z.string(),
  focusedPastMedicalHistory: z.string(),
  clinicalExamination: z.string(),
  investigations: z.string(),
  examinationInstructions: z.string(),
  examinationMarkers: z.string(),
}).catchall(z.unknown());

const InterviewStateSchema = z.object({
  stage: z.number().int().min(0).max(9),
  done: z.boolean(),
  report: z.string().nullable(),
  conversationHistory: z.array(z.record(z.unknown())).max(500),
  variables: InterviewVariablesSchema,
  data: InterviewDataSchema,
});

const InterviewChatSchema = z.object({
  state: InterviewStateSchema.nullable().optional(),
  message: z.string().min(1).max(2000).nullable().optional(),
  patientLanguage: z.string().max(50).optional(),
  medicalOfficerLanguage: z.string().max(50).optional(),
});

aiRouter.post(
  '/interview/chat',
  requireAuth,
  interviewRateLimit,
  requireVerifiedEmail,
  requireActiveUser,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = InterviewChatSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const { state, message, patientLanguage, medicalOfficerLanguage } = parsed.data;

    // Validate call combinations
    if (state == null && message) {
      res.status(400).json({ error: 'message must not be sent on first call' });
      return;
    }
    if (state != null && !message) {
      res.status(400).json({ error: 'message is required when state is provided' });
      return;
    }
    if (state != null && state.done === true) {
      res.status(400).json({ error: 'Interview already complete' });
      return;
    }

    let reply: string;
    let newState: ReturnType<typeof createFreshState>;

    try {
      if (state == null) {
        // First call — create fresh state and generate greeting
        const freshState = createFreshState(
          patientLanguage ?? 'English',
          medicalOfficerLanguage ?? 'English',
        );
        const result = await generateGreeting(freshState);
        reply = result.reply;
        newState = result.newState;
      } else {
        // Subsequent call — run agent with existing state
        const result = await runAgent(state as ReturnType<typeof createFreshState>, message as string);
        reply = result.reply;
        newState = result.newState;
      }
    } catch (err) {
      console.error('[ai/interview/chat] agent error:', (err as Error).message);
      res.status(502).json({ error: 'Interview service unavailable' });
      return;
    }

    await auditLog('interview_message_sent', req, req.user!.id, {
      stage: newState.stage,
      done: newState.done,
    });

    res.json({
      state: newState,
      reply,
      done: newState.done,
      ...(newState.done && newState.report ? { report: newState.report } : {}),
    });
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
