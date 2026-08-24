import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { toFile } from 'openai';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireActiveUser } from '../middleware/requireActiveUser.js';
import { requireVerifiedEmail } from '../middleware/requireVerifiedEmail.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireScope } from '../middleware/requireScope.js';
import { requireVerifiedActiveUser } from '../middleware/requireVerifiedActiveUser.js';
import { allowAnonymous } from '../middleware/anonymous.js';
import { rateLimit } from '../lib/rateLimit.js';
import { nebius } from '../lib/nebius.js';
import { chatWithFallback } from '../lib/llmFallback.js';
import { whisper } from '../lib/whisper.js';
import { elevenLabsTranscribe, elevenLabsTextToSpeech } from '../lib/elevenlabs.js';
import { cortiTranscribe, isCortiConfigured } from '../lib/corti.js';
import { parallelExtract } from '../lib/medicalExtract.js';
import type { UserProfile } from '../lib/medicalExtract.js';
import { parallelExtractV2 } from '../lib/medicalExtractV2.js';
import { fillRmdFormPdftk, fillGermanFormPdftk, checkPdftkAvailable } from '../lib/pdftk.js';
import { mapSummaryToRmdFields, extractMedicationFields } from '../lib/rmdMapper.js';
import { mapSummaryToSeafarerFields } from '../lib/seafarerMapper.js';
import { mapSummaryToGermanFields } from '../lib/germanMapper.js';
import { fillSeafarerForm } from '../lib/seafarerPdf.js';
import * as fs from 'fs';
import { query } from '../lib/db.js';
import { enqueuePdfEmail } from '../lib/emailQueue.js';
import { config } from '../config.js';
import { sha256hex } from '../lib/tokens.js';
import type { AuditEventType } from '../types/index.js';
import { createFreshState } from '../lib/interviewTypes.js';
import { runAgent, generateGreeting } from '../lib/interviewAgent.js';
import { executeTool } from '../lib/interviewTools.js';
import { extractInterviewSummary } from '../lib/interviewExtract.js';
import { generateFollowups } from '../lib/reportFollowups.js';
import { generateExamFollowups } from '../lib/examFollowups.js';
import { scoreProblemDescription } from '../lib/problemScore.js';
import { scoreAllergies } from '../lib/allergyScore.js';
import { scoreMedications } from '../lib/medicationScore.js';
import { scoreAssociatedSymptoms } from '../lib/associatedSymptomsScore.js';
import { scorePastMedicalHistory } from '../lib/pastMedicalHistoryScore.js';
import { scoreInvestigations } from '../lib/investigationScore.js';
import { scorePhysicalExamination } from '../lib/physicalExaminationScore.js';
import { scoreVitalSigns } from '../lib/vitalSignsScore.js';
import { reviseField, REVISABLE_FIELDS } from '../lib/reviseField.js';
import { reviseVitals } from '../lib/reviseVitals.js';
import {
  createConversation,
  createNoteTakerConversation,
  saveNoteTaker,
  updateFromChat,
  updateFromExtract,
} from '../lib/conversationStore.js';

export const aiRouter = Router();

// Versioned router mounted at /v2/ai. Holds endpoints whose response shape
// diverges from the frozen v1 surface (e.g. the clean-split extract).
export const aiV2Router = Router();

// Router mounted at /free/ai for the free, no-login "basic" Note Taker: a small,
// tightly rate-limited subset (transcribe, extract, voice edits) reachable by a
// signed-out client. Nothing is persisted to any account and no premium
// features (judging, suggestions, port/ETA) are exposed here. See the route
// definitions near the bottom of this file.
export const aiFreeRouter = Router();

// The dedicated partner that owns anonymous (free) note-taker rows, so the
// transcript + report can be persisted like the paid flow without a schema
// change (conversations/cases require a user or partner owner). Seeded by
// migration 017 with this fixed id; overridable via env for other environments.
const FREE_ANON_PARTNER_ID =
  process.env.FREE_ANON_PARTNER_ID ?? '11111111-1111-4111-8111-111111111111';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Retry an async fn once after a short delay on any error. */
async function withRetry<T>(fn: () => Promise<T>, delayMs = 1500): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    await new Promise(r => setTimeout(r, delayMs));
    return await fn();
  }
}

function getIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress ?? 'unknown';
}

interface Attribution {
  userId?: string | null;
  partnerId?: string | null;
  apiClientId?: string | null;
}

function attributionFromPrincipal(req: Request): Attribution {
  const p = req.principal;
  if (!p) return {};
  if (p.type === 'user') return { userId: p.userId };
  if (p.type === 'partner') return { partnerId: p.partnerId, apiClientId: p.apiClientId };
  return {}; // anonymous — no user/partner attribution
}

/** Rate-limit key that works for user, partner and anonymous principals. */
function principalRateLimitKey(req: Request): string {
  const p = req.principal;
  if (!p) return getIp(req);
  if (p.type === 'user') return `u:${p.userId}`;
  if (p.type === 'anonymous') return `a:${p.deviceId}`;
  if (p.partnerUserRef) return `p:${p.apiClientId}:${p.partnerUserRef}`;
  return `p:${p.apiClientId}`;
}

async function auditLog(
  event_type: AuditEventType,
  req: Request,
  attribution: Attribution,
  metadata: Record<string, unknown> = {}
) {
  const ip = getIp(req);
  const ua = req.headers['user-agent'] ?? '';
  try {
    await query(
      `INSERT INTO audit_logs (user_id, partner_id, api_client_id, event_type, ip_address_hash, user_agent_hash, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        attribution.userId ?? null,
        attribution.partnerId ?? null,
        attribution.apiClientId ?? null,
        event_type,
        sha256hex(ip),
        sha256hex(ua),
        JSON.stringify(metadata),
      ]
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
  limit: 50,
  windowSeconds: 60 * 60,
  keyFn: (req) => req.user!.id,
});

const transcribeRateLimit = rateLimit({
  prefix: 'ai-transcribe',
  limit: 500,
  windowSeconds: 60 * 60,
  keyFn: principalRateLimitKey,
});

const medicalSpeechToTextRateLimit = rateLimit({
  prefix: 'ai-medical-speech-to-text',
  limit: 500,
  windowSeconds: 60 * 60,
  keyFn: (req) => req.user!.id,
});

const translateRateLimit = rateLimit({
  prefix: 'ai-translate',
  limit: 500,
  windowSeconds: 60 * 60,
  keyFn: (req) => req.user!.id,
});

const ttsRateLimit = rateLimit({
  prefix: 'ai-tts',
  limit: 500,
  windowSeconds: 60 * 60,
  keyFn: (req) => req.user!.id,
});

const extractRateLimit = rateLimit({
  prefix: 'ai-extract',
  limit: 50,
  windowSeconds: 60 * 60,
  keyFn: principalRateLimitKey,
});

const pdfRateLimit = rateLimit({
  prefix: 'ai-pdf',
  limit: 50,
  windowSeconds: 60 * 60,
  keyFn: principalRateLimitKey,
});

const pdfEmailRateLimit = rateLimit({
  prefix: 'ai-pdf-email',
  limit: 10,
  windowSeconds: 60 * 60,
  keyFn: principalRateLimitKey,
});

const interviewRateLimit = rateLimit({
  prefix: 'ai-interview',
  limit: 50000,
  windowSeconds: 60 * 60,
  keyFn: (req) => req.user!.id,
});

const interviewExtractRateLimit = rateLimit({
  prefix: 'ai-interview-extract',
  limit: 1000,
  windowSeconds: 60 * 60,
  keyFn: (req) => req.user!.id,
});

const noteTakerSaveRateLimit = rateLimit({
  prefix: 'ai-note-taker-save',
  limit: 20000,
  windowSeconds: 60 * 60,
  keyFn: (req) => req.user!.id,
});

const reportFollowupsRateLimit = rateLimit({
  prefix: 'ai-report-followups',
  limit: 200,
  windowSeconds: 60 * 60,
  keyFn: principalRateLimitKey,
});

const examFollowupsRateLimit = rateLimit({
  prefix: 'ai-exam-followups',
  limit: 200,
  windowSeconds: 60 * 60,
  keyFn: principalRateLimitKey,
});

const problemScoreRateLimit = rateLimit({
  prefix: 'ai-problem-score',
  limit: 500,
  windowSeconds: 60 * 60,
  keyFn: principalRateLimitKey,
});

const allergyScoreRateLimit = rateLimit({
  prefix: 'ai-allergy-score',
  limit: 500,
  windowSeconds: 60 * 60,
  keyFn: principalRateLimitKey,
});

const medicationScoreRateLimit = rateLimit({
  prefix: 'ai-medication-score',
  limit: 500,
  windowSeconds: 60 * 60,
  keyFn: principalRateLimitKey,
});

const associatedSymptomsScoreRateLimit = rateLimit({
  prefix: 'ai-associated-symptoms-score',
  limit: 500,
  windowSeconds: 60 * 60,
  keyFn: principalRateLimitKey,
});

const pastMedicalHistoryScoreRateLimit = rateLimit({
  prefix: 'ai-past-medical-history-score',
  limit: 500,
  windowSeconds: 60 * 60,
  keyFn: principalRateLimitKey,
});

const investigationScoreRateLimit = rateLimit({
  prefix: 'ai-investigation-score',
  limit: 500,
  windowSeconds: 60 * 60,
  keyFn: principalRateLimitKey,
});

const physicalExamScoreRateLimit = rateLimit({
  prefix: 'ai-physical-examination-score',
  limit: 500,
  windowSeconds: 60 * 60,
  keyFn: principalRateLimitKey,
});

const vitalSignsScoreRateLimit = rateLimit({
  prefix: 'ai-vital-signs-score',
  limit: 500,
  windowSeconds: 60 * 60,
  keyFn: principalRateLimitKey,
});

const reviseFieldRateLimit = rateLimit({
  prefix: 'ai-revise-field',
  limit: 500,
  windowSeconds: 60 * 60,
  keyFn: principalRateLimitKey,
});

const reviseVitalsRateLimit = rateLimit({
  prefix: 'ai-revise-vitals',
  limit: 500,
  windowSeconds: 60 * 60,
  keyFn: principalRateLimitKey,
});

// Free (no-login) tiers. Keyed by anonymous device id (falling back to IP via
// principalRateLimitKey), and set well below the authenticated limits: enough
// for a signed-out officer to try a real consultation, low enough to blunt
// abuse of the paid transcription/LLM backend by an un-authenticated caller.
// 300/hr: the Note Taker transcribes 15-second segments (~4 req/min), so 60/hr
// was only ~15 min of recording — a single real consultation exhausted it.
// 300/hr is ~75 min of recording per device per hour, keyed per install so each
// phone on a shared-IP vessel gets its own budget.
const freeTranscribeRateLimit = rateLimit({
  prefix: 'ai-free-transcribe',
  limit: 300,
  windowSeconds: 60 * 60,
  keyFn: principalRateLimitKey,
});

const freeExtractRateLimit = rateLimit({
  prefix: 'ai-free-extract',
  limit: 60,
  windowSeconds: 60 * 60,
  keyFn: principalRateLimitKey,
});

const freeReviseRateLimit = rateLimit({
  prefix: 'ai-free-revise',
  limit: 120,
  windowSeconds: 60 * 60,
  keyFn: principalRateLimitKey,
});

const freePdfRateLimit = rateLimit({
  prefix: 'ai-free-pdf',
  limit: 60,
  windowSeconds: 60 * 60,
  keyFn: principalRateLimitKey,
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
  uk: 'Ukrainian', el: 'Greek',    bg: 'Bulgarian',   hr: 'Croatian',
  cs: 'Czech',   sk: 'Slovak',     ro: 'Romanian',    hu: 'Hungarian',
  ms: 'Malay',   ta: 'Tamil',      tl: 'Filipino',   hy: 'Armenian',
};
const LANG_CODES = Object.keys(LANG_MAP) as [string, ...string[]];

/**
 * Resolve a language identifier to its full English name for prompt interpolation.
 * Clients send ISO codes ("en"), but the interview prompts read the value directly
 * ("Respond in X"). A bare code like "en" is misread by the model (it's also the
 * French word "in"), so Marina opens in a random language. Names are passed through
 * unchanged, so this is safe for already-resolved input and older clients.
 */
function resolveLanguageName(input: string | undefined): string {
  if (!input) return 'English';
  const lower = input.toLowerCase();
  if (LANG_MAP[lower]) return LANG_MAP[lower];
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'language' }).of(input);
    if (name && name.toLowerCase() !== lower) return name;
  } catch {
    // ignore — fall through to passthrough
  }
  return input;
}

const TranslateSchema = z.object({
  text:     z.string().min(1).max(5000),
  fromLang: z.enum(LANG_CODES),
  toLang:   z.enum(LANG_CODES),
});

const TtsSchema = z.object({
  text:     z.string().min(1).max(2000),
  language: z.enum(LANG_CODES),
});

const ExtractSchema = z.object({
  conversation: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().min(1).max(10000),
    })
  ).min(0).max(500),
  userProfile: z.object({
    // /auth/me returns unset profile columns as null (not omitted), so every
    // field must accept null as well as undefined or a real user hits 400.
    ship_name:       z.string().nullable().optional(),
    call_sign:       z.string().nullable().optional(),
    satellite_phone: z.string().nullable().optional(),
    company:         z.string().nullable().optional(),
    email:           z.string().nullable().optional(),
    first_name:      z.string().nullable().optional(),
    last_name:       z.string().nullable().optional(),
    date_of_birth:   z.string().nullable().optional(),
    gender:          z.string().nullable().optional(),
    nationality:     z.string().nullable().optional(),
  }).optional(),
  mewsScore: z.number().nullable().optional(),
  conversationId: z.string().uuid().optional(),
  // Set when the officer started this session from a case in their list;
  // omitted for a fresh session, which mints a new case.
  caseId: z.string().uuid().optional(),
  patientLanguage: z.string().max(20).optional(),
  medicalOfficerLanguage: z.string().max(20).optional(),
});

const SummarizeSchema = z.object({
  conversation: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().min(1).max(10000),
    })
  ).min(1).max(500),
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

    await auditLog('conversation_summarized', req, attributionFromPrincipal(req), {
      message_count: conversation.length,
    });

    res.json({ summary });
  }
);

// ---------------------------------------------------------------------------
// POST /ai/transcribe
// Accepts user JWT *or* partner API key (mk_live_...). Partners need the
// `transcribe:write` scope; their requests skip the email-verified/active-user
// checks because those are user-only concepts.
// Middleware order: authenticate → requireScope → transcribeRateLimit → requireVerifiedActiveUser → upload.single('audio') → handler
// ---------------------------------------------------------------------------

aiRouter.post(
  '/transcribe',
  authenticate,
  requireScope('transcribe:write'),
  transcribeRateLimit,
  requireVerifiedActiveUser,
  upload.single('audio'),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: 'No audio file provided' });
      return;
    }

    const language = typeof req.body.language === 'string' && req.body.language.length === 2
      ? req.body.language
      : undefined;

    const provider = config.transcriptionProvider;

    console.log('[ai/transcribe] request params:', {
      provider,
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      size_bytes: req.file.size,
      language: language ?? 'auto',
    });

    if (provider === 'elevenlabs' && !config.elevenlabs.apiKey) {
      res.status(503).json({ error: 'ElevenLabs not configured' });
      return;
    }

    let transcription: string;
    const t0 = Date.now();
    try {
      if (provider === 'elevenlabs') {
        transcription = await elevenLabsTranscribe(
          req.file.buffer,
          req.file.originalname,
          req.file.mimetype,
          language,
        );
      } else {
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
      }
    } catch (err) {
      console.error(`[ai/transcribe] ${provider} error:`, (err as Error).message);
      res.status(502).json({ error: 'Transcription service unavailable' });
      return;
    }

    console.log(`[ai/transcribe] response (${Date.now() - t0}ms):`, {
      chars: transcription.length,
      preview: transcription.slice(0, 120),
    });

    await auditLog('audio_transcribed', req, attributionFromPrincipal(req), {
      size_bytes: req.file.size,
      language: language ?? 'auto',
      provider,
    });

    res.json({ transcription });
  }
);

// ---------------------------------------------------------------------------
// POST /ai/medical-speech-to-text
// Corti-only Danish (and other Corti-supported) medical STT. Async multi-step:
// create interaction → upload recording → create transcript → poll until done.
// Middleware order: requireAuth → medicalSpeechToTextRateLimit → requireVerifiedEmail → requireActiveUser → upload.single('audio') → handler
// ---------------------------------------------------------------------------

aiRouter.post(
  '/medical-speech-to-text',
  requireAuth,
  medicalSpeechToTextRateLimit,
  requireVerifiedEmail,
  requireActiveUser,
  upload.single('audio'),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: 'No audio file provided' });
      return;
    }

    if (!isCortiConfigured()) {
      res.status(503).json({ error: 'Corti not configured' });
      return;
    }

    const language = typeof req.body.language === 'string' && req.body.language.length === 2
      ? req.body.language
      : 'da';

    console.log('[ai/medical-speech-to-text] request params:', {
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      size_bytes: req.file.size,
      language,
    });

    let transcription: string;
    const t0 = Date.now();
    try {
      transcription = await cortiTranscribe(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        language,
      );
    } catch (err) {
      console.error('[ai/medical-speech-to-text] corti error:', (err as Error).message);
      res.status(502).json({ error: 'Transcription service unavailable' });
      return;
    }

    console.log(`[ai/medical-speech-to-text] response (${Date.now() - t0}ms):`, {
      chars: transcription.length,
      preview: transcription.slice(0, 120),
    });

    await auditLog('audio_transcribed', req, attributionFromPrincipal(req), {
      size_bytes: req.file.size,
      language,
      provider: 'corti',
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
      const completion = await chatWithFallback({
        temperature: 0.3,
        top_p: 0.9,
        max_tokens: 1000,
        messages: [
          { role: 'system', content: createTranslationPrompt(fromLanguageName, toLanguageName) },
          { role: 'user', content: text },
        ],
      }, { primaryModel: config.nebius.translateModel });

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

    await auditLog('text_translated', req, attributionFromPrincipal(req), {
      from_lang: fromLang,
      to_lang: toLang,
      char_count: text.length,
    });

    res.json({ translation });
  }
);

// ---------------------------------------------------------------------------
// POST /ai/tts
// Synthesise speech (MP3) from already-translated text so the app can read the
// translation aloud in the other person's language.
// Middleware order: requireAuth → ttsRateLimit → requireVerifiedEmail → requireActiveUser → handler
// ---------------------------------------------------------------------------

aiRouter.post(
  '/tts',
  requireAuth,
  ttsRateLimit,
  requireVerifiedEmail,
  requireActiveUser,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = TtsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const { text, language } = parsed.data;

    let audio: Buffer;
    try {
      audio = await elevenLabsTextToSpeech(text, language);
    } catch (err) {
      console.error('[ai/tts] ElevenLabs error:', (err as Error).message);
      res.status(502).json({ error: 'Speech synthesis unavailable' });
      return;
    }

    await auditLog('text_to_speech', req, attributionFromPrincipal(req), {
      language,
      char_count: text.length,
      audio_bytes: audio.length,
    });

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audio.length,
      'Cache-Control': 'no-store',
    });
    res.send(audio);
  }
);

// ---------------------------------------------------------------------------
// POST /ai/extract
// Accepts user JWT *or* partner API key. Partners need `extract:write` scope.
// Partner traffic always creates a fresh note-taker conversation (no resume
// of marina interviews via partner key).
// Middleware order: authenticate → requireScope → extractRateLimit → requireVerifiedActiveUser → handler
// ---------------------------------------------------------------------------

aiRouter.post(
  '/extract',
  authenticate,
  requireScope('extract:write'),
  extractRateLimit,
  requireVerifiedActiveUser,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = ExtractSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const {
      conversation,
      userProfile,
      mewsScore,
      conversationId,
      caseId,
      patientLanguage,
      medicalOfficerLanguage,
    } = parsed.data;

    const principal = req.principal!;
    if (principal.type === 'anonymous') { res.status(401).json({ error: 'Unauthorized' }); return; }
    const isPartner = principal.type === 'partner';

    // Partners can't update existing marina-interview rows (those belong to
    // Marina users). They get a clean error rather than a silent miss.
    if (isPartner && conversationId) {
      res.status(400).json({ error: 'conversationId is not supported for partner authentication' });
      return;
    }

    let summary: Record<string, string | boolean>;
    try {
      summary = await parallelExtract(conversation, userProfile as UserProfile | undefined, mewsScore ?? null);
    } catch (err) {
      console.error('[ai/extract] extraction error:', (err as Error).message);
      res.status(502).json({ error: 'Extraction service unavailable' });
      return;
    }

    const fieldsPopulated = Object.values(summary).filter(v => v !== '' && v !== false && v !== null && v !== undefined).length;

    // Persistence has two paths:
    //   - conversationId present  → Marina interview, update the existing row.
    //   - conversationId missing  → note-taker, mint a new row now (owner is
    //                                either the calling user or the partner).
    let persistedId = conversationId ?? null;
    let resolvedCaseId: string | null = null;
    if (conversationId && principal.type === 'user') {
      try {
        resolvedCaseId = await updateFromExtract(conversationId, principal.userId, summary);
      } catch (err) {
        console.error('[ai/extract] conversation persist failed:', (err as Error).message);
      }
    } else {
      try {
        const chiefSymptomRaw =
          (typeof summary.chiefSymptom === 'string' && summary.chiefSymptom.trim()) ||
          (typeof summary.chiefComplaint === 'string' && summary.chiefComplaint.trim()) ||
          conversation.find((m) => m.role === 'user')?.content?.split(/[.!?]/)[0] ||
          null;
        const owner = principal.type === 'partner'
          ? { partnerId: principal.partnerId, partnerUserRef: principal.partnerUserRef ?? null }
          : { userId: principal.userId };
        const persisted = await createNoteTakerConversation(
          owner,
          {
            messages: conversation,
            summary,
            patientLanguage: patientLanguage ?? 'en',
            medicalOfficerLanguage: medicalOfficerLanguage ?? 'en',
            chiefSymptom: chiefSymptomRaw ? chiefSymptomRaw.slice(0, 200) : null,
          },
          caseId,
        );
        persistedId = persisted.conversationId;
        resolvedCaseId = persisted.caseId;
      } catch (err) {
        console.error('[ai/extract] note-taker persist failed:', (err as Error).message);
      }
    }

    await auditLog('medical_record_extracted', req, attributionFromPrincipal(req), {
      message_count: conversation.length,
      fields_populated: fieldsPopulated,
      conversation_id: persistedId,
      mode: conversationId ? 'marina' : 'note_taker',
    });

    res.json({ summary, conversationId: persistedId, caseId: resolvedCaseId });
  }
);

// ---------------------------------------------------------------------------
// POST /v2/ai/extract
// Same contract and middleware as POST /ai/extract, but returns a CLEAN SPLIT
// summary: problemDescription (history only), associatedSymptoms, pastHistory,
// allergies, currentMedications, investigations, exam, plus a dedicated
// mewsScore field — instead of v1's lumped `performedActions`. v1 is untouched
// so existing partner/client integrations keep working.
// Middleware order: authenticate → requireScope → extractRateLimit → requireVerifiedActiveUser → handler
// ---------------------------------------------------------------------------

aiV2Router.post(
  '/extract',
  authenticate,
  requireScope('extract:write'),
  extractRateLimit,
  requireVerifiedActiveUser,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = ExtractSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const {
      conversation,
      userProfile,
      mewsScore,
      conversationId,
      caseId,
      patientLanguage,
      medicalOfficerLanguage,
    } = parsed.data;

    const principal = req.principal!;
    if (principal.type === 'anonymous') { res.status(401).json({ error: 'Unauthorized' }); return; }
    const isPartner = principal.type === 'partner';

    if (isPartner && conversationId) {
      res.status(400).json({ error: 'conversationId is not supported for partner authentication' });
      return;
    }

    let summary: Record<string, string | boolean>;
    try {
      summary = await parallelExtractV2(conversation, userProfile as UserProfile | undefined, mewsScore ?? null);
    } catch (err) {
      console.error('[v2/ai/extract] extraction error:', (err as Error).message);
      res.status(502).json({ error: 'Extraction service unavailable' });
      return;
    }

    const fieldsPopulated = Object.values(summary).filter(v => v !== '' && v !== false && v !== null && v !== undefined).length;

    let persistedId = conversationId ?? null;
    let resolvedCaseId: string | null = null;
    if (conversationId && principal.type === 'user') {
      try {
        resolvedCaseId = await updateFromExtract(conversationId, principal.userId, summary);
      } catch (err) {
        console.error('[v2/ai/extract] conversation persist failed:', (err as Error).message);
      }
    } else {
      try {
        const chiefSymptomRaw =
          (typeof summary.chiefSymptom === 'string' && summary.chiefSymptom.trim()) ||
          (typeof summary.chiefComplaint === 'string' && summary.chiefComplaint.trim()) ||
          conversation.find((m) => m.role === 'user')?.content?.split(/[.!?]/)[0] ||
          null;
        const owner = principal.type === 'partner'
          ? { partnerId: principal.partnerId, partnerUserRef: principal.partnerUserRef ?? null }
          : { userId: principal.userId };
        const persisted = await createNoteTakerConversation(
          owner,
          {
            messages: conversation,
            summary,
            patientLanguage: patientLanguage ?? 'en',
            medicalOfficerLanguage: medicalOfficerLanguage ?? 'en',
            chiefSymptom: chiefSymptomRaw ? chiefSymptomRaw.slice(0, 200) : null,
          },
          caseId,
        );
        persistedId = persisted.conversationId;
        resolvedCaseId = persisted.caseId;
      } catch (err) {
        console.error('[v2/ai/extract] note-taker persist failed:', (err as Error).message);
      }
    }

    await auditLog('medical_record_extracted', req, attributionFromPrincipal(req), {
      message_count: conversation.length,
      fields_populated: fieldsPopulated,
      conversation_id: persistedId,
      mode: conversationId ? 'marina' : 'note_taker',
    });

    res.json({ summary, conversationId: persistedId, caseId: resolvedCaseId });
  }
);

// ---------------------------------------------------------------------------
// POST /ai/note-taker/save
// Persists note-taker transcripts incrementally so a session can be resumed
// or recovered without an extract. Creates the row on first call, updates it
// thereafter. Does not touch extracted_summary.
// Middleware order: requireAuth → noteTakerSaveRateLimit → requireVerifiedEmail → requireActiveUser → handler
// ---------------------------------------------------------------------------

const NoteTakerSaveSchema = z.object({
  conversationId: z.string().uuid().optional(),
  caseId: z.string().uuid().optional(),
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().min(1).max(10000),
    }),
  ).min(1).max(500),
  patientLanguage: z.string().max(20).optional(),
  medicalOfficerLanguage: z.string().max(20).optional(),
  mode: z.enum(['note_taker', 'translator']).optional(),
});

aiRouter.post(
  '/note-taker/save',
  requireAuth,
  noteTakerSaveRateLimit,
  requireVerifiedEmail,
  requireActiveUser,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = NoteTakerSaveSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const { conversationId, caseId, messages, patientLanguage, medicalOfficerLanguage, mode } =
      parsed.data;

    let persisted: { conversationId: string; caseId: string | null };
    try {
      persisted = await saveNoteTaker(
        req.user!.id,
        conversationId ?? null,
        {
          messages,
          patientLanguage: patientLanguage ?? 'en',
          medicalOfficerLanguage: medicalOfficerLanguage ?? 'en',
          mode,
        },
        caseId,
      );
    } catch (err) {
      console.error('[ai/note-taker/save] persist failed:', (err as Error).message);
      res.status(500).json({ error: 'Failed to save note-taker conversation' });
      return;
    }

    res.json({ conversationId: persisted.conversationId, caseId: persisted.caseId });
  },
);

// ---------------------------------------------------------------------------
// POST /ai/generate-pdf
// Accepts user JWT *or* partner API key. Partners need the `pdf:write` scope.
// Middleware order: authenticate → requireScope → pdfRateLimit → requireVerifiedActiveUser → handler
// ---------------------------------------------------------------------------

const GeneratePdfSchema = z.object({
  summary: z.record(z.string(), z.union([z.string(), z.boolean(), z.null()])),
  // Which PDF template to fill. Defaults to the RMD form for backward compatibility.
  template: z.enum(['rmd', 'marina', 'german']).optional().default('rmd'),
});

aiRouter.post(
  '/generate-pdf',
  authenticate,
  requireScope('pdf:write'),
  pdfRateLimit,
  requireVerifiedActiveUser,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = GeneratePdfSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const { summary, template } = parsed.data;

    // The Marina form is filled in-process with pdf-lib; the RMD and German
    // authority forms both need pdftk.
    if (template !== 'marina' && !(await checkPdftkAvailable())) {
      res.status(503).json({ error: 'pdftk not available on this server' });
      return;
    }

    const outputPath = `/tmp/marina_${template}_${Date.now()}.pdf`;
    let pdfBuffer: Buffer;
    try {
      if (template === 'marina') {
        pdfBuffer = await fillSeafarerForm(mapSummaryToSeafarerFields(summary), outputPath);
      } else if (template === 'german') {
        pdfBuffer = await fillGermanFormPdftk(mapSummaryToGermanFields(summary), outputPath);
      } else {
        const medFields = extractMedicationFields(summary.currentMedications);
        const rmdFields = mapSummaryToRmdFields({ ...summary, ...medFields });
        pdfBuffer = await fillRmdFormPdftk(rmdFields, outputPath);
      }
    } catch (err) {
      console.error(`[ai/generate-pdf] ${template} fill error:`, (err as Error).message);
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

    await auditLog('pdf_generated', req, attributionFromPrincipal(req), {
      fields_populated: fieldsPopulated,
      file_size_bytes: pdfBuffer.length,
    });

    const filename = template === 'marina'
      ? 'marina-seafarer-medical-report.pdf'
      : 'rmd-maritime-medical-report.pdf';
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  }
);

// ---------------------------------------------------------------------------
// POST /ai/email-pdf
// Accepts user JWT *or* partner API key. Partners need the `pdf:email` scope
// and MUST include `recipientEmail` in the body — there is no user record to
// fall back to. Users continue to receive the report at their own address.
// Middleware order: authenticate → requireScope → pdfEmailRateLimit → requireVerifiedActiveUser → handler
// ---------------------------------------------------------------------------

const EmailPdfSchema = GeneratePdfSchema.extend({
  recipientEmail: z.string().email().optional(),
});

aiRouter.post(
  '/email-pdf',
  authenticate,
  requireScope('pdf:email'),
  pdfEmailRateLimit,
  requireVerifiedActiveUser,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = EmailPdfSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const available = await checkPdftkAvailable();
    if (!available) {
      res.status(503).json({ error: 'pdftk not available on this server' });
      return;
    }

    const principal = req.principal!;
    if (principal.type === 'anonymous') { res.status(401).json({ error: 'Unauthorized' }); return; }
    let recipient: string;
    if (principal.type === 'user') {
      const { rows } = await query('SELECT email FROM users WHERE id = $1', [principal.userId]);
      if (!rows[0]?.email) {
        res.status(500).json({ error: 'Could not retrieve user email' });
        return;
      }
      recipient = rows[0].email;
    } else {
      if (!parsed.data.recipientEmail) {
        res.status(400).json({ error: 'recipientEmail is required when calling with a partner API key' });
        return;
      }
      recipient = parsed.data.recipientEmail;
    }

    const { summary, template } = parsed.data;

    await enqueuePdfEmail(recipient, summary, template);

    const fieldsPopulated = Object.values(summary).filter(
      v => v !== '' && v !== false && v !== null && v !== undefined
    ).length;

    await auditLog('pdf_emailed', req, attributionFromPrincipal(req), {
      fields_populated: fieldsPopulated,
      recipient_email: recipient,
    });

    res.json({
      message: principal.type === 'partner'
        ? `Report queued for delivery to ${recipient}`
        : 'Your report is being sent to your email address',
    });
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
  stage: z.number().int().min(1).max(9),
  done: z.boolean(),
  report: z.string().nullable(),
  conversationHistory: z.array(z.record(z.unknown())).max(500),
  variables: InterviewVariablesSchema,
  data: InterviewDataSchema,
  conversationId: z.string().uuid().optional(),
});

const InterviewChatSchema = z.object({
  state: InterviewStateSchema.nullable().optional(),
  caseId: z.string().uuid().optional(),
  message: z.string().min(1).max(2000).nullable().optional(),
  patientLanguage: z.string().max(50).optional(),
  medicalOfficerLanguage: z.string().max(50).optional(),
  skipStage: z.boolean().optional(),
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

    const { state, message, patientLanguage, medicalOfficerLanguage, skipStage, caseId } =
      parsed.data;

    // Validate call combinations
    if (state == null && message) {
      res.status(400).json({ error: 'message must not be sent on first call' });
      return;
    }
    if (state != null && !message && !skipStage) {
      res.status(400).json({ error: 'message is required when state is provided' });
      return;
    }
    if (state != null && state.done === true) {
      res.status(400).json({ error: 'Interview already complete' });
      return;
    }

    // Validate skip eligibility
    if (skipStage) {
      if (state == null) {
        res.status(400).json({ error: 'state is required to skip a stage' });
        return;
      }
      if (state.stage <= 1) {
        res.status(400).json({ error: 'Stage 1 (symptom identification) cannot be skipped' });
        return;
      }
      if (!state.variables?.symptom) {
        res.status(400).json({ error: 'Cannot skip: symptom has not been identified yet' });
        return;
      }
    }

    let reply: string;
    let newState: ReturnType<typeof createFreshState>;

    try {
      if (state == null) {
        // First call — create fresh state and generate greeting
        const freshState = createFreshState(
          resolveLanguageName(patientLanguage),
          resolveLanguageName(medicalOfficerLanguage),
        );
        const result = await withRetry(() => generateGreeting(freshState));
        reply = result.reply;
        // Store the greeting in history so the LLM knows it was already sent
        // and doesn't repeat "How can I help you today?" on the first user message.
        newState = {
          ...result.newState,
          conversationHistory: [
            ...result.newState.conversationHistory,
            { role: 'assistant', content: reply },
          ],
        } as typeof result.newState;
      } else if (skipStage) {
        // Skip current stage: advance via completeStage then open the new stage.
        const { newState: advancedState } = executeTool('completeStage', {}, state as ReturnType<typeof createFreshState>);
        const isMOStage = advancedState.stage >= 7;

        const SKIP_STAGE_NAMES: Record<number, string> = {
          2: 'History Taking', 3: 'Associated Symptoms', 4: 'Past Medical History',
          5: 'Medications', 6: 'Allergies', 7: 'Vital Signs', 8: 'Investigations', 9: 'Physical Exam',
        };
        const newStageLabel = SKIP_STAGE_NAMES[advancedState.stage] ?? `Stage ${advancedState.stage}`;

        // Inject a "closed" marker so the LLM treats any unanswered questions as resolved.
        // Without this the LLM sees the unanswered question in history and tries to fill it in
        // instead of asking the first question of the new stage.
        const stateWithCloseMarker = {
          ...advancedState,
          conversationHistory: [
            ...advancedState.conversationHistory,
            { role: 'user', content: '[Stage was skipped by the user. Any question left unanswered above is permanently closed. Do not ask it again.]' },
          ],
        } as ReturnType<typeof createFreshState>;

        const stageTrigger = isMOStage
          ? `[Stage skip: now in ${newStageLabel}. All prior stages are closed. Respond in ${advancedState.variables.medicalOfficerLanguage} only. Ask the first question of ${newStageLabel} now.]`
          : `[Stage skip: now in ${newStageLabel}. All prior stages are closed — do NOT ask questions from any previous stage. Ask ONLY the first question of ${newStageLabel} now.]`;

        const result = await withRetry(() => runAgent(stateWithCloseMarker, stageTrigger));
        reply = result.reply;
        newState = result.newState;
      } else {
        // Subsequent call — run agent with existing state
        const result = await withRetry(() => runAgent(state as ReturnType<typeof createFreshState>, message as string));
        reply = result.reply;
        newState = result.newState;
      }
    } catch (err) {
      console.error('[ai/interview/chat] agent error:', (err as Error).message);
      res.status(502).json({ error: 'Interview service unavailable' });
      return;
    }

    // Persist conversation to DB so reports.marinahealth.eu can read it.
    // Failures here must never break the chat response — log and continue.
    let conversationId = state?.conversationId;
    let resolvedCaseId: string | null = null;
    try {
      if (!conversationId) {
        const persisted = await createConversation(req.user!.id, newState, caseId);
        conversationId = persisted.conversationId;
        resolvedCaseId = persisted.caseId;
      } else {
        resolvedCaseId = await updateFromChat(conversationId, req.user!.id, newState);
      }
      (newState as typeof newState & { conversationId: string }).conversationId = conversationId;
    } catch (err) {
      console.error('[ai/interview/chat] conversation persist failed:', (err as Error).message);
    }

    await auditLog('interview_message_sent', req, attributionFromPrincipal(req), {
      stage: newState.stage,
      done: newState.done,
      conversation_id: conversationId,
    });

    res.json({
      state: newState,
      reply,
      done: newState.done,
      caseId: resolvedCaseId,
      ...(newState.done && newState.report ? { report: newState.report } : {}),
    });
  }
);

// ---------------------------------------------------------------------------
// POST /ai/interview/extract
// Extracts a structured clinical summary from a completed (or in-progress)
// interview state. One LLM call — no batching.
// Middleware order: requireAuth → interviewExtractRateLimit → requireVerifiedEmail → requireActiveUser → handler
// ---------------------------------------------------------------------------

const InterviewExtractSchema = z.object({
  conversationHistory: z.array(z.record(z.unknown())).min(1).max(500),
  conversationId: z.string().uuid().optional(),
});

aiRouter.post(
  '/interview/extract',
  requireAuth,
  interviewExtractRateLimit,
  requireVerifiedEmail,
  requireActiveUser,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = InterviewExtractSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const { conversationHistory, conversationId } = parsed.data;

    let summary;
    try {
      summary = await extractInterviewSummary(
        conversationHistory as import('../lib/interviewExtract.js').ConversationMessage[],
      );
    } catch (err) {
      console.error('[ai/interview/extract] extraction error:', (err as Error).message);
      res.status(502).json({ error: 'Extraction service unavailable' });
      return;
    }

    if (conversationId) {
      try {
        await updateFromExtract(conversationId, req.user!.id, summary);
      } catch (err) {
        console.error('[ai/interview/extract] conversation persist failed:', (err as Error).message);
      }
    }

    await auditLog('medical_record_extracted', req, attributionFromPrincipal(req), {
      message_count: conversationHistory.length,
      conversation_id: conversationId,
    });

    res.json({ summary });
  }
);

// ---------------------------------------------------------------------------
// POST /ai/report/followups
// Returns exactly 3 patient-facing follow-up questions the officer can ask
// to improve the report before sending it. Each question and its section
// label are returned in both the officer's language (question /
// sectionLabel) and the patient's language (questionPatient /
// sectionLabelPatient) so the UI can flip between the two without an
// extra translation round-trip.
// Accepts user JWT or partner API key (requires extract:write scope).
// ---------------------------------------------------------------------------

const ReportFollowupsSchema = z.object({
  conversation: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).min(0).max(500),
  summary: z.record(z.unknown()),
  medicalOfficerLanguage: z.string().min(2).max(20),
  patientLanguage: z.string().min(2).max(20),
  symptom: z.string().max(200).optional(),
  protocol: z.object({
    historyTaking: z.string().optional(),
    investigations: z.string().optional(),
    examinationInstructions: z.string().optional(),
  }).optional(),
  mode: z.enum(['marina', 'note_taker', 'translator']),
  conversationId: z.string().uuid().optional(),
  closedQuestions: z.array(z.string().max(500)).max(50).optional(),
  sections: z.array(z.enum([
    'history_taking',
    'associated_symptoms',
    'past_medical_history',
    'medications',
    'allergies',
  ])).max(5).optional(),
});

aiRouter.post(
  '/report/followups',
  authenticate,
  requireScope('extract:write'),
  reportFollowupsRateLimit,
  requireVerifiedActiveUser,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = ReportFollowupsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    if (req.principal?.type === 'partner' && parsed.data.conversationId) {
      res.status(400).json({ error: 'conversationId is not supported for partner authentication' });
      return;
    }

    let result;
    try {
      result = await generateFollowups(parsed.data);
    } catch (err) {
      console.error('[ai/report/followups] generation error:', (err as Error).message);
      res.status(502).json({ error: 'Followups service unavailable' });
      return;
    }

    await auditLog('report_followups_generated', req, attributionFromPrincipal(req), {
      conversation_id: parsed.data.conversationId ?? null,
      mode: parsed.data.mode,
    });

    res.json(result);
  }
);

// ---------------------------------------------------------------------------
// POST /ai/report/exam-followups
// Returns up to 3 officer-facing physical-examination questions for the
// chief complaint that have not been asked yet. The candidate set is
// deterministic (parsed from examinationInstructions and filtered by the
// caller's askedExamQuestions); an LLM pass then picks the most clinically
// useful and translates them into the medical officer's language. Each pick
// returns examName + questionNumber so the frontend can attach a video.
// Accepts user JWT or partner API key (requires extract:write scope).
// ---------------------------------------------------------------------------

const ExamFollowupsSchema = z.object({
  conversation: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).min(0).max(500),
  summary: z.record(z.unknown()),
  medicalOfficerLanguage: z.string().min(2).max(20),
  patientLanguage: z.string().min(2).max(20),
  symptom: z.string().max(200).optional(),
  mode: z.enum(['marina', 'note_taker', 'translator']),
  conversationId: z.string().uuid().optional(),
  askedExamQuestions: z.array(z.object({
    examName: z.string().max(200),
    questionNumber: z.number().int().min(1).max(100),
  })).max(200).optional(),
});

aiRouter.post(
  '/report/exam-followups',
  authenticate,
  requireScope('extract:write'),
  examFollowupsRateLimit,
  requireVerifiedActiveUser,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = ExamFollowupsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    if (req.principal?.type === 'partner' && parsed.data.conversationId) {
      res.status(400).json({ error: 'conversationId is not supported for partner authentication' });
      return;
    }

    let result;
    try {
      result = await generateExamFollowups(parsed.data);
    } catch (err) {
      console.error('[ai/report/exam-followups] generation error:', (err as Error).message);
      res.status(502).json({ error: 'Exam followups service unavailable' });
      return;
    }

    await auditLog('exam_followups_generated', req, attributionFromPrincipal(req), {
      conversation_id: parsed.data.conversationId ?? null,
      mode: parsed.data.mode,
      symptom: result.symptom,
      picks: result.examFollowUps.length,
    });

    res.json(result);
  }
);

// ---------------------------------------------------------------------------
// POST /ai/report/problem-score
// Grades the report's "Problem Description" 0–100 against the identified
// symptom's SYBRA "History Taking" axes (equal-weight facets). The LLM assigns
// per-facet statuses; the numeric score is computed in code. If no chief
// complaint / symptom can be identified from the text, the section is not
// scorable and no score is returned. Also returns one concise improvement
// suggestion when the score is below 100.
// Accepts user JWT or partner API key (requires extract:write scope).
// ---------------------------------------------------------------------------

const ProblemScoreSchema = z.object({
  problemDescription: z.string().max(5000),
  chiefComplaint: z.string().max(1000).optional(),
  pathway: z.string().max(200).optional(),
});

aiRouter.post(
  '/report/problem-score',
  authenticate,
  requireScope('extract:write'),
  problemScoreRateLimit,
  requireVerifiedActiveUser,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = ProblemScoreSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    let result;
    try {
      result = await scoreProblemDescription(parsed.data);
    } catch (err) {
      console.error('[ai/report/problem-score] scoring error:', (err as Error).message);
      res.status(502).json({ error: 'Problem-score service unavailable' });
      return;
    }

    await auditLog('problem_score_generated', req, attributionFromPrincipal(req), {
      scorable: result.scorable,
      score: result.score,
      pathway: result.pathway,
    });

    res.json(result);
  }
);

// ---------------------------------------------------------------------------
// POST /ai/report/allergy-score
// Grades the report's "Allergies" field 0–100 against a fixed allergy rubric
// (allergen / type / reaction / severity). "No known allergies" scores 100;
// "Not assessed" / empty is not scorable. The LLM classifies the status and
// assigns per-facet statuses; the score is computed in code. Returns one
// concise improvement suggestion when below 100.
// Accepts user JWT or partner API key (requires extract:write scope).
// ---------------------------------------------------------------------------

const AllergyScoreSchema = z.object({
  allergies: z.string().max(3000),
});

aiRouter.post(
  '/report/allergy-score',
  authenticate,
  requireScope('extract:write'),
  allergyScoreRateLimit,
  requireVerifiedActiveUser,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = AllergyScoreSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    let result;
    try {
      result = await scoreAllergies(parsed.data.allergies);
    } catch (err) {
      console.error('[ai/report/allergy-score] scoring error:', (err as Error).message);
      res.status(502).json({ error: 'Allergy-score service unavailable' });
      return;
    }

    await auditLog('allergy_score_generated', req, attributionFromPrincipal(req), {
      scorable: result.scorable,
      score: result.score,
      status: result.status,
    });

    res.json(result);
  }
);

// ---------------------------------------------------------------------------
// POST /ai/report/medication-score
// Grades the report's "Current Medications" field 0–100 against a fixed rubric
// (name / dose / frequency / indication). "No medications" scores 100;
// "Not assessed" / empty is not scorable. The LLM classifies the status and
// assigns per-facet statuses; the score is computed in code. Returns one
// concise improvement suggestion when below 100.
// Accepts user JWT or partner API key (requires extract:write scope).
// ---------------------------------------------------------------------------

const MedicationScoreSchema = z.object({
  medications: z.string().max(3000),
});

aiRouter.post(
  '/report/medication-score',
  authenticate,
  requireScope('extract:write'),
  medicationScoreRateLimit,
  requireVerifiedActiveUser,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = MedicationScoreSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    let result;
    try {
      result = await scoreMedications(parsed.data.medications);
    } catch (err) {
      console.error('[ai/report/medication-score] scoring error:', (err as Error).message);
      res.status(502).json({ error: 'Medication-score service unavailable' });
      return;
    }

    await auditLog('medication_score_generated', req, attributionFromPrincipal(req), {
      scorable: result.scorable,
      score: result.score,
      status: result.status,
    });

    res.json(result);
  }
);

// ---------------------------------------------------------------------------
// POST /ai/report/associated-symptoms-score
// Grades the report's "Associated Symptoms" field 0–100 against the identified
// symptom's SYBRA "Associated Symptoms" list. A documented negative counts as
// complete; gender/age-conditional items drop to not_applicable. Not scorable
// when no symptom is identifiable or the field is empty / "Not assessed".
// Accepts user JWT or partner API key (requires extract:write scope).
// ---------------------------------------------------------------------------

const AssociatedSymptomsScoreSchema = z.object({
  associatedSymptoms: z.string().max(5000),
  chiefComplaint: z.string().max(1000).optional(),
  pathway: z.string().max(200).optional(),
});

aiRouter.post(
  '/report/associated-symptoms-score',
  authenticate,
  requireScope('extract:write'),
  associatedSymptomsScoreRateLimit,
  requireVerifiedActiveUser,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = AssociatedSymptomsScoreSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    let result;
    try {
      result = await scoreAssociatedSymptoms(parsed.data);
    } catch (err) {
      console.error('[ai/report/associated-symptoms-score] scoring error:', (err as Error).message);
      res.status(502).json({ error: 'Associated-symptoms-score service unavailable' });
      return;
    }

    await auditLog('associated_symptoms_score_generated', req, attributionFromPrincipal(req), {
      scorable: result.scorable,
      score: result.score,
      pathway: result.pathway,
    });

    res.json(result);
  }
);

// ---------------------------------------------------------------------------
// POST /ai/report/past-medical-history-score
// Grades the report's "Past Medical History" field 0–100 against the identified
// symptom's SYBRA "Focused Past Medical History" list. A documented negative
// counts as complete; gender/age-conditional items drop to not_applicable. Not
// scorable when no symptom is identifiable or the field is empty / "Not assessed".
// Accepts user JWT or partner API key (requires extract:write scope).
// ---------------------------------------------------------------------------

const PastMedicalHistoryScoreSchema = z.object({
  pastMedicalHistory: z.string().max(5000),
  chiefComplaint: z.string().max(1000).optional(),
  pathway: z.string().max(200).optional(),
});

aiRouter.post(
  '/report/past-medical-history-score',
  authenticate,
  requireScope('extract:write'),
  pastMedicalHistoryScoreRateLimit,
  requireVerifiedActiveUser,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = PastMedicalHistoryScoreSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    let result;
    try {
      result = await scorePastMedicalHistory(parsed.data);
    } catch (err) {
      console.error('[ai/report/past-medical-history-score] scoring error:', (err as Error).message);
      res.status(502).json({ error: 'Past-medical-history-score service unavailable' });
      return;
    }

    await auditLog('past_medical_history_score_generated', req, attributionFromPrincipal(req), {
      scorable: result.scorable,
      score: result.score,
      pathway: result.pathway,
    });

    res.json(result);
  }
);

// ---------------------------------------------------------------------------
// POST /ai/report/investigation-score
// Grades documented investigations 0–100 against the symptom's SYBRA
// "Investigations" list — a conditional checklist. The LLM resolves each rule's
// applicability from the case facts (temperature / gender / age / case summary)
// and its documentation status; the score is computed in code over applicable
// rules only. No investigation indicated for this case → 100. Not scorable when
// no symptom is identifiable.
// Accepts user JWT or partner API key (requires extract:write scope).
// ---------------------------------------------------------------------------

const InvestigationScoreSchema = z.object({
  documentation: z.string().max(5000),
  pathway: z.string().max(200).optional(),
  chiefComplaint: z.string().max(1000).optional(),
  temperatureCelsius: z.string().max(20).optional(),
  gender: z.string().max(20).optional(),
  age: z.number().int().min(0).max(130).optional(),
  caseSummary: z.string().max(5000).optional(),
});

aiRouter.post(
  '/report/investigation-score',
  authenticate,
  requireScope('extract:write'),
  investigationScoreRateLimit,
  requireVerifiedActiveUser,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = InvestigationScoreSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    let result;
    try {
      result = await scoreInvestigations(parsed.data);
    } catch (err) {
      console.error('[ai/report/investigation-score] scoring error:', (err as Error).message);
      res.status(502).json({ error: 'Investigation-score service unavailable' });
      return;
    }

    await auditLog('investigation_score_generated', req, attributionFromPrincipal(req), {
      scorable: result.scorable,
      score: result.score,
      pathway: result.pathway,
      required: result.required,
    });

    res.json(result);
  }
);

// ---------------------------------------------------------------------------
// POST /ai/report/physical-examination-score
// Grades the physical examination 0–100 against the symptom's SYBRA expected
// examinations (symptomGuidelines["Examinations"]). One facet per expected
// examination; the LLM assigns a documentation status (a documented normal
// finding counts as complete), sex-conditional examinations drop to
// not_applicable from the gender case fact, and the score is computed in code.
// The vital-signs pseudo-exam is excluded (graded via its own fields). Not
// scorable when no symptom is identifiable.
// Accepts user JWT or partner API key (requires extract:write scope).
// ---------------------------------------------------------------------------

const PhysicalExaminationScoreSchema = z.object({
  documentation: z.string().max(5000),
  pathway: z.string().max(200).optional(),
  chiefComplaint: z.string().max(1000).optional(),
  gender: z.string().max(20).optional(),
  age: z.number().int().min(0).max(130).optional(),
  caseSummary: z.string().max(5000).optional(),
});

aiRouter.post(
  '/report/physical-examination-score',
  authenticate,
  requireScope('extract:write'),
  physicalExamScoreRateLimit,
  requireVerifiedActiveUser,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = PhysicalExaminationScoreSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    let result;
    try {
      result = await scorePhysicalExamination(parsed.data);
    } catch (err) {
      console.error('[ai/report/physical-examination-score] scoring error:', (err as Error).message);
      res.status(502).json({ error: 'Physical-examination-score service unavailable' });
      return;
    }

    await auditLog('physical_examination_score_generated', req, attributionFromPrincipal(req), {
      scorable: result.scorable,
      score: result.score,
      pathway: result.pathway,
      required: result.required,
    });

    res.json(result);
  }
);

// ---------------------------------------------------------------------------
// POST /ai/report/vital-signs-score
// Grades the Vital Signs section 0–100 by how many of the six gradable vitals
// (temperature, respiratory rate, pulse, blood pressure, oxygen saturation,
// AVPU) are recorded. Deterministic — no LLM. The suggestion names the top
// missing vital and carries its "Vital signs" demo video (Q1–Q5 have one).
// Accepts user JWT or partner API key (requires extract:write scope).
// ---------------------------------------------------------------------------

const VitalSignsScoreSchema = z.object({
  temperatureCelsius: z.string().max(50).nullish(),
  respiratoryRate: z.string().max(50).nullish(),
  pulse: z.string().max(50).nullish(),
  systolic: z.string().max(50).nullish(),
  spo2: z.string().max(50).nullish(),
  avpu: z.string().max(50).nullish(),
});

aiRouter.post(
  '/report/vital-signs-score',
  authenticate,
  requireScope('extract:write'),
  vitalSignsScoreRateLimit,
  requireVerifiedActiveUser,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = VitalSignsScoreSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const result = scoreVitalSigns(parsed.data);

    await auditLog('vital_signs_score_generated', req, attributionFromPrincipal(req), {
      scorable: result.scorable,
      score: result.score,
    });

    res.json(result);
  }
);

// ---------------------------------------------------------------------------
// POST /v2/ai/revise-field
// Applies a spoken instruction to ONE free-text report field and returns the
// field's complete new text. Unlike /v2/ai/extract this treats the officer as
// the author rather than the transcript as evidence: everything he says must
// survive into the field, and content is removed only where he asked for it.
// The coaching suggestion shown in the report's yellow box is passed in so a
// bare "yes" or "he doesn't" can be resolved against the question that
// prompted it. See src/lib/reviseField.ts.
// Accepts user JWT or partner API key (requires extract:write scope).
// ---------------------------------------------------------------------------

const ReviseFieldSchema = z.object({
  field: z.enum(REVISABLE_FIELDS),
  currentText: z.string().max(10000),
  instruction: z.string().min(1).max(5000),
  suggestion: z.string().max(2000).nullish(),
  suggestionShown: z.string().max(2000).nullish(),
  chiefComplaint: z.string().max(200).nullish(),
  pathway: z.string().max(200).nullish(),
});

aiV2Router.post(
  '/revise-field',
  authenticate,
  requireScope('extract:write'),
  reviseFieldRateLimit,
  requireVerifiedActiveUser,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = ReviseFieldSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const d = parsed.data;
    let result;
    try {
      result = await reviseField({
        field: d.field,
        currentText: d.currentText,
        instruction: d.instruction,
        suggestion: d.suggestion ?? undefined,
        suggestionShown: d.suggestionShown ?? undefined,
        chiefComplaint: d.chiefComplaint ?? undefined,
        pathway: d.pathway ?? undefined,
      });
    } catch (err) {
      console.error('[v2/ai/revise-field] revision error:', (err as Error).message);
      res.status(502).json({ error: 'Field revision service unavailable' });
      return;
    }

    // Field text is patient data — log that a revision happened and its shape,
    // never the text itself.
    await auditLog('field_revised_by_voice', req, attributionFromPrincipal(req), {
      field: d.field,
      changed: result.changed,
      had_suggestion: Boolean(d.suggestion || d.suggestionShown),
      instruction_chars: d.instruction.length,
    });

    res.json(result);
  }
);

// ---------------------------------------------------------------------------
// POST /v2/ai/revise-vitals
// The Vital Signs counterpart of /v2/ai/revise-field. The section is seven
// discrete typed values under one judge, so the officer dictates the whole
// section at once ("pulse 88, BP 130 over 85, he's alert") and every vital he
// named is set together; the rest are copied through untouched. Anything he
// said that is not a vital comes back in `unmapped` rather than being dropped.
// Accepts user JWT or partner API key (requires extract:write scope).
// ---------------------------------------------------------------------------

const vitalString = z.string().max(50).nullish();

const ReviseVitalsSchema = z.object({
  current: z.object({
    pulse: vitalString,
    systolic: vitalString,
    diastolic: vitalString,
    respiratoryRate: vitalString,
    spo2: vitalString,
    temperatureCelsius: vitalString,
    avpu: vitalString,
  }),
  instruction: z.string().min(1).max(5000),
  suggestion: z.string().max(2000).nullish(),
  suggestionShown: z.string().max(2000).nullish(),
});

aiV2Router.post(
  '/revise-vitals',
  authenticate,
  requireScope('extract:write'),
  reviseVitalsRateLimit,
  requireVerifiedActiveUser,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = ReviseVitalsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const d = parsed.data;
    let result;
    try {
      result = await reviseVitals({
        current: {
          pulse: d.current.pulse ?? '',
          systolic: d.current.systolic ?? '',
          diastolic: d.current.diastolic ?? '',
          respiratoryRate: d.current.respiratoryRate ?? '',
          spo2: d.current.spo2 ?? '',
          temperatureCelsius: d.current.temperatureCelsius ?? '',
          avpu: d.current.avpu ?? '',
        },
        instruction: d.instruction,
        suggestion: d.suggestion ?? undefined,
        suggestionShown: d.suggestionShown ?? undefined,
      });
    } catch (err) {
      console.error('[v2/ai/revise-vitals] revision error:', (err as Error).message);
      res.status(502).json({ error: 'Vitals revision service unavailable' });
      return;
    }

    // Which vitals changed is safe to log; the values themselves are not.
    await auditLog('vitals_revised_by_voice', req, attributionFromPrincipal(req), {
      changed: result.changed,
      had_unmapped: Boolean(result.unmapped),
      warnings: result.warnings.length,
      instruction_chars: d.instruction.length,
    });

    res.json(result);
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

// ===========================================================================
// FREE, NO-LOGIN NOTE TAKER  (mounted at /free/ai)
// ---------------------------------------------------------------------------
// A signed-out client (the app's "basic" Note Taker) can record → transcribe →
// extract → edit fields by voice. These mirror the authenticated handlers but:
//   • use `allowAnonymous` instead of `authenticate` (no 401 for missing auth),
//   • use their own, much lower free-tier rate limits keyed by device id / IP,
//   • never touch requireScope / requireVerifiedActiveUser (user/partner only),
//   • persist under the dedicated Free (Anonymous) partner rather than a user —
//     /free/ai/extract writes the transcript + report (and mints a case) owned
//     by FREE_ANON_PARTNER_ID, with the device id in partner_user_ref. The
//     transcribe / revise / pdf routes remain stateless.
// The authenticated /ai and /v2/ai routes above are untouched.
// ===========================================================================

// POST /free/ai/transcribe
aiFreeRouter.post(
  '/transcribe',
  allowAnonymous,
  freeTranscribeRateLimit,
  upload.single('audio'),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: 'No audio file provided' });
      return;
    }

    const language = typeof req.body.language === 'string' && req.body.language.length === 2
      ? req.body.language
      : undefined;

    const provider = config.transcriptionProvider;

    if (provider === 'elevenlabs' && !config.elevenlabs.apiKey) {
      res.status(503).json({ error: 'ElevenLabs not configured' });
      return;
    }

    let transcription: string;
    try {
      if (provider === 'elevenlabs') {
        transcription = await elevenLabsTranscribe(
          req.file.buffer,
          req.file.originalname,
          req.file.mimetype,
          language,
        );
      } else {
        const file = await toFile(req.file.buffer, req.file.originalname, {
          type: req.file.mimetype,
        });
        const result = await whisper.audio.transcriptions.create({
          model: config.whisper.model,
          file,
          ...(language ? { language } : {}),
        });
        if (!result.text) {
          res.status(502).json({ error: 'Transcription service unavailable' });
          return;
        }
        transcription = result.text;
      }
    } catch (err) {
      console.error(`[free/ai/transcribe] ${provider} error:`, (err as Error).message);
      res.status(502).json({ error: 'Transcription service unavailable' });
      return;
    }

    await auditLog('audio_transcribed', req, attributionFromPrincipal(req), {
      size_bytes: req.file.size,
      language: language ?? 'auto',
      provider,
      free: true,
    });

    res.json({ transcription });
  }
);

// POST /free/ai/extract — builds the report and persists it (transcript +
// report + case) under the Free (Anonymous) partner. See section header above.
aiFreeRouter.post(
  '/extract',
  allowAnonymous,
  freeExtractRateLimit,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = ExtractSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const { conversation, userProfile, mewsScore, patientLanguage, medicalOfficerLanguage } = parsed.data;

    let summary: Record<string, string | boolean>;
    try {
      summary = await parallelExtractV2(conversation, userProfile as UserProfile | undefined, mewsScore ?? null);
    } catch (err) {
      console.error('[free/ai/extract] extraction error:', (err as Error).message);
      res.status(502).json({ error: 'Extraction service unavailable' });
      return;
    }

    const fieldsPopulated = Object.values(summary).filter(v => v !== '' && v !== false && v !== null && v !== undefined).length;
    const totalFields = Object.keys(summary).length;

    // Persist the transcript + extracted report like the paid flow, owned by the
    // dedicated Free (Anonymous) partner (no user account exists). The per-install
    // device id rides in partner_user_ref so sessions stay distinguishable. This
    // also mints a case, exactly as a paid note-taker session would. Fail-open: a
    // persistence fault must never cost the caller their report.
    const deviceId = req.principal?.type === 'anonymous' ? req.principal.deviceId : null;
    let persistedId: string | null = null;
    let resolvedCaseId: string | null = null;
    try {
      const chiefSymptomRaw =
        (typeof summary.chiefSymptom === 'string' && summary.chiefSymptom.trim()) ||
        (typeof summary.chiefComplaint === 'string' && summary.chiefComplaint.trim()) ||
        conversation.find((m) => m.role === 'user')?.content?.split(/[.!?]/)[0] ||
        null;
      const persisted = await createNoteTakerConversation(
        { partnerId: FREE_ANON_PARTNER_ID, partnerUserRef: deviceId },
        {
          messages: conversation,
          summary,
          patientLanguage: patientLanguage ?? 'en',
          medicalOfficerLanguage: medicalOfficerLanguage ?? 'en',
          chiefSymptom: chiefSymptomRaw ? chiefSymptomRaw.slice(0, 200) : null,
        },
      );
      persistedId = persisted.conversationId;
      resolvedCaseId = persisted.caseId;
    } catch (err) {
      console.error('[free/ai/extract] persist failed:', (err as Error).message);
    }

    // Aggregate analytics: the SYBRA chief-symptom *category* + completeness
    // counts, alongside the persisted conversation id.
    const chiefSymptom =
      typeof summary.chiefSymptom === 'string' && summary.chiefSymptom.trim()
        ? summary.chiefSymptom.trim().slice(0, 120)
        : null;

    await auditLog('medical_record_extracted', req, attributionFromPrincipal(req), {
      message_count: conversation.length,
      fields_populated: fieldsPopulated,
      total_fields: totalFields,
      chief_symptom: chiefSymptom,
      conversation_id: persistedId,
      mode: 'note_taker',
      free: true,
    });

    res.json({ summary, conversationId: persistedId, caseId: resolvedCaseId });
  }
);

// POST /free/ai/revise-field — edit one report field by voice.
aiFreeRouter.post(
  '/revise-field',
  allowAnonymous,
  freeReviseRateLimit,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = ReviseFieldSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const d = parsed.data;
    let result;
    try {
      result = await reviseField({
        field: d.field,
        currentText: d.currentText,
        instruction: d.instruction,
        suggestion: d.suggestion ?? undefined,
        suggestionShown: d.suggestionShown ?? undefined,
        chiefComplaint: d.chiefComplaint ?? undefined,
        pathway: d.pathway ?? undefined,
      });
    } catch (err) {
      console.error('[free/ai/revise-field] revision error:', (err as Error).message);
      res.status(502).json({ error: 'Field revision service unavailable' });
      return;
    }

    await auditLog('field_revised_by_voice', req, attributionFromPrincipal(req), {
      field: d.field,
      changed: result.changed,
      had_suggestion: Boolean(d.suggestion || d.suggestionShown),
      instruction_chars: d.instruction.length,
      free: true,
    });

    res.json(result);
  }
);

// POST /free/ai/revise-vitals — dictate the whole vitals section at once.
aiFreeRouter.post(
  '/revise-vitals',
  allowAnonymous,
  freeReviseRateLimit,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = ReviseVitalsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const d = parsed.data;
    let result;
    try {
      result = await reviseVitals({
        current: {
          pulse: d.current.pulse ?? '',
          systolic: d.current.systolic ?? '',
          diastolic: d.current.diastolic ?? '',
          respiratoryRate: d.current.respiratoryRate ?? '',
          spo2: d.current.spo2 ?? '',
          temperatureCelsius: d.current.temperatureCelsius ?? '',
          avpu: d.current.avpu ?? '',
        },
        instruction: d.instruction,
        suggestion: d.suggestion ?? undefined,
        suggestionShown: d.suggestionShown ?? undefined,
      });
    } catch (err) {
      console.error('[free/ai/revise-vitals] revision error:', (err as Error).message);
      res.status(502).json({ error: 'Vitals revision service unavailable' });
      return;
    }

    await auditLog('vitals_revised_by_voice', req, attributionFromPrincipal(req), {
      changed: result.changed,
      had_unmapped: Boolean(result.unmapped),
      warnings: result.warnings.length,
      instruction_chars: d.instruction.length,
      free: true,
    });

    res.json(result);
  }
);

// POST /free/ai/generate-pdf — fill the Marina template and return the bytes.
// The free tier is Marina-only: the RMD (Danish) and German TMAS official forms
// are never generated here (any `template` in the body is ignored).
// Download only; there is deliberately no anonymous email-pdf (an open
// "email to any address" endpoint is a spam vector), so signed-out users can
// download their report but must sign in to email it.
aiFreeRouter.post(
  '/generate-pdf',
  allowAnonymous,
  freePdfRateLimit,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = GeneratePdfSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const { summary } = parsed.data;

    // The free tier only ever produces the Marina template — never the RMD
    // (Danish) or German TMAS official forms. Whatever `template` the client
    // sends is deliberately ignored, so the free endpoint can't be used to fill
    // the partner/official forms.
    const outputPath = `/tmp/marina_free_${Date.now()}.pdf`;
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await fillSeafarerForm(mapSummaryToSeafarerFields(summary), outputPath);
    } catch (err) {
      console.error('[free/ai/generate-pdf] marina fill error:', (err as Error).message);
      res.status(502).json({ error: 'PDF generation failed' });
      return;
    } finally {
      try {
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      } catch { /* ignore cleanup errors */ }
    }

    await auditLog('pdf_generated', req, attributionFromPrincipal(req), {
      file_size_bytes: pdfBuffer.length,
      template: 'marina',
      free: true,
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="marina-seafarer-medical-report.pdf"',
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  }
);

// Multer error handler for the free transcribe upload (4-arg, after routes).
aiFreeRouter.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Audio file too large (max 25MB)' });
  }
  if (err.status === 400) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});
