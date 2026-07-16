// ---------------------------------------------------------------------------
// allergyScore.ts — grade a report's "Allergies" field (0–100).
//
// Unlike the Problem Description, the allergy rubric is NOT symptom-specific —
// symptomGuidelines has no allergy axes and interview Stage 6 (Allergies) asks
// the same questions for every case. So the rubric is a FIXED set of facets
// drawn from that stage's protocol. Three states:
//   • not_assessed       → not scorable (never asked / empty)
//   • no_known_allergies → 100 (a documented negative is complete)
//   • allergies_present  → grade the 4 facets in code
// The LLM only classifies the status and assigns per-facet statuses; the numeric
// score is computed in code. Same pinned gpt-oss-120b judge as problemScore.
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

export type AllergyStatus = 'allergies_present' | 'no_known_allergies' | 'not_assessed';

export interface AllergyFacet {
  axis: string;
  status: FacetStatus;
  evidence: string;
}

export interface AllergyScoreResult {
  scorable: boolean;
  score: number | null;           // 0–100, null when not scorable
  status: AllergyStatus;
  facets: AllergyFacet[] | null;   // only when allergies are present
  suggestion: string | null;      // one sentence; null at 100 / NKDA
}

// The fixed rubric (from interview Stage 6 — Allergies). Equal weight.
const ALLERGY_FACETS: { axis: string; hint: string }[] = [
  { axis: 'Allergen named', hint: 'the specific substance the patient is allergic to (e.g. penicillin, peanuts, latex)' },
  { axis: 'Allergen type', hint: 'the category of the allergen: medication, food, environmental, or other' },
  { axis: 'Reaction described', hint: 'what reaction the substance causes (e.g. rash, swelling, difficulty breathing, anaphylaxis)' },
  { axis: 'Reaction severity or recurrence', hint: 'how severe the reaction is, or whether it has happened more than once' },
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

function normalizeStatus(v: unknown): AllergyStatus {
  const s = String(v ?? '').toLowerCase();
  if (s === 'allergies_present' || s === 'no_known_allergies') return s;
  return 'not_assessed';
}

// ---------------------------------------------------------------------------
// LLM grading
// ---------------------------------------------------------------------------

async function gradeAllergies(
  text: string,
): Promise<{ status: AllergyStatus; facets: AllergyFacet[]; suggestion: string }> {
  const numbered = ALLERGY_FACETS.map((f, i) => `${i + 1}. ${f.axis} — ${f.hint}`).join('\n');

  const system = `You are a maritime medical QA reviewer. Grade how well the ALLERGIES field of a medical report is documented for a shore-based doctor. Judge documentation quality only, not clinical management.

First classify the field's status as one of:
- "not_assessed": the field is empty, says "not assessed", or gives no allergy information at all.
- "no_known_allergies": the field clearly states the patient has NO known allergies (e.g. "No known allergies", "NKDA", "none").
- "allergies_present": the field names one or more allergies.

If (and only if) the status is "allergies_present", grade the documentation against EACH of the following axes, in order:
${numbered}

For each axis assign a status:
- "complete": documented with actionable specificity for ALL listed allergies.
- "partial": mentioned but vague, or complete for only some of the listed allergies.
- "absent": not addressed at all.
- "not_applicable": the axis genuinely cannot apply.
Ground every "complete"/"partial" grade in a verbatim quote from the text; if you cannot quote supporting text, the status is "absent" (evidence "").

If the status is NOT "allergies_present", return an empty "grades" array.

Also write ONE short, DIRECT QUESTION to ask the patient — the single most useful thing still to find out about their allergies. Keep it concise, to the point, and easy for anyone to understand: no medical jargon or abbreviations (for example "What happens when you take penicillin?"). Return "" for the suggestion when the status is "no_known_allergies" or when every axis is already "complete".

Return ONLY a JSON object with this shape (grades in the same order as the axes):
{"status":"not_assessed|no_known_allergies|allergies_present","grades":[{"status":"complete|partial|absent|not_applicable","evidence":"<verbatim quote or empty>"}],"suggestion":"<one sentence or empty>"}`;

  const completion = await chatWithFallback({
    reasoning_effort: 'low',
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
  const facets: AllergyFacet[] = ALLERGY_FACETS.map((f, i) => {
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
  'Ask the patient about allergies — record any known allergen, its type and reaction, or note "No known allergies".';

export async function scoreAllergies(allergies: string): Promise<AllergyScoreResult> {
  const text = (allergies ?? '').trim();

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

  const { status, facets, suggestion } = await gradeAllergies(text);

  if (status === 'not_assessed') {
    return {
      scorable: false,
      score: null,
      status,
      facets: null,
      suggestion: NOT_ASSESSED_SUGGESTION,
    };
  }

  // A documented negative is complete.
  if (status === 'no_known_allergies') {
    return { scorable: true, score: 100, status, facets: [], suggestion: null };
  }

  // Allergies present → grade the fixed facets in code.
  const score = computeScore(facets);
  return {
    scorable: true,
    score,
    status,
    facets,
    suggestion: score >= 100 ? null : (suggestion || null),
  };
}
