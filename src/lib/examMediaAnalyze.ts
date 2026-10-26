/**
 * Vision analysis for /ai/exam-media/analyze.
 *
 * Sends one examination photo plus the questions that photo can answer to the
 * vision model, and returns one answer per question. Every answer is either one
 * of the question's allowed values or "cannot_determine" — malformed output,
 * answers outside the options and low-confidence answers all become
 * "cannot_determine", so the question falls back to being asked normally.
 *
 * The model describes what is visible. It never diagnoses, and nothing it
 * returns reaches a report until the officer has confirmed it.
 */
import { z } from 'zod';
import { nebius } from './nebius.js';
import { config } from '../config.js';
import { allowsValue, type ExamMediaProtocol, type MediaShot, type Side } from './examMediaProtocols.js';

export interface AiAnswer {
  questionNumber: number;
  status: 'answered' | 'cannot_determine';
  value?: string;
  side?: Side;
  detail?: string;
  confidence?: number;
  /** Why the question could not be answered. */
  reason?: string;
}

export interface AnalysisResult {
  quality: { ok: boolean; reason?: string };
  answers: AiAnswer[];
  model: string;
}

// Free text from the model is shortened, not rejected: one over-long "detail"
// used to fail the whole parse and throw away every correct answer with it.
// 200 matches the detail limit of the confirm endpoint.
const clipped = (max: number) =>
  z.string().transform((s) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s));

const ModelOutput = z.object({
  quality: z.object({
    ok: z.boolean(),
    reason: clipped(300).optional().nullable(),
  }),
  // A rejected photo comes back without answers.
  answers: z.array(z.object({
    questionNumber: z.number().int(),
    value: z.string().max(40),
    // Anything but left/right/both is dropped when the answer is built.
    side: z.string().optional().nullable(),
    detail: clipped(200).optional().nullable(),
    confidence: z.number().min(0).max(1).optional().nullable(),
    reason: clipped(300).optional().nullable(),
  })).max(20).default([]),
});

export function buildPrompt(protocol: ExamMediaProtocol, shot: MediaShot): string {
  const questions = shot.answers.map((n) => {
    const q = protocol.questions[n];
    const sideNote = q.needsSide ? ' If the answer is positive, give "side": "left", "right" or "both".' : '';
    const guidance = q.guidance ? `\n   Guidance: ${q.guidance}` : '';
    const allowed = q.valueFormat
      ? `Answer as ${q.valueFormat.description}, or "cannot_determine".`
      : `Allowed values: ${[...q.options, 'cannot_determine'].map((o) => `"${o}"`).join(', ')}.`;
    return `${n}. ${q.text}\n   ${allowed}${sideNote}${guidance}`;
  }).join('\n');

  return `You assist a non-medical ship's officer who is examining a crew member at sea. You are shown one photo taken for the "${protocol.name}". The photo was meant to show: ${shot.instruction}

First judge the photo. Set quality.ok to false — and answer nothing — if it is too blurred, too dark, overexposed, or does not show what it was meant to show; give the reason in one short sentence the officer can act on (e.g. "The eyes are out of focus — hold the phone still and retake.").

If the photo is usable, answer each question below from what is VISIBLE in the photo:
${questions}

Rules:
- Describe only what you can see. Do not diagnose and do not name diseases.
- If you are not sure, answer "cannot_determine" and say why in "reason". A wrong answer is worse than no answer.
- Left and right are the PATIENT's left and right. In a frontal photo the patient's right eye is on the LEFT side of the image.
- "confidence" is your probability (0 to 1) that the answer is correct.
- "detail" is optional: a few plain words that add to the answer (e.g. "watery", "left pupil larger"). Never a diagnosis.

Return only JSON, no other text:
{"quality":{"ok":true,"reason":null},"answers":[{"questionNumber":1,"value":"no","side":null,"detail":null,"confidence":0.9,"reason":null}]}`;
}

/**
 * Turn the model's raw text into validated answers. Exported for tests: this is
 * where every way the model can go wrong is reduced to "cannot_determine".
 */
export function parseModelOutput(
  raw: string,
  protocol: ExamMediaProtocol,
  shot: MediaShot,
  minConfidence: number,
): Omit<AnalysisResult, 'model'> {
  const unanswerable = (reason: string): AiAnswer[] =>
    shot.answers.map((n) => ({ questionNumber: n, status: 'cannot_determine', reason }));

  let parsed: z.infer<typeof ModelOutput>;
  try {
    const cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    // Tolerate prose around the object: take the outermost {...}.
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    parsed = ModelOutput.parse(JSON.parse(cleaned.slice(start, end + 1)));
  } catch {
    return { quality: { ok: true }, answers: unanswerable('The photo could not be analysed.') };
  }

  if (!parsed.quality.ok) {
    return {
      quality: { ok: false, reason: parsed.quality.reason ?? 'The photo is not clear enough. Please retake it.' },
      answers: unanswerable('Photo not usable.'),
    };
  }

  const byNumber = new Map(parsed.answers.map((a) => [a.questionNumber, a]));
  const answers = shot.answers.map((n): AiAnswer => {
    const q = protocol.questions[n];
    const a = byNumber.get(n);
    if (!a) return { questionNumber: n, status: 'cannot_determine', reason: 'Not answered.' };
    if (a.value === 'cannot_determine') {
      return { questionNumber: n, status: 'cannot_determine', reason: a.reason ?? undefined };
    }
    if (!allowsValue(q, a.value)) {
      return { questionNumber: n, status: 'cannot_determine', reason: 'Answer outside the allowed values.' };
    }
    const confidence = a.confidence ?? 0;
    if (confidence < minConfidence) {
      return { questionNumber: n, status: 'cannot_determine', confidence, reason: 'Not confident enough.' };
    }
    const side = a.side === 'left' || a.side === 'right' || a.side === 'both' ? a.side : undefined;
    return {
      questionNumber: n,
      status: 'answered',
      value: a.value,
      side,
      detail: a.detail?.trim() || undefined,
      confidence,
    };
  });

  return { quality: { ok: true }, answers };
}

export async function analyzeExamPhoto(
  image: Buffer,
  mimeType: string,
  protocol: ExamMediaProtocol,
  shot: MediaShot,
): Promise<AnalysisResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.vision.timeoutMs);
  const start = Date.now();
  try {
    const completion = await nebius.chat.completions.create(
      {
        model: config.vision.model,
        temperature: 0,
        // Kimi-K3 reasons before answering; leave room for the hidden thinking
        // as well as the JSON.
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: buildPrompt(protocol, shot) },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${image.toString('base64')}` } },
          ],
        }],
      },
      { signal: controller.signal },
    );
    const raw = completion.choices[0]?.message?.content ?? '';
    console.log(
      `[exam-media] exam=${protocol.examinationId} shot=${shot.id} model=${config.vision.model} ` +
      `duration=${Date.now() - start}ms tokens=${completion.usage?.total_tokens ?? 'n/a'}`,
    );
    return { ...parseModelOutput(raw, protocol, shot, config.vision.minConfidence), model: config.vision.model };
  } finally {
    clearTimeout(timer);
  }
}
