// ---------------------------------------------------------------------------
// physicalExaminationScore.ts — grade a report's "Physical Examination" field
// (0–100) against the symptom's SYBRA examination protocol.
//
// Directly parallel to the history-taking / associated-symptoms scorers. Each
// pathway has ONE chosen examination (PATHWAY_EXAMINATION below) — the
// pathway-specific one, the same examination the interview centres on for that
// complaint, not the generic supports (General appearance, Vital signs, etc.).
// That examination resolves in examinationInstructions to a list of INDIVIDUAL
// QUESTIONS (e.g. "Is the belly swollen or distended?", "Is there rebound
// tenderness?"). Those individual questions are the rubric — one equally-weighted
// facet each, exactly as each "History Taking" line is a facet in problemScore.
// The LLM assigns a per-question documentation status (complete / partial /
// absent / not_applicable); the 0–100 score is computed in code (computeScore).
//
// Nuances:
//   • a documented NORMAL/NEGATIVE answer counts as complete — establishing a
//     finding is the point (e.g. "abdomen not distended" answers the distension
//     question).
//   • sex-conditional examinations (Testicular / Male Genital inspection) have
//     their questions dropped to not_applicable for a non-male patient, and
//     individual conditional questions ("[If there is active bleeding] …") drop
//     to not_applicable when the precondition is not met.
// If no symptom can be identified, the section is not scorable (no score shown).
// ---------------------------------------------------------------------------
import { ovh } from './ovh.js';
import { chatWithFallback, type FallbackOpts } from './llmFallback.js';
import { config } from '../config.js';
import { computeScore, type FacetStatus } from './problemScore.js';
import {
  symptomGuidelines as _symptomGuidelines,
  examinationDisplayNames as _examinationDisplayNames,
  examinationIds as _examinationIds,
} from './symptomGuidelines.js';
import { examinationInstructions as _examinationInstructions } from './examinationInstructions.js';

type SymptomGuideline = { Examinations?: number[] };
const symptomGuidelines = _symptomGuidelines as unknown as Record<string, SymptomGuideline>;
const examinationDisplayNames = _examinationDisplayNames as unknown as Record<number, string>;
const examinationInstructions = _examinationInstructions as unknown as Record<number, string>;
const E = _examinationIds as unknown as Record<string, number>;

// ---------------------------------------------------------------------------
// The one chosen examination per pathway (approved). Keyed by the exact
// symptomGuidelines symptom name. For pathways that list several examinations,
// this is the pathway-specific one (the generic supports — General appearance,
// Vital signs, Capillary refill — are not graded here).
// ---------------------------------------------------------------------------
const PATHWAY_EXAMINATION: Record<string, number> = {
  'Abdominal Pain': E.ABDOMINAL_PAIN,
  'Fever': E.INFECTION_FOCUS,
  'Chest pain': E.BREATHING_CHECK,
  'Headache': E.ADVANCED_NEURO,
  'Nausea and Vomiting': E.ABDOMEN_EXAM,
  'Back Pain': E.BACK_PAIN,
  'Cough/Respiratory Symptoms': E.BREATHING_CHECK,
  'Dizziness/Vertigo': E.ADVANCED_NEURO,
  'Skin Infections/Rash': E.SKIN_ASSESSMENT,
  'Dental Pain': E.DENTAL_EXAM,
  'Laceration or Open Wounds': E.WOUND_EXAM,
  'Eye Pain': E.EYE_EXAM,
  'Ear Pain or Hearing Problems': E.EARS_CHECK,
  'Urinary Symptoms': E.ABDOMINAL_PAIN,
  'Shortness of Breath': E.BREATHING_CHECK,
  'Joint Pain or Swelling': E.JOINT_EXAM,
  'Fatigue or Exhaustion': E.DEHYDRATION,
  'Diarrhea': E.ABDOMEN_EXAM,
  'Psychological Stress or Anxiety': E.MENTAL_EVAL,
  'Unspecific Symptoms': E.GENERAL_APPEARANCE,
  'Anaphylaxis and Allergic Reactions': E.BREATHING_CHECK,
  'Palpitations or Irregular Heartbeat': E.PULSE_CHECK,
  'Altered Consciousness or Confusion': E.ADVANCED_NEURO,
  'Mental Health Crisis': E.MENTAL_EVAL,
  'Syncope or Presyncope': E.ADVANCED_NEURO,
  'Trauma': E.INJURY_ASSESSMENT,
  'Cold Exposure/Hypothermia': E.SIMPLE_NEURO,
  'Heat Stroke/Heat Exhaustion': E.DEHYDRATION,
  'Tropical Disease': E.MALARIA_RISK,
  'Poisoning/Overdose': E.SIMPLE_NEURO,
  'Musculoskeletal injuries': E.JOINT_EXAM,
  'Eye Foreign Body': E.EYE_EXAM,
  'Nosebleed': E.NOSE_CHECK,
  'Sexually Transmitted Diseases': E.MALE_GENITAL,
  'Female Health': E.ABDOMEN_EXAM,
  'Diabetic complications': E.DEHYDRATION,
  'Drowning or Near Drowning': E.BREATHING_CHECK,
  'Throat Pain and Sore Throat': E.THROAT_CHECK,
  'Red Eye and Discharge': E.EYE_EXAM,
  'Neurological symptoms': E.ADVANCED_NEURO,
  'Obstipation': E.ABDOMEN_EXAM,
  'Sea Sickness': E.SIMPLE_NEURO,
  'Sleeplessness / Insomnia': E.GENERAL_APPEARANCE,
};

// Case-insensitive index into the map / guideline symptom names.
const PATHWAY_KEYS = Object.keys(PATHWAY_EXAMINATION);
const PATHWAY_KEYS_LC = new Map(PATHWAY_KEYS.map((k) => [k.toLowerCase(), k]));

const SCORE_FALLBACK: FallbackOpts = {
  primaryModel: config.nebius.problemScoreModel,
  timeoutMs: 10_000,
  backupClient: ovh,
  backupModel: config.ovh.model,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PhysicalExamFacet {
  question: string;      // the individual examination question (the facet)
  status: FacetStatus;   // complete / partial / absent / not_applicable
  evidence: string;      // verbatim quote from the documentation, or ""
}

export interface PhysicalExaminationInput {
  documentation: string;   // the physical examination findings (the `exam` field)
  pathway?: string;        // known SYBRA symptom
  chiefComplaint?: string; // helps identify the symptom when pathway is absent
  gender?: string;         // to resolve sex-conditional examinations
  age?: number;            // reserved for age-conditional norms
  caseSummary?: string;    // problem description / history for context
}

export interface PhysicalExaminationResult {
  scorable: boolean;
  score: number | null;
  pathway: string | null;
  examination: string | null;           // the chosen examination that was graded
  required: number;                      // count of applicable questions
  facets: PhysicalExamFacet[] | null;
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

/** Resolve a supplied/identified symptom name to a canonical PATHWAY_EXAMINATION key. */
function resolvePathway(input: string | undefined): string | null {
  if (!input) return null;
  if (PATHWAY_EXAMINATION[input] !== undefined) return input;
  return PATHWAY_KEYS_LC.get(input.trim().toLowerCase()) ?? null;
}

/** The individual examination questions (bullet items) for one examination ID. */
function questionsFor(id: number): string[] {
  const raw = examinationInstructions[id];
  if (!raw) return [];
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('•'))
    .map((l) => l.replace(/^•\s*/, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** The chosen examination (name + questions) for a pathway, or null if none. */
function chosenExamination(pathway: string): { id: number; name: string; questions: string[] } | null {
  const id = PATHWAY_EXAMINATION[pathway];
  if (id === undefined) return null;
  const questions = questionsFor(id);
  if (questions.length === 0) return null;
  return { id, name: examinationDisplayNames[id] || `Examination ${id}`, questions };
}

async function identifyPathway(text: string): Promise<string | null> {
  const system = `You are a maritime triage classifier. Read the text and pick the SINGLE best-matching symptom from EXACTLY this list, using the exact spelling:
${PATHWAY_KEYS.join(', ')}

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

async function gradeQuestions(
  input: PhysicalExaminationInput,
  pathway: string,
  exam: { name: string; questions: string[] },
): Promise<{ facets: PhysicalExamFacet[]; suggestion: string }> {
  const numbered = exam.questions.map((q, i) => `${i + 1}. ${q}`).join('\n');

  const facts = [
    input.gender ? `Gender: ${input.gender}` : 'Gender: not recorded',
    (input.age !== undefined && input.age !== null) ? `Age: ${input.age}` : 'Age: not recorded',
  ].join('\n');

  const system = `You are a maritime medical QA reviewer. For a patient whose primary complaint is "${pathway}", judge how well the PHYSICAL EXAMINATION documentation records the findings for each question of the "${exam.name}" — the examination indicated for this complaint — for a shore-based doctor. Judge documentation quality only, not clinical management.

EXPECTED EXAMINATION QUESTIONS (${exam.name}):
${numbered}

CASE FACTS:
${facts}

For EACH numbered question assign a status:
- "complete": the documentation records the finding this question asks for — whether NORMAL/negative or abnormal (e.g. "abdomen not distended" completes the distension question; "rebound tenderness present" completes the rebound question; "alert, speaking clearly" completes a can-they-talk question).
- "partial": the area is touched on but the specific finding is vague or ambiguous.
- "absent": this finding is not documented at all.
- "not_applicable": the question genuinely cannot apply to this patient — e.g. a testicular or male-genital question when the patient is not male (use the CASE FACTS), or a conditional question whose precondition is not met (e.g. "[If there is active bleeding] …" when there is no bleeding). Do NOT mark not_applicable merely because a finding is missing.
Ground every "complete"/"partial" status in a verbatim quote from the documentation; otherwise the status is "absent" (evidence "").

Also write ONE short sentence naming just the SINGLE most important thing still to check on the patient, not a list. Use plain, everyday language that a person with NO medical training understands, and describe it simply (for example "check whether both sides of the face look the same" instead of "assess facial symmetry"). Return "" if nothing applicable is missing.

Return ONLY a JSON object (one entry per numbered question, in order):
{"grades":[{"status":"complete|partial|absent|not_applicable","evidence":"<verbatim quote or empty>"}],"suggestion":"<one sentence or empty>"}`;

  const user = `CASE SUMMARY (problem / history):
${input.caseSummary?.trim() || '(none provided)'}

PHYSICAL EXAMINATION DOCUMENTATION:
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
    grades?: { status?: unknown; evidence?: unknown }[];
    suggestion?: unknown;
  };

  const grades = Array.isArray(parsed.grades) ? parsed.grades : [];
  const facets: PhysicalExamFacet[] = exam.questions.map((question, i) => {
    const g = grades[i];
    const status = normalizeFacetStatus(g?.status);
    const evidence = typeof g?.evidence === 'string' ? g.evidence : '';
    return { question, status, evidence: status === 'absent' ? '' : evidence };
  });

  const suggestion = typeof parsed.suggestion === 'string' ? parsed.suggestion.trim() : '';
  return { facets, suggestion };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function scorePhysicalExamination(
  input: PhysicalExaminationInput,
): Promise<PhysicalExaminationResult> {
  // Resolve the symptom (needed to know which examination is indicated).
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
      examination: null,
      required: 0,
      facets: null,
      suggestion: 'Identify the primary complaint so the indicated examination can be assessed.',
    };
  }

  const exam = chosenExamination(pathway);

  // No gradeable examination for this symptom → nothing to grade.
  if (!exam) {
    return { scorable: true, score: 100, pathway, examination: null, required: 0, facets: [], suggestion: null };
  }

  const { facets, suggestion } = await gradeQuestions(input, pathway, exam);
  const applicable = facets.filter((f) => f.status !== 'not_applicable');

  // Every question ruled not-applicable to this patient → nothing was required.
  if (applicable.length === 0) {
    return { scorable: true, score: 100, pathway, examination: exam.name, required: 0, facets, suggestion: null };
  }

  const score = computeScore(facets);   // not_applicable questions are dropped
  return {
    scorable: true,
    score,
    pathway,
    examination: exam.name,
    required: applicable.length,
    facets,
    suggestion: score >= 100 ? null : (suggestion || null),
  };
}
