// ---------------------------------------------------------------------------
// reviseVitals.ts — fill the Vital Signs section from a spoken instruction.
//
// The sibling of reviseField.ts for the eighth judge. Vitals are seven discrete
// typed values rather than prose, so the officer speaks once for the whole
// section ("pulse 88, BP 130 over 85, he's alert") and every value he named is
// set at once. Untouched vitals keep their current value.
//
// The never-omit rule from reviseField applies here too, and needs a home:
// anything he says that is not one of the seven vitals cannot be silently
// dropped, so it comes back in `unmapped` for the client to surface rather
// than disappearing.
// ---------------------------------------------------------------------------
import { ovh } from './ovh.js';
import { chatWithFallback, type FallbackOpts } from './llmFallback.js';
import { config } from '../config.js';

const REVISE_FALLBACK: FallbackOpts = {
  primaryModel: config.nebius.extractV2Model,
  timeoutMs: 10_000,
  backupClient: ovh,
  backupModel: config.ovh.model,
};

/** The AVPU values the report's dropdown accepts (ReportView.swift `avpuOptions`). */
export const AVPU_OPTIONS = ['Alert', 'Voice', 'Pain', 'Unresponsive'] as const;

export interface VitalsValues {
  pulse?: string | null;
  systolic?: string | null;
  diastolic?: string | null;
  respiratoryRate?: string | null;
  spo2?: string | null;
  temperatureCelsius?: string | null;
  avpu?: string | null;
}

export const VITALS_KEYS = [
  'pulse',
  'systolic',
  'diastolic',
  'respiratoryRate',
  'spo2',
  'temperatureCelsius',
  'avpu',
] as const;

export interface ReviseVitalsInput {
  current: VitalsValues;
  instruction: string;
  suggestion?: string;
  suggestionShown?: string;
}

export interface ReviseVitalsResult {
  values: VitalsValues;
  /** Keys whose value actually changed. */
  changed: string[];
  /** Anything he said that is not one of the seven vitals — never dropped. */
  unmapped: string | null;
  /** Values that parsed but sit outside a physiologically plausible range. */
  warnings: string[];
}

// Plausible ranges. A value outside these is still recorded — the officer may
// genuinely be reporting a crashing patient — but it is flagged for review.
const RANGES: Record<string, { min: number; max: number; label: string }> = {
  pulse: { min: 20, max: 250, label: 'Pulse' },
  systolic: { min: 50, max: 260, label: 'Systolic BP' },
  diastolic: { min: 20, max: 160, label: 'Diastolic BP' },
  respiratoryRate: { min: 4, max: 60, label: 'Respiratory rate' },
  spo2: { min: 50, max: 100, label: 'Oxygen saturation' },
  temperatureCelsius: { min: 25, max: 45, label: 'Temperature' },
};

function buildPrompt(input: ReviseVitalsInput): string {
  const cur = VITALS_KEYS.map((k) => `${k}: ${input.current[k]?.toString().trim() || '(empty)'}`).join('\n');

  let coaching = '';
  if (input.suggestion?.trim() || input.suggestionShown?.trim()) {
    coaching = `
=== COACHING PROMPT ON SCREEN ===
The officer was shown this prompt and may be answering it directly, possibly
very briefly. Use it ONLY to work out which vital he means.
English: ${input.suggestion?.trim() || '(not available)'}`;
    if (input.suggestionShown?.trim() && input.suggestionShown.trim() !== input.suggestion?.trim()) {
      coaching += `
As displayed to him: ${input.suggestionShown.trim()}`;
    }
    coaching += `

Never answer it yourself. If he did not give the value, that vital stays as it is.`;
  }

  return `You are filling the Vital Signs section of a maritime medical report from what the ship's medical officer just said out loud. He may speak any language.

=== CURRENT VALUES ===
${cur}

=== WHAT THE OFFICER SAID ===
${input.instruction.trim()}
${coaching}

=== HOW TO APPLY IT ===
Set every vital he gave a value for. Leave every other vital EXACTLY as it is —
copy the current value through unchanged, including empty ones.

RULES (follow strictly):
1. Only set a vital he actually stated. Never estimate, infer one vital from
   another, or fill a gap to look complete.
2. Blood pressure spoken as one value ("130 over 85", "130/85") sets BOTH
   systolic and diastolic.
3. Temperature in Fahrenheit is converted to Celsius, one decimal place.
   Any other unit he uses is likewise converted to the unit named by the key.
4. Numeric vitals are digits only — no units, no ranges, no words. "about
   eighty-eight" is "88".
5. avpu MUST be exactly one of: Alert, Voice, Pain, Unresponsive. Map his
   description onto it ("he's awake and talking" → "Alert", "only wakes when I
   pinch him" → "Pain"). If it maps to none of the four, leave avpu unchanged
   and put what he said in "unmapped".
6. To clear a vital he explicitly retracted, set it to "". Never clear a vital
   he did not mention.
7. ANYTHING he said that is not one of these seven vitals — a symptom, an
   observation, a note — goes into "unmapped", translated to English. His words
   are never discarded. Write it as professional clinical documentation, the
   way it would read in a medical report a shore-side doctor relies on: a
   complete phrase, clinical vocabulary. Reword freely, but never drop or
   soften what he said. The only thing you may delete is a meaningless sound
   ("erm", "uh", a stutter). His uncertainty, his concern, his emphasis and
   every separate observation are content and must all survive — two things he
   said are two things you record. If everything he said mapped to a
   vital, "unmapped" is "".

Return ONE JSON object with exactly these keys, all values strings:
{"pulse": "", "systolic": "", "diastolic": "", "respiratoryRate": "", "spo2": "", "temperatureCelsius": "", "avpu": "", "unmapped": ""}`;
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
}


/**
 * Parse the model's JSON object, tolerating the wrappers gpt-oss occasionally
 * emits around it — a ```json fence, or a sentence before the brace. A hard
 * failure here surfaces to the officer as "couldn't reach Marina" and loses a
 * recording he already made, so it is worth digging the object out.
 */
function parseLooseJson(raw: string): Record<string, unknown> | null {
  const attempts = [raw.trim()];
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) attempts.push(fenced[1].trim());
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first !== -1 && last > first) attempts.push(raw.slice(first, last + 1));

  for (const a of attempts) {
    try {
      const parsed = JSON.parse(a);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // try the next shape
    }
  }
  return null;
}

export async function reviseVitals(input: ReviseVitalsInput): Promise<ReviseVitalsResult> {
  const completion = await chatWithFallback(
    {
      messages: [{ role: 'user', content: buildPrompt(input) }],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 600,
      reasoning_effort: 'low',
    } as never,
    REVISE_FALLBACK,
  );

  const raw = completion.choices[0]?.message?.content ?? '';
  const parsed = parseLooseJson(raw);
  if (!parsed) {
    console.error('[reviseVitals] non-JSON response: %s', raw.slice(0, 200));
    throw new Error('Revision returned malformed output');
  }

  const values: VitalsValues = {};
  const changed: string[] = [];
  const warnings: string[] = [];

  for (const key of VITALS_KEYS) {
    const before = input.current[key]?.toString().trim() ?? '';
    let next = asString(parsed[key]);

    if (key === 'avpu') {
      // Anything outside the dropdown's four options would not render, so an
      // unrecognised value keeps the previous one rather than breaking the field.
      if (next && !AVPU_OPTIONS.includes(next as (typeof AVPU_OPTIONS)[number])) {
        const match = AVPU_OPTIONS.find((o) => o.toLowerCase() === next.toLowerCase());
        next = match ?? before;
      }
    } else if (next) {
      // Strip any unit the model kept ("88 bpm", "37.2 °C") before validating.
      const num = Number(next.replace(/[^0-9.]/g, ''));
      const range = RANGES[key];
      if (!Number.isFinite(num)) {
        next = before;
      } else {
        next = String(num);
        if (range && (num < range.min || num > range.max)) {
          warnings.push(`${range.label} ${next} is outside the expected range (${range.min}–${range.max}).`);
        }
      }
    }

    values[key] = next;
    if (next !== before) changed.push(key);
  }

  const unmapped = asString(parsed.unmapped);
  return { values, changed, unmapped: unmapped || null, warnings };
}
