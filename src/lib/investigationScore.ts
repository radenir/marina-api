// ---------------------------------------------------------------------------
// investigationScore.ts — grade a report's investigations 0–100 against the
// symptom's SYBRA "Investigations" list.
//
// Unlike the history scorers, this rubric is a CONDITIONAL checklist: each rule
// pairs a test with a condition ("CRP if temperature ≥38°C", "Pregnancy test if
// female 12–55", "Malaria test if fever + travel"). Two questions per rule:
//   1. Is it applicable? — resolve the condition from the case facts.
//   2. If applicable, is it documented as done (with a result)?
// The LLM resolves applicability + documentation status per rule; the score is
// computed in code over APPLICABLE rules only. Unmet/unknown conditions drop to
// not_applicable (never penalised). If no investigation is indicated for this
// case, nothing was required → score 100.
// ---------------------------------------------------------------------------
import { ovh } from './ovh.js';
import { chatWithFallback, type FallbackOpts } from './llmFallback.js';
import { config } from '../config.js';
import { computeScore, type FacetStatus } from './problemScore.js';
import { symptomGuidelines as _symptomGuidelines } from './symptomGuidelines.js';

type SymptomGuideline = { Investigations?: string[] };
const symptomGuidelines = _symptomGuidelines as unknown as Record<string, SymptomGuideline>;

const SYMPTOM_KEYS: string[] = Object.keys(symptomGuidelines);
// Symptoms that actually carry investigations — used for the identify classifier.
const SYMPTOMS_WITH_INVESTIGATIONS: string[] = SYMPTOM_KEYS.filter(
  (k) => Array.isArray(symptomGuidelines[k]?.Investigations) &&
    (symptomGuidelines[k].Investigations as string[]).length > 0,
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

export interface InvestigationFacet {
  investigation: string;   // the SYBRA rule text
  applicable: boolean;     // condition met for this case?
  status: FacetStatus;     // applicable → complete/partial/absent; else not_applicable
  evidence: string;
}

export interface InvestigationScoreInput {
  documentation: string;         // where results are recorded (e.g. performedActions)
  pathway?: string;              // known SYBRA symptom
  chiefComplaint?: string;       // helps identify the symptom when pathway is absent
  temperatureCelsius?: string;   // to resolve temperature conditions
  gender?: string;               // to resolve gender conditions
  age?: number;                  // to resolve age conditions
  caseSummary?: string;          // problem description / history for narrative conditions
}

export interface InvestigationScoreResult {
  scorable: boolean;
  score: number | null;
  pathway: string | null;
  required: number;                    // count of applicable investigations
  facets: InvestigationFacet[] | null;
  suggestion: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripFences(raw: string): string {
  return raw.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
}

function normalizeFacetStatus(v: unknown): FacetStatus {
  const s = String(v ?? '').toLowerCase();
  if (s === 'complete' || s === 'partial' || s === 'not_applicable') return s;
  return 'absent';
}

function resolvePathway(input: string | undefined): string | null {
  if (!input) return null;
  if (SYMPTOM_KEYS.includes(input)) return input;
  const ci = SYMPTOM_KEYS.find((s) => s.toLowerCase() === input.toLowerCase());
  return ci ?? null;
}

async function identifyPathway(text: string): Promise<string | null> {
  const system = `You are a maritime triage classifier. Read the text and pick the SINGLE best-matching symptom from EXACTLY this list, using the exact spelling:
${SYMPTOMS_WITH_INVESTIGATIONS.join(', ')}

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
  return resolvePathway(symptom);
}

// ---------------------------------------------------------------------------
// LLM grading
// ---------------------------------------------------------------------------

async function gradeInvestigations(
  input: InvestigationScoreInput,
  pathway: string,
  rules: string[],
): Promise<{ facets: InvestigationFacet[]; suggestion: string }> {
  const numbered = rules.map((r, i) => `${i + 1}. ${r}`).join('\n');

  const facts = [
    input.temperatureCelsius ? `Temperature: ${input.temperatureCelsius} °C` : 'Temperature: not recorded',
    input.gender ? `Gender: ${input.gender}` : 'Gender: not recorded',
    (input.age !== undefined && input.age !== null) ? `Age: ${input.age}` : 'Age: not recorded',
  ].join('\n');

  const system = `You are a maritime medical QA reviewer. For a patient whose primary complaint is "${pathway}", judge how well the report documents the INVESTIGATIONS (tests) that are indicated for this specific case. Judge documentation quality only, not clinical management.

Each expected investigation below is CONDITIONAL — it is only indicated when its condition is met. Evaluate each against the case facts and case summary provided:

EXPECTED INVESTIGATIONS (test — condition):
${numbered}

CASE FACTS:
${facts}

The CASE FACTS above are AUTHORITATIVE. Use ONLY these values for temperature, gender and age conditions, and IGNORE any different temperature/gender/age mentioned in the case summary or documentation (e.g. a temperature the patient reported earlier). A fact shown as "not recorded" is unestablished — do NOT infer it from the narrative. Conditions that are not covered by the case facts (diabetic status, recent travel, associated symptoms, kidney pain, etc.) are judged from the case summary.

For EACH investigation, decide "applicable":
- true — the condition is clearly MET by the case facts / case summary (an unconditional "always" test is always applicable);
- true (PENDING) — the condition CANNOT be ruled out because a fact needed to judge it has NOT been established: e.g. the temperature has not been measured, or diabetic status / recent travel / a relevant symptom was never assessed. Treat such a test as indicated-until-ruled-out — the officer must first establish that fact. Do NOT assume a missing measurement means the condition is absent (an unmeasured temperature is NOT "afebrile"; unstated diabetic status is NOT "not diabetic").
- false — ONLY when the condition is clearly NOT met by an ESTABLISHED fact (e.g. temperature is recorded and is <38°C, or the patient is documented as not diabetic).

For every applicable investigation (met OR pending), assign a documentation "status":
- "complete": documented as performed WITH a result.
- "partial": mentioned or ordered but no result recorded.
- "absent": not documented — this INCLUDES a test that is pending on a fact that has not been established.
Ground every "complete"/"partial" in a verbatim quote from the documentation; otherwise status is "absent" (evidence "").

Also write ONE short, DIRECT QUESTION or instruction — the single most important next test or check. Keep it concise, to the point, and easy for anyone to understand: no medical jargon, abbreviations or test codes (say "a blood test to check for infection" rather than "CRP"). If it depends on something not yet known, ask for that first (for example "What is the patient's temperature?"). Return "" if nothing applicable is missing.

Return ONLY a JSON object (one entry per investigation, in order):
{"grades":[{"applicable":true|false,"status":"complete|partial|absent","evidence":"<verbatim quote or empty>"}],"suggestion":"<one sentence or empty>"}`;

  const user = `CASE SUMMARY (problem / history):
${input.caseSummary?.trim() || '(none provided)'}

DOCUMENTATION (where investigation results would be recorded):
${input.documentation?.trim() || '(empty)'}`;

  const completion = await chatWithFallback({
    temperature: 0.15,
    max_tokens: 1500,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  }, SCORE_FALLBACK);

  const raw = stripFences(completion.choices[0]?.message?.content?.trim() ?? '{}');
  const parsed = JSON.parse(raw) as {
    grades?: { applicable?: unknown; status?: unknown; evidence?: unknown }[];
    suggestion?: unknown;
  };

  const grades = Array.isArray(parsed.grades) ? parsed.grades : [];
  const facets: InvestigationFacet[] = rules.map((investigation, i) => {
    const g = grades[i];
    const applicable = g?.applicable === true;
    const status: FacetStatus = applicable ? normalizeFacetStatus(g?.status) : 'not_applicable';
    const evidence = typeof g?.evidence === 'string' ? g.evidence : '';
    return { investigation, applicable, status, evidence: status === 'absent' ? '' : evidence };
  });

  const suggestion = typeof parsed.suggestion === 'string' ? parsed.suggestion.trim() : '';
  return { facets, suggestion };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function scoreInvestigations(
  input: InvestigationScoreInput,
): Promise<InvestigationScoreResult> {
  // Resolve the symptom (needed to know which investigations are expected).
  let pathway = resolvePathway(input.pathway);
  if (!pathway) {
    const idText = [input.chiefComplaint, input.caseSummary, input.documentation]
      .filter(Boolean).join('\n\n').trim();
    if (idText) pathway = await identifyPathway(idText);
  }
  if (!pathway) {
    return {
      scorable: false,
      score: null,
      pathway: null,
      required: 0,
      facets: null,
      suggestion: 'Identify the primary complaint so the required investigations can be assessed.',
    };
  }

  const rules = (symptomGuidelines[pathway]?.Investigations ?? []).filter((r) => r && r.trim().length > 0);

  // No investigations defined for this symptom → nothing required → complete.
  if (rules.length === 0) {
    return { scorable: true, score: 100, pathway, required: 0, facets: [], suggestion: null };
  }

  const { facets, suggestion } = await gradeInvestigations(input, pathway, rules);
  const applicable = facets.filter((f) => f.applicable);

  // No investigation indicated for THIS case → nothing was required → complete.
  if (applicable.length === 0) {
    return { scorable: true, score: 100, pathway, required: 0, facets, suggestion: null };
  }

  const score = computeScore(facets);   // not_applicable rules are dropped
  return {
    scorable: true,
    score,
    pathway,
    required: applicable.length,
    facets,
    suggestion: score >= 100 ? null : (suggestion || null),
  };
}
