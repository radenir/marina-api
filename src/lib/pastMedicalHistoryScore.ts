// ---------------------------------------------------------------------------
// pastMedicalHistoryScore.ts — grade a report's "Past Medical History" field
// (0–100). Parallel to associatedSymptomsScore: the rubric is the identified
// symptom's SYBRA "Focused Past Medical History" list (per-symptom, from
// symptomGuidelines). The LLM assigns per-facet statuses; the score is computed
// in code. Like associated symptoms:
//   • a documented NEGATIVE counts as complete ("no prior surgery",
//     "denies heart disease" fully covers that facet)
//   • gender/age-conditional items (e.g. pregnancy status for a male patient)
//     drop to not_applicable.
// ---------------------------------------------------------------------------
import { ovh } from './ovh.js';
import { chatWithFallback, type FallbackOpts } from './llmFallback.js';
import { config } from '../config.js';
import { computeScore, type FacetStatus } from './problemScore.js';
import { symptomGuidelines as _symptomGuidelines } from './symptomGuidelines.js';

type SymptomGuideline = { 'Focused Past Medical History'?: string[] };
const symptomGuidelines = _symptomGuidelines as unknown as Record<string, SymptomGuideline>;

const VALID_SYMPTOMS: string[] = Object.keys(symptomGuidelines).filter(
  (k) => Array.isArray(symptomGuidelines[k]?.['Focused Past Medical History']) &&
    (symptomGuidelines[k]['Focused Past Medical History'] as string[]).length > 0,
);

const SCORE_FALLBACK: FallbackOpts = {
  primaryModel: config.nebius.problemScoreModel,
  timeoutMs: 10_000,
  backupClient: ovh,
  backupModel: config.ovh.model,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PastHistoryFacet {
  axis: string;
  status: FacetStatus;
  evidence: string;
}

export interface PastMedicalHistoryInput {
  pastMedicalHistory: string;
  chiefComplaint?: string;
  pathway?: string;
}

export interface PastMedicalHistoryResult {
  scorable: boolean;
  score: number | null;
  pathway: string | null;
  facets: PastHistoryFacet[] | null;
  suggestion: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function combinedText(input: PastMedicalHistoryInput): string {
  const cc = (input.chiefComplaint ?? '').trim();
  const pmh = (input.pastMedicalHistory ?? '').trim();
  if (cc && pmh) return `Chief complaint: ${cc}\n\nPast medical history: ${pmh}`;
  return pmh || cc;
}

function isEmptyText(text: string): boolean {
  const t = text.trim().toLowerCase();
  return t.length === 0 || t === 'not assessed' || t === 'n/a' || t === '—' || t === '-';
}

function stripFences(raw: string): string {
  return raw.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
}

function normalizeStatus(v: unknown): FacetStatus {
  const s = String(v ?? '').toLowerCase();
  if (s === 'complete' || s === 'partial' || s === 'not_applicable') return s;
  return 'absent';
}

// ---------------------------------------------------------------------------
// LLM
// ---------------------------------------------------------------------------

/** Identify the SYBRA symptom from the text, or null if none is identifiable. */
async function identifyPathway(text: string): Promise<string | null> {
  const system = `You are a maritime triage classifier. Read the text and pick the SINGLE best-matching symptom from EXACTLY this list, using the exact spelling:
${VALID_SYMPTOMS.join(', ')}

If the text does not point to an identifiable primary complaint, return "UNKNOWN".

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
  if (VALID_SYMPTOMS.includes(symptom)) return symptom;
  const ci = VALID_SYMPTOMS.find((s) => s.toLowerCase() === symptom.toLowerCase());
  return ci ?? null;
}

/** Grade each expected past-history topic against the text + one suggestion. */
async function gradeFacets(
  text: string,
  pathway: string,
  axes: string[],
): Promise<{ facets: PastHistoryFacet[]; suggestion: string }> {
  const numbered = axes.map((a, i) => `${i + 1}. ${a}`).join('\n');

  const system = `You are a maritime medical QA reviewer. Grade how well the PAST MEDICAL HISTORY documentation covers the history topics that matter for a patient whose primary complaint is "${pathway}", for a shore-based doctor. Judge documentation quality only, not clinical management.

Grade the text against EACH expected past-history topic below, in order:
${numbered}

For each, assign a status:
- "complete": the text clearly documents this topic as PRESENT **or** EXPLICITLY DENIED/absent (e.g. "prior appendectomy", "no previous surgery", "denies heart disease"). A documented negative counts as complete — ruling a condition out is just as valuable as ruling it in.
- "partial": alluded to but ambiguous.
- "absent": not addressed at all — neither confirmed nor denied.
- "not_applicable": the topic genuinely cannot apply to this patient (e.g. pregnancy status for a male patient).
Ground every "complete"/"partial" grade in a verbatim quote from the text; if you cannot quote supporting text, the status is "absent" (evidence "").

Also write ONE short sentence naming the single most useful past-health topic still to ask about — just one thing, not a list. Use plain, everyday language that a person with NO medical training understands: no medical jargon or abbreviations. Return "" if every axis is already "complete".

Return ONLY a JSON object (one grade per axis, same order):
{"grades":[{"status":"complete|partial|absent|not_applicable","evidence":"<verbatim quote or empty>"}],"suggestion":"<one sentence or empty>"}`;

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
  const facets: PastHistoryFacet[] = axes.map((axis, i) => {
    const g = grades[i];
    const status = normalizeStatus(g?.status);
    const evidence = typeof g?.evidence === 'string' ? g.evidence : '';
    return { axis, status, evidence: status === 'absent' ? '' : evidence };
  });

  const suggestion = typeof parsed.suggestion === 'string' ? parsed.suggestion.trim() : '';
  return { facets, suggestion };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function scorePastMedicalHistory(
  input: PastMedicalHistoryInput,
): Promise<PastMedicalHistoryResult> {
  const text = combinedText(input);

  if (isEmptyText(text)) {
    return {
      scorable: false,
      score: null,
      pathway: null,
      facets: null,
      suggestion: 'Ask about past medical history relevant to this complaint — prior conditions, surgeries and hospitalisations — and record what the patient confirms and denies.',
    };
  }

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
  if (!pathway) {
    return {
      scorable: false,
      score: null,
      pathway: null,
      facets: null,
      suggestion: 'State the primary complaint so the past medical history can be assessed against the right protocol.',
    };
  }

  const axes = symptomGuidelines[pathway]['Focused Past Medical History'] as string[];
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
