// ---------------------------------------------------------------------------
// medicationScore.ts — grade a report's "Current Medications" field (0–100).
//
// Like allergies, the medication rubric is symptom-agnostic: interview Stage 5
// (Medications) asks the same questions for every case (name, dose, frequency,
// anything taken for the current problem), so the rubric is a FIXED facet set,
// not from symptomGuidelines. Three states:
//   • not_assessed        → not scorable (never asked / empty)
//   • no_medications      → 100 (a documented "takes nothing" is complete)
//   • medications_present → grade the 4 facets in code
// The LLM classifies the status + assigns per-facet statuses; the score is
// computed in code. Same pinned gpt-oss-120b judge as problem/allergy scoring.
// ---------------------------------------------------------------------------
import { ovh } from './ovh.js';
import { chatWithFallback, type FallbackOpts } from './llmFallback.js';
import { config } from '../config.js';
import { computeScore, type FacetStatus } from './problemScore.js';

const SCORE_FALLBACK: FallbackOpts = {
  primaryModel: config.nebius.problemScoreModel,
  timeoutMs: 10_000,
  backupClient: ovh,
  backupModel: config.ovh.model,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MedicationStatus = 'medications_present' | 'no_medications' | 'not_assessed';

export interface MedicationFacet {
  axis: string;
  status: FacetStatus;
  evidence: string;
}

export interface MedicationScoreResult {
  scorable: boolean;
  score: number | null;             // 0–100, null when not scorable
  status: MedicationStatus;
  facets: MedicationFacet[] | null;  // only when medications are present
  suggestion: string | null;         // one sentence; null at 100 / none
}

// The fixed rubric (from interview Stage 5 — Medications). Equal weight.
const MEDICATION_FACETS: { axis: string; hint: string }[] = [
  { axis: 'Medication named', hint: 'the drug or product name (e.g. paracetamol, metformin, amlodipine)' },
  { axis: 'Dosage', hint: 'the strength or amount per dose (e.g. 500 mg, 10 units, one tablet)' },
  { axis: 'Frequency', hint: 'how often it is taken (e.g. twice daily, every 8 hours, as needed)' },
  { axis: 'Purpose or indication', hint: 'what the medication is for, or that it was taken for the current problem' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isEmptyText(text: string): boolean {
  const t = text.trim().toLowerCase();
  return t.length === 0 || t === 'not assessed' || t === 'n/a' || t === '—' || t === '-';
}

function stripFences(raw: string): string {
  return raw.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
}

function normalizeFacetStatus(v: unknown): FacetStatus {
  const s = String(v ?? '').toLowerCase();
  if (s === 'complete' || s === 'partial' || s === 'not_applicable') return s;
  return 'absent';
}

function normalizeStatus(v: unknown): MedicationStatus {
  const s = String(v ?? '').toLowerCase();
  if (s === 'medications_present' || s === 'no_medications') return s;
  return 'not_assessed';
}

// ---------------------------------------------------------------------------
// LLM grading
// ---------------------------------------------------------------------------

async function gradeMedications(
  text: string,
): Promise<{ status: MedicationStatus; facets: MedicationFacet[]; suggestion: string }> {
  const numbered = MEDICATION_FACETS.map((f, i) => `${i + 1}. ${f.axis} — ${f.hint}`).join('\n');

  const system = `You are a maritime medical QA reviewer. Grade how well the CURRENT MEDICATIONS field of a medical report is documented for a shore-based doctor. Judge documentation quality only, not clinical management.

First classify the field's status as one of:
- "not_assessed": the field is empty, says "not assessed", or gives no medication information at all.
- "no_medications": the field clearly states the patient takes NO medications (e.g. "No current medications", "none", "Patient states no medications").
- "medications_present": the field names one or more medications.

If (and only if) the status is "medications_present", grade the documentation against EACH of the following axes, in order:
${numbered}

For each axis assign a status:
- "complete": documented with actionable specificity for ALL listed medications.
- "partial": mentioned but vague, or complete for only some of the listed medications.
- "absent": not addressed at all.
- "not_applicable": the axis genuinely cannot apply.
Ground every "complete"/"partial" grade in a verbatim quote from the text; if you cannot quote supporting text, the status is "absent" (evidence "").

If the status is NOT "medications_present", return an empty "grades" array.

Also write ONE short sentence naming the single most useful thing to ask about or add next — just one thing, not a list. Use plain, everyday language that a person with NO medical training understands: no medical jargon or abbreviations. Return "" for the suggestion when the status is "no_medications" or when every axis is already "complete".

Return ONLY a JSON object with this shape (grades in the same order as the axes):
{"status":"not_assessed|no_medications|medications_present","grades":[{"status":"complete|partial|absent|not_applicable","evidence":"<verbatim quote or empty>"}],"suggestion":"<one sentence or empty>"}`;

  const completion = await chatWithFallback({
    temperature: 0.15,
    max_tokens: 1200,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: text },
    ],
  }, SCORE_FALLBACK);

  const raw = stripFences(completion.choices[0]?.message?.content?.trim() ?? '{}');
  const parsed = JSON.parse(raw) as {
    status?: unknown;
    grades?: { status?: unknown; evidence?: unknown }[];
    suggestion?: unknown;
  };

  const status = normalizeStatus(parsed.status);
  const grades = Array.isArray(parsed.grades) ? parsed.grades : [];
  const facets: MedicationFacet[] = MEDICATION_FACETS.map((f, i) => {
    const g = grades[i];
    const st = normalizeFacetStatus(g?.status);
    const evidence = typeof g?.evidence === 'string' ? g.evidence : '';
    return { axis: f.axis, status: st, evidence: st === 'absent' ? '' : evidence };
  });

  const suggestion = typeof parsed.suggestion === 'string' ? parsed.suggestion.trim() : '';
  return { status, facets, suggestion };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const NOT_ASSESSED_SUGGESTION =
  'Ask the patient about current medications — record each drug with its dose and frequency, or note that they take none.';

export async function scoreMedications(medications: string): Promise<MedicationScoreResult> {
  const text = (medications ?? '').trim();

  // Never asked / empty → not scorable.
  if (isEmptyText(text)) {
    return {
      scorable: false,
      score: null,
      status: 'not_assessed',
      facets: null,
      suggestion: NOT_ASSESSED_SUGGESTION,
    };
  }

  const { status, facets, suggestion } = await gradeMedications(text);

  if (status === 'not_assessed') {
    return {
      scorable: false,
      score: null,
      status,
      facets: null,
      suggestion: NOT_ASSESSED_SUGGESTION,
    };
  }

  // A documented "takes nothing" is complete.
  if (status === 'no_medications') {
    return { scorable: true, score: 100, status, facets: [], suggestion: null };
  }

  // Medications present → grade the fixed facets in code.
  const score = computeScore(facets);
  return {
    scorable: true,
    score,
    status,
    facets,
    suggestion: score >= 100 ? null : (suggestion || null),
  };
}
