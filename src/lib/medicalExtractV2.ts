// ---------------------------------------------------------------------------
// medicalExtractV2.ts — versioned extractor powering POST /v2/ai/extract.
//
// v1 (medicalExtract.ts / POST /ai/extract) is frozen: other clients depend on
// its exact shape, so it must NOT change. v2 reuses v1's unchanged batches
// (identification, medical history, vitals, treatment) verbatim and replaces
// only the "problemAndActions" batch with a CLEAN SPLIT:
//
//   problemAndActions → { problemDescription, associatedSymptoms,
//                         investigations, exam }
//
// so the app gets a dedicated field per report section instead of one lumped
// `performedActions`. Section scorers (problem/associated-symptoms/investigation)
// then grade the matching field directly. M-EWS is exposed as its own
// `mewsScore` field rather than being prepended into free text.
// ---------------------------------------------------------------------------
import { config } from '../config.js';
import { nebius } from './nebius.js';
import { calculateMEWS } from './mewsCalculator.js';
import { searchPorts } from './portIndex.js';
import { symptomGuidelines as _symptomGuidelines } from './symptomGuidelines.js';
import {
  BATCHES,
  conversationToText,
  applyUserProfile,
  type BatchConfig,
  type UserProfile,
} from './medicalExtract.js';

// Chief symptom must be one of the SYBRA pathways — nothing else. Canonicalise a
// loosely-extracted symptom name (case/spelling) to the exact pathway key.
const PATHWAY_BY_LC = new Map(
  Object.keys(_symptomGuidelines as Record<string, unknown>).map((k) => [k.toLowerCase(), k]),
);
function canonicalPathway(s: string): string | null {
  return PATHWAY_BY_LC.get(s.trim().toLowerCase()) ?? null;
}

// v2 runs its batches on config.nebius.extractV2Model (gpt-oss-120b) — faster
// than the v1 model — so /v2/ai/extract returns quicker. This is a local fork of
// v1's extractBatch (no M-EWS prompt injection, since no v2 batch needs it); the
// shared v1 extractBatch is deliberately left untouched.
async function extractBatchV2(text: string, batch: BatchConfig): Promise<Record<string, string | boolean>> {
  const start = Date.now();
  try {
    const completion = await nebius.chat.completions.create({
      model: config.nebius.extractV2Model,
      temperature: 0.3,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: batch.prompt },
        { role: 'user', content: text },
      ],
    });
    let raw = completion.choices[0]?.message?.content?.trim() ?? '{}';
    raw = raw.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
    const extracted: Record<string, string | boolean> = JSON.parse(raw);
    console.log(`[v2/ai/extract] batch=${batch.name} duration=${Date.now() - start}ms model=${config.nebius.extractV2Model}`);
    return extracted;
  } catch (err) {
    const e = err as Error & { status?: number };
    console.error(`[v2/ai/extract] batch=${batch.name} failed: status=${e.status ?? 'n/a'} message=${e.message}`);
    return {};
  }
}

// ---------------------------------------------------------------------------
// v2 clinical batch — replaces problemAndActions with a clean four-field split.
// ---------------------------------------------------------------------------

// The clinical split runs as TWO batches (history + findings) so their fields
// generate in parallel — the single 4-field batch was the extract's bottleneck.
const SHARED_RULES = `OUTPUT LANGUAGE: English only. If the transcript is in another language, translate to English first.

RULES (follow strictly):
1. Use ONLY facts stated in the transcript. Never guess, infer, or add clinical detail that was not said. No placeholders ("Unknown", "N/A", "Not assessed").
2. Only record that something is absent/denied ("Denies fever") when the patient was ASKED about it and said no. Never invent a denial for a topic never raised.
3. No medical abbreviations — write in full ("shortness of breath", not "SOB"). Numbers as digits ("7/10", "2 days").
4. NEVER put vital signs anywhere (no temperature, pulse, blood pressure, breathing rate, oxygen saturation) — they are captured elsewhere.
5. Keep each field to what was actually discussed; leave a field "" if its topic was not discussed.
6. NEVER describe what is missing or was not said. Do NOT write sentences such as "no other details were provided", "not mentioned", "not specified", "no information about ...", or "the patient did not report ...". Simply omit anything that was not discussed — the reader must never see a note about absent information. Stating a fact was not said is itself a claim you must not make.`;

const HISTORY_V2_BATCH: BatchConfig = {
  name: 'historyV2',
  prompt: `You extract two fields of a maritime medical report from a transcript in which a ship's officer describes a patient. Return ONE JSON object with keys: "problemDescription", "associatedSymptoms".

${SHARED_RULES}

────────────────────────────────────────────────────────
problemDescription : the patient's account of the MAIN problem
────────────────────────────────────────────────────────
Write the story of the presenting complaint as prose, using ONLY what the patient said plus anything they were asked about and explicitly denied. The list below is just a guide to WHAT to capture IF it came up — include only the points that were actually discussed, and never mention or list the ones that were not:
  • Onset — when it started; sudden or gradual
  • Duration and pattern — how long; constant or comes and goes
  • Location — where it is; whether it spreads/radiates or has moved
  • Character — what it feels like (sharp, cramping, pressure, throbbing, burning…)
  • Severity — on a 0 to 10 scale, if the patient gave one
  • Aggravating factors — what makes it worse
  • Relieving factors — what makes it better
  • Course — how it has changed since it started
  • Previous episodes — whether this happened before
  • Relevant context — recent travel, food, or injury, if mentioned
Do NOT add any sentence about which of these were not covered or that details are missing (see rule 6). Include age and sex only if stated. Do NOT put here: associated symptoms, past history, medications, allergies, examination findings, or test results.
If the main problem was never described, leave this "".

────────────────────────────────────────────────────────
associatedSymptoms : OTHER symptoms, present OR denied
────────────────────────────────────────────────────────
Symptoms besides the main complaint that were asked about or volunteered. For EACH, say whether present or explicitly denied — a documented "no" is as valuable as a "yes".
Example: "Reports nausea and one episode of vomiting. Denies fever. Denies urinary symptoms."
Do not restate the main complaint. "" if none discussed.

Return JSON:
{"problemDescription":"","associatedSymptoms":""}`,
};

const FINDINGS_V2_BATCH: BatchConfig = {
  name: 'findingsV2',
  prompt: `You extract two fields of a maritime medical report from a transcript in which a ship's officer describes a patient. Return ONE JSON object with keys: "investigations", "exam".

${SHARED_RULES}

────────────────────────────────────────────────────────
investigations : RESULTS of tests the officer performed
────────────────────────────────────────────────────────
Point-of-care tests the officer carried out and their results — e.g. urine dipstick, blood glucose / blood sugar, electrocardiogram, pregnancy test, malaria rapid test. State each test AND its result.
Example: "Blood glucose 6.1 mmol/L. Urine dipstick negative for blood and leukocytes."
Do NOT include physical examination findings or vital signs. "" if no test was done.

────────────────────────────────────────────────────────
exam : physical examination FINDINGS by the officer
────────────────────────────────────────────────────────
What the officer found when examining the patient — general appearance, level of consciousness (Alert / Voice / Pain / Unresponsive), inspection, palpation, listening (auscultation), tenderness, guarding, swelling, movement, skin. State each finding, whether NORMAL or abnormal (a normal finding is worth recording).
Example: "Looks unwell, lying still. Abdomen soft, tender in the right lower quadrant with guarding and rebound. Chest clear on listening."
Do NOT include patient-reported symptoms, test results, or vital signs. "" if no examination was done.

Return JSON:
{"investigations":"","exam":""}`,
};

// v2 medical-history batch — a purpose-written prompt aligned with the
// past-medical-history, allergy and medication judges (so each field carries the
// details those judges grade). Replaces v1's medical_history batch for v2 only;
// v1's batch is untouched. Fields are left EMPTY when the topic was never raised.
const MEDICAL_HISTORY_V2_BATCH: BatchConfig = {
  name: 'medical_history',
  prompt: `You extract three fields of a maritime medical report from a transcript. Return ONE JSON object with exactly these keys: "pastHistory", "allergies", "currentMedications".

OUTPUT LANGUAGE: English only (translate first if needed).

RULES (follow strictly):
1. Use ONLY what is explicitly stated. Never guess or invent. No medical abbreviations. Numbers as digits.
2. Leave a field "" if its topic was not discussed at all. Never write a placeholder like "not provided" or "not assessed".

────────────────────────────────────────────────────────
pastHistory : the patient's relevant PAST health
────────────────────────────────────────────────────────
Capture what was stated:
  • Previous illnesses and long-term conditions (e.g. diabetes, high blood pressure, heart disease, asthma, kidney stones)
  • Past operations (surgeries)
  • Previous hospital stays
  • Smoking, if mentioned
  • For women, pregnancy status or gynaecological history, if relevant and mentioned
Only include a chronic condition if the patient stated it (or clearly stated a regular medicine for it). "" if not discussed.

────────────────────────────────────────────────────────
allergies
────────────────────────────────────────────────────────
If the patient named one or more allergies, for EACH give:
  • the substance (e.g. penicillin, peanuts, latex)
  • what kind it is — medicine, food, or environmental
  • the reaction it causes (e.g. rash, swelling, difficulty breathing)
  • how severe it is, or whether it has happened more than once
  Example: "Penicillin (medicine) — skin rash, moderate. Shellfish (food) — throat swelling, severe."
If the patient clearly has NO allergies, write "No known allergies."
If allergies were not discussed at all, "".

────────────────────────────────────────────────────────
currentMedications
────────────────────────────────────────────────────────
If the patient named one or more medicines, for EACH give:
  • the name (e.g. paracetamol, metformin, amlodipine)
  • the dose / strength (e.g. 500 mg, 10 units, one tablet)
  • how often it is taken (e.g. twice daily, every 8 hours, as needed)
  • what it is for, if stated
  Include tablets, inhalers, injections, and supplements.
  Example: "Metformin 500 mg twice daily for diabetes. Ibuprofen 400 mg as needed for pain."
If the patient clearly takes NO medicines, write "No regular medications."
If medications were not discussed at all, "".

Return JSON:
{"pastHistory":"","allergies":"","currentMedications":""}`,
};

// v2 batch set: v1 batches EXCEPT problemAndActions and medical_history
// (replaced by the forks/split above), plus the v2 clinical split.
const BATCHES_V2: BatchConfig[] = [
  ...BATCHES.filter(b => b.name !== 'problemAndActions' && b.name !== 'medical_history'),
  MEDICAL_HISTORY_V2_BATCH,
  HISTORY_V2_BATCH,
  FINDINGS_V2_BATCH,
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function parallelExtractV2(
  conversation: Array<{ role: string; content: string }>,
  userProfile?: UserProfile,
  mewsScore?: number | null,
): Promise<Record<string, string | boolean>> {
  const text = conversationToText(conversation);

  // The v2 clinical batch takes no M-EWS injection (M-EWS is a separate field),
  // so every batch runs through the gpt-oss-120b v2 runner.
  const results = await Promise.all(BATCHES_V2.map(b => extractBatchV2(text, b)));
  const merged: Record<string, string | boolean> = {};
  results.forEach(r => Object.assign(merged, r));

  // M-EWS: use the caller-supplied score, else compute it from extracted vitals.
  let finalMewsScore = (mewsScore !== null && mewsScore !== undefined) ? mewsScore : null;
  if (finalMewsScore === null) {
    const parseNum = (v: string | boolean | undefined): number | null => {
      if (v === undefined || v === '' || typeof v === 'boolean') return null;
      const n = parseFloat(String(v).replace(/[^\d.]/g, ''));
      return isNaN(n) ? null : n;
    };
    const mewsInput = {
      pulse_per_min: parseNum(merged.circulation_pulse_per_min),
      respiration_per_min: parseNum(merged.breathing_num_breaths_per_min),
      temperature_celsius: parseNum(merged.expose_temperature_measured_mouth),
      blood_pressure_systolic: parseNum(merged.circulation_systole),
      oxygen_saturation_percent: parseNum(merged.breathing_oxygen_saturation),
      oxygen_requirements: null as null,
      avpu: (['Alert', 'Voice', 'Pain', 'Unresponsive'].includes(merged.avpu as string)
        ? merged.avpu as 'Alert' | 'Voice' | 'Pain' | 'Unresponsive'
        : null),
    };
    const hasAnyVital = Object.values(mewsInput).some(v => v !== null);
    if (hasAnyVital) {
      finalMewsScore = calculateMEWS(mewsInput).total_score;
      console.log(`[v2/ai/extract] M-EWS calculated from extracted vitals: ${finalMewsScore}`);
    }
  } else {
    console.log(`[v2/ai/extract] M-EWS from request: ${finalMewsScore}`);
  }

  // Expose M-EWS as its own field (clean split — never lumped into free text).
  if (finalMewsScore !== null) merged.mewsScore = String(finalMewsScore);

  // Pre-populate identity/vessel fields from the profile (shared with v1).
  if (userProfile) applyUserProfile(merged, userProfile);

  // Resolve the spoken destination port to its UN/LOCODE (5-letter code).
  if (typeof merged.destination === 'string' && merged.destination.trim()) {
    const hit = searchPorts(merged.destination.trim(), 1)[0];
    if (hit?.unlocode) merged.destination = hit.unlocode;
  }

  // Chief symptom is restricted to the SYBRA pathway list — canonicalise it.
  if (typeof merged.chiefSymptom === 'string' && merged.chiefSymptom.trim()) {
    const canonical = canonicalPathway(merged.chiefSymptom);
    if (canonical) merged.chiefSymptom = canonical;
  }

  return merged;
}

// Re-export the model id used, for logging parity with v1 callers.
export const V2_EXTRACT_MODEL = config.nebius.model;
