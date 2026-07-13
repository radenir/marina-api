// ---------------------------------------------------------------------------
// problemScore.ts — grade a report's "Problem Description" (0–100).
//
// The rubric is the identified symptom's SYBRA "History Taking" list from
// symptomGuidelines — each item is one equally-weighted facet. The LLM only
// assigns a per-facet status (complete / partial / absent / not_applicable);
// the numeric score is computed in code. If no symptom / chief complaint can be
// identified from the text, the section is not scorable (no score shown).
// ---------------------------------------------------------------------------
import { ovh } from './ovh.js';
import { chatWithFallback, type FallbackOpts } from './llmFallback.js';
import { config } from '../config.js';
import { symptomGuidelines as _symptomGuidelines } from './symptomGuidelines.js';

// Typed access to the string-keyed guideline data.
type SymptomGuideline = { 'History Taking'?: string[] };
const symptomGuidelines = _symptomGuidelines as unknown as Record<string, SymptomGuideline>;

// Valid symptoms = guideline entries that actually carry a History Taking list.
const VALID_SYMPTOMS: string[] = Object.keys(symptomGuidelines).filter(
  (k) => Array.isArray(symptomGuidelines[k]?.['History Taking']) &&
    (symptomGuidelines[k]['History Taking'] as string[]).length > 0,
);

// Grading runs on a pinned gpt-oss-120b judge (kept fixed independent of the
// interview model): Nebius gpt-oss-120b primary, OVH gpt-oss-120b backup on a
// 10s timeout. gpt-oss is not reason-by-default, so no reasoning_effort override.
const SCORE_FALLBACK: FallbackOpts = {
  primaryModel: config.nebius.problemScoreModel,
  timeoutMs: 10_000,
  backupClient: ovh,
  backupModel: config.ovh.model,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FacetStatus = 'complete' | 'partial' | 'absent' | 'not_applicable';

export interface ProblemFacet {
  axis: string;        // the SYBRA History Taking item
  status: FacetStatus;
  evidence: string;    // verbatim quote from the text, or ""
}

export interface ProblemScoreInput {
  problemDescription: string;
  chiefComplaint?: string;
  pathway?: string;    // known SYBRA symptom, if the interview already identified it
}

export interface ProblemScoreResult {
  scorable: boolean;
  score: number | null;          // 0–100, null when not scorable
  pathway: string | null;        // the symptom the rubric was drawn from
  facets: ProblemFacet[] | null;
  suggestion: string | null;     // one sentence; null when score is 100
}

// ---------------------------------------------------------------------------
// Scoring (pure code — grade ∈ {1, 0.5, 0}; not_applicable is dropped)
// ---------------------------------------------------------------------------

const GRADE: Record<FacetStatus, number | null> = {
  complete: 1,
  partial: 0.5,
  absent: 0,
  not_applicable: null,
};

export function computeScore(facets: ProblemFacet[]): number {
  let num = 0;
  let den = 0;
  for (const f of facets) {
    const g = GRADE[f.status];
    if (g === null) continue;   // not_applicable → out of both sums
    num += g;                   // equal weight → weight_i = 1
    den += 1;
  }
  return den === 0 ? 0 : Math.round((num / den) * 100);
}

// ---------------------------------------------------------------------------
// LLM helpers
// ---------------------------------------------------------------------------

function combinedText(input: ProblemScoreInput): string {
  const cc = (input.chiefComplaint ?? '').trim();
  const pd = (input.problemDescription ?? '').trim();
  if (cc && pd) return `Chief complaint: ${cc}\n\n${pd}`;
  return cc || pd;
}

/** True when the text has no gradeable clinical content. */
function isEmptyText(text: string): boolean {
  const t = text.trim().toLowerCase();
  return t.length === 0 || t === 'not assessed' || t === 'n/a' || t === '—' || t === '-';
}

function stripFences(raw: string): string {
  return raw.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
}

/** Identify the SYBRA symptom from the free text, or null if none is identifiable. */
async function identifyPathway(text: string): Promise<string | null> {
  const system = `You are a maritime triage classifier. Read the problem description and pick the SINGLE best-matching symptom from EXACTLY this list, using the exact spelling:
${VALID_SYMPTOMS.join(', ')}

If the text does not describe an identifiable chief complaint (it is empty, non-clinical, or too vague to name a primary problem), return "UNKNOWN".

Return ONLY a JSON object: {"symptom": "<exact name from the list, or UNKNOWN>"}`;

  const completion = await chatWithFallback({
    temperature: 0,
    max_tokens: 60,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: text },
    ],
  }, SCORE_FALLBACK);

  const raw = stripFences(completion.choices[0]?.message?.content?.trim() ?? '{}');
  let symptom: string;
  try {
    symptom = String((JSON.parse(raw) as { symptom?: unknown }).symptom ?? '').trim();
  } catch {
    return null;
  }
  if (!symptom || symptom.toUpperCase() === 'UNKNOWN') return null;
  // Exact match, else case-insensitive match against the valid set.
  if (VALID_SYMPTOMS.includes(symptom)) return symptom;
  const ci = VALID_SYMPTOMS.find((s) => s.toLowerCase() === symptom.toLowerCase());
  return ci ?? null;
}

/** Grade each History Taking axis against the text and produce one improvement hint. */
async function gradeFacets(
  text: string,
  pathway: string,
  axes: string[],
): Promise<{ facets: ProblemFacet[]; suggestion: string }> {
  const numbered = axes.map((a, i) => `${i + 1}. ${a}`).join('\n');

  const system = `You are a maritime medical QA reviewer. Grade how well the PROBLEM DESCRIPTION documents the history of the presenting complaint for a shore-based doctor. The identified symptom is "${pathway}".

Grade the description against EACH of the following expected axes, in order:
${numbered}

For each axis assign a status:
- "complete": the axis is documented with actionable specificity (a doctor could act without follow-up).
- "partial": the axis is touched on but vague or non-specific.
- "absent": the axis is not addressed at all.
- "not_applicable": the axis genuinely cannot apply to this patient/case.

RULES:
- Ground every "complete" or "partial" grade in a verbatim quote from the text. If you cannot quote supporting text, the status is "absent" (evidence "").
- Judge ONLY documentation quality, not clinical management. Do not infer facts that are not written.
- Use "not_applicable" sparingly — only when the axis truly cannot apply.

Also write ONE concise, direct sentence telling the officer the single most impactful detail to add to improve this field. If every axis is already "complete", return "" for the suggestion.

Return ONLY a JSON object with this shape (one grade per axis, in the same order):
{"grades":[{"status":"complete|partial|absent|not_applicable","evidence":"<verbatim quote or empty>"}], "suggestion":"<one sentence or empty>"}`;

  const completion = await chatWithFallback({
    temperature: 0.15,
    max_tokens: 1500,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: text },
    ],
  }, SCORE_FALLBACK);

  const raw = stripFences(completion.choices[0]?.message?.content?.trim() ?? '{}');
  const parsed = JSON.parse(raw) as {
    grades?: { status?: unknown; evidence?: unknown }[];
    suggestion?: unknown;
  };

  const grades = Array.isArray(parsed.grades) ? parsed.grades : [];
  const facets: ProblemFacet[] = axes.map((axis, i) => {
    const g = grades[i];
    const status = normalizeStatus(g?.status);
    const evidence = typeof g?.evidence === 'string' ? g.evidence : '';
    return { axis, status, evidence: status === 'absent' ? '' : evidence };
  });

  const suggestion = typeof parsed.suggestion === 'string' ? parsed.suggestion.trim() : '';
  return { facets, suggestion };
}

function normalizeStatus(v: unknown): FacetStatus {
  const s = String(v ?? '').toLowerCase();
  if (s === 'complete' || s === 'partial' || s === 'not_applicable') return s;
  return 'absent';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function scoreProblemDescription(
  input: ProblemScoreInput,
): Promise<ProblemScoreResult> {
  const text = combinedText(input);

  // No gradeable content → not scorable (no score shown).
  if (isEmptyText(text)) {
    return {
      scorable: false,
      score: null,
      pathway: null,
      facets: null,
      suggestion: 'State the patient’s main problem — what is wrong and since when — so the report can be graded.',
    };
  }

  // Resolve the symptom: use a valid supplied pathway, else identify from the text.
  let pathway: string | null = null;
  if (input.pathway) {
    if (VALID_SYMPTOMS.includes(input.pathway)) {
      pathway = input.pathway;
    } else {
      const ci = VALID_SYMPTOMS.find((s) => s.toLowerCase() === input.pathway!.toLowerCase());
      pathway = ci ?? null;
    }
  }
  if (!pathway) {
    pathway = await identifyPathway(text);
  }

  // Chief complaint / symptom not identifiable → not scorable.
  if (!pathway) {
    return {
      scorable: false,
      score: null,
      pathway: null,
      facets: null,
      suggestion: 'State the patient’s main problem clearly so the description can be assessed against the right protocol.',
    };
  }

  const axes = symptomGuidelines[pathway]['History Taking'] as string[];
  const { facets, suggestion } = await gradeFacets(text, pathway, axes);
  const score = computeScore(facets);

  return {
    scorable: true,
    score,
    pathway,
    facets,
    suggestion: score >= 100 ? null : (suggestion || null),
  };
}
