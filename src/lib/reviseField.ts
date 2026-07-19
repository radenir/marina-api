// ---------------------------------------------------------------------------
// reviseField.ts — apply a spoken instruction to one free-text report field.
//
// This is NOT extraction. In /v2/ai/extract the transcript is *evidence* mined
// for facts, so medicalExtractV2's SHARED_RULES forbid stating anything not
// said. Here the ship's medical officer is the AUTHOR: he dictates directly
// into his own report, in his own language, and has complete freedom over what
// the field contains. Everything he says must survive into the field —
// omitting, summarising or second-guessing his words is the failure mode this
// module exists to avoid. Content disappears only when he asks for it to.
//
// The officer may be answering the coaching suggestion shown in the report's
// yellow box, so that suggestion is passed in as context — a bare "yes" or
// "he doesn't" is only interpretable against the question that prompted it.
// ---------------------------------------------------------------------------
import { ovh } from './ovh.js';
import { chatWithFallback, type FallbackOpts } from './llmFallback.js';
import { config } from '../config.js';

// Same pinned judge stack the score endpoints use: Nebius gpt-oss-120b primary,
// OVH gpt-oss-120b backup on a 10s timeout. Revision is a mechanical rewrite,
// so reasoning_effort stays 'low'.
const REVISE_FALLBACK: FallbackOpts = {
  primaryModel: config.nebius.extractV2Model,
  timeoutMs: 10_000,
  backupClient: ovh,
  backupModel: config.ovh.model,
};

export const REVISABLE_FIELDS = [
  'problemDescription',
  'associatedSymptoms',
  'pastHistory',
  'allergies',
  'currentMedications',
  'investigations',
  'exam',
] as const;

export type RevisableField = (typeof REVISABLE_FIELDS)[number];

export interface ReviseFieldInput {
  field: RevisableField;
  currentText: string;
  instruction: string;
  /** The coaching suggestion in English, as the judge produced it. */
  suggestion?: string;
  /** The same suggestion as the officer actually read it (his language). */
  suggestionShown?: string;
  chiefComplaint?: string;
  pathway?: string;
}

export interface ReviseFieldResult {
  revisedText: string;
  changed: boolean;
}

// How each field is written, so dictated text reads like extracted text.
// Deliberately about STYLE only — none of these may drop content.
const FIELD_STYLE: Record<RevisableField, string> = {
  problemDescription:
    'The presenting complaint and its story: onset, timing, location, character, severity, what makes it better or worse, and how it has developed. Prose, chronological.',
  associatedSymptoms:
    'Other symptoms accompanying the main complaint, including ones the patient was asked about and denied. Short clauses separated by semicolons.',
  pastHistory:
    'Prior conditions, surgeries, injuries and relevant family history. Short clauses separated by semicolons.',
  allergies:
    'Known allergies with the reaction they cause. "No known allergies" is a complete and valid answer.',
  currentMedications:
    'Medications the patient takes, with dose and frequency where known. One per line. "No medications" is a complete and valid answer.',
  investigations:
    'Tests, measurements and checks performed on board and what they showed. One finding per line.',
  exam:
    'What the officer observed on physical examination, by body region. One finding per line.',
};

const FIELD_LABEL: Record<RevisableField, string> = {
  problemDescription: 'Problem Description',
  associatedSymptoms: 'Associated Symptoms',
  pastHistory: 'Past Medical History',
  allergies: 'Allergies',
  currentMedications: 'Current Medications',
  investigations: 'Investigations',
  exam: 'Physical Examination',
};

function buildPrompt(input: ReviseFieldInput): string {
  const label = FIELD_LABEL[input.field];

  let ctx = '';
  if (input.chiefComplaint?.trim()) ctx += `\nChief complaint: ${input.chiefComplaint.trim()}`;
  if (input.pathway?.trim()) ctx += `\nClinical pathway: ${input.pathway.trim()}`;

  let coaching = '';
  if (input.suggestion?.trim() || input.suggestionShown?.trim()) {
    coaching = `
=== COACHING PROMPT ON SCREEN ===
The officer was shown this prompt next to the field and may be answering it
directly — possibly with something as short as "yes", "no" or "he doesn't".
Use it ONLY to interpret what he means.
English: ${input.suggestion?.trim() || '(not available)'}`;
    if (input.suggestionShown?.trim() && input.suggestionShown.trim() !== input.suggestion?.trim()) {
      coaching += `
As displayed to him: ${input.suggestionShown.trim()}`;
    }
    coaching += `

If the prompt asks about several things at once ("fever or chills") and he
answers it as a whole ("yes", "no"), his answer applies to EVERY part of it —
record them all, never just the first.

NEVER copy this prompt, or any part of it, into the field. NEVER answer it
yourself: if his dictation does not address it, the field simply does not gain
that information.`;
  }

  return `You are editing the "${label}" field of a maritime medical report, on behalf of the ship's medical officer who is dictating changes to it by voice. He is the author of this field and has complete freedom over its contents.

FIELD STYLE: ${FIELD_STYLE[input.field]}${ctx}

=== CURRENT FIELD TEXT ===
${input.currentText.trim() || '(empty)'}

=== WHAT THE OFFICER SAID ===
${input.instruction.trim()}
${coaching}

=== HOW TO APPLY IT ===
His words may add information, correct or replace something already there, or
ask for something to be removed. Work out which, and apply it.

RULES (follow strictly):
1. EVERY piece of content in what he said MUST appear in the result. You may
   reorder it, reword it for clarity, and translate it to English. You MUST
   NOT omit it, summarise it away, compress it, or decide it is not relevant
   enough to include. If he said it, it goes in the report.
   This covers his subjective impressions and opinions too — "I don't like how
   he looks", "something feels wrong to me", "he seems worse than this
   morning". A ship's officer's gut feeling about a patient is clinical
   information and is recorded as his observation. It is never yours to filter
   out for being vague, unmeasurable or non-medical.
2. A negative or a denial is content, not a no-op. "No, he has no allergies"
   is recorded as a documented negative — never treated as nothing to add.
3. Text he did not ask you to touch keeps its exact wording. Do not tidy,
   re-order or re-word the rest of the field. The ONLY thing you may adjust is
   the punctuation that joins clauses together, so new content reads as one
   sentence with the old — never leave a run like ".;" or ";.".
4. Remove content ONLY where he asked for it to be removed. Replacing a value
   he corrected is a removal he asked for; nothing else is.
5. Add NOTHING he did not say. Do not infer, do not complete a clinical
   picture, do not add placeholders ("Unknown", "N/A", "Not assessed"), and do
   not write about what is missing or was not mentioned.
6. If part of what he said is garbled or you cannot tell how it should be
   applied, append it to the field verbatim on its own line rather than
   dropping it. Losing his words is worse than an untidy field.
7. OUTPUT LANGUAGE: English. If he spoke another language, translate. Expand a
   medical abbreviation only when its meaning is unambiguous ("SOB on exertion"
   → "shortness of breath on exertion"); otherwise keep his term verbatim.
   Never drop a term because you could not expand it.
8. Vital signs (temperature, pulse, blood pressure, breathing rate, oxygen
   saturation) belong to the Vital Signs section. If he dictates one here,
   still keep it — never silently discard it.

Return ONE JSON object: {"revisedText": "<the full new field text>"}
Return the COMPLETE field, not a diff and not only the changed part. If his
words turn out to change nothing, return the current text unchanged.`;
}

export async function reviseField(input: ReviseFieldInput): Promise<ReviseFieldResult> {
  const completion = await chatWithFallback(
    {
      messages: [{ role: 'user', content: buildPrompt(input) }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 2000,
      reasoning_effort: 'low',
    } as never,
    REVISE_FALLBACK,
  );

  const raw = completion.choices[0]?.message?.content ?? '';
  let revisedText: string;
  try {
    const parsed = JSON.parse(raw) as { revisedText?: unknown };
    revisedText = typeof parsed.revisedText === 'string' ? parsed.revisedText : '';
    // gpt-oss likes U+2011 (non-breaking hyphen) in words like "non-tender";
    // the PDF templates' font has no glyph for it. Fold to a plain hyphen.
    revisedText = revisedText.replace(/‑/g, '-');
  } catch {
    console.error('[reviseField] non-JSON response for field=%s', input.field);
    throw new Error('Revision returned malformed output');
  }

  // A model that answers with an empty field would silently wipe the officer's
  // work. Only he can empty a field, and an explicit delete still produces a
  // deliberate result — so treat empty-out-of-nowhere as a failure, not a value.
  if (!revisedText.trim() && input.currentText.trim()) {
    console.warn('[reviseField] field=%s revised to empty; keeping current text', input.field);
    return { revisedText: input.currentText, changed: false };
  }

  return {
    revisedText,
    changed: revisedText.trim() !== input.currentText.trim(),
  };
}
