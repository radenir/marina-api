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
import { calculateMEWS } from './mewsCalculator.js';
import {
  BATCHES,
  extractBatch,
  conversationToText,
  applyUserProfile,
  type BatchConfig,
  type UserProfile,
} from './medicalExtract.js';

// ---------------------------------------------------------------------------
// v2 clinical batch — replaces problemAndActions with a clean four-field split.
// ---------------------------------------------------------------------------

const CLINICAL_V2_BATCH: BatchConfig = {
  name: 'clinicalV2',
  prompt: `⚠️ OUTPUT MUST BE IN ENGLISH ONLY - TRANSLATE ALL INPUT ⚠️

Generate FOUR separate fields: problemDescription, associatedSymptoms, investigations, exam. Return JSON only.

🚫🚫🚫 VITAL SIGNS BAN - READ THIS FIRST 🚫🚫🚫
DO NOT INCLUDE ANY VITAL SIGNS IN ANY FIELD. THIS IS MANDATORY.
- NO blood pressure (e.g., 120/80, 220/100)
- NO pulse or heart rate (e.g., 72 bpm, 150 beats per minute)
- NO respiratory rate or breathing rate (e.g., 19 breaths per minute)
- NO oxygen saturation or SpO2 (e.g., 95%, 98%)
- NO temperature (e.g., 39 degrees, 37.5°C)
Vital signs are extracted separately into dedicated fields. NEVER mention them here.
If vital signs appear in any field, you have failed this task.

CRITICAL: Translate all non-English input to English. ALL OUTPUT MUST BE IN ENGLISH.

🚨 ANTI-HALLUCINATION RULE 🚨
- ONLY include information EXPLICITLY stated in the conversation
- NEVER guess, infer, or make up information
- NEVER use placeholders like "Unknown", "N/A", "Not assessed"
- Only write "Denies X" if the patient said "no" (or equivalent) as a DIRECT ANSWER to a question about X that appears verbatim in the conversation. NEVER write "Denies X" for topics never asked.

🚫 DO NOT USE MEDICAL ABBREVIATIONS 🚫
- Write everything in full, clear English (readers may not know abbreviations)
- Do NOT use: "c/o", "h/o", "yo", "SOB", "N/V", "BP", "HR", "w/", "b/l", "pt", "IV", "IM", "PO", etc.
- Write "complains of" not "c/o", "shortness of breath" not "SOB", "year-old" not "yo"

⚠️ OUTPUT LENGTH MUST MATCH CONVERSATION LENGTH:
- A short conversation (1-3 exchanges) → 1-2 sentences maximum per field
- Only document what was actually said — never invent clinical detail that was not discussed
- ALWAYS write numbers as digits ("57" not "fifty-seven", "7/10" not "seven out of ten")
- State each fact ONCE only — no redundancy, and do NOT repeat the same fact across fields

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 FIELD 1: problemDescription  (the HISTORY of the presenting complaint)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The story of the MAIN problem, in the patient's account. Include only what was said:
  - Age/gender ONLY if explicitly stated
  - Onset and timing (when it started, sudden or gradual, constant or intermittent)
  - Location and radiation of the complaint
  - Character/quality and severity (e.g. "7/10")
  - Aggravating and relieving factors
  - Progression since onset, and any previous similar episodes
EXCLUDE from this field: the associated-symptom checklist (Field 2), past medical
history / chronic conditions / regular medications / allergies (separate fields),
vital signs, examination findings, and investigation results.
If the patient's main problem was NOT described at all in the conversation, leave problemDescription EMPTY (""). Never write a placeholder like "No information provided" — an empty string is correct when nothing was said.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 FIELD 2: associatedSymptoms  (accompanying symptoms — present AND denied)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Symptoms OTHER than the main complaint that were asked about or volunteered:
  - Every accompanying symptom the patient CONFIRMS (e.g. "nausea, one episode of vomiting")
  - Every accompanying symptom the patient EXPLICITLY DENIES when directly asked
    (e.g. "Denies fever. Denies urinary symptoms.")
Do NOT restate the main complaint here. If no associated symptoms were discussed,
return empty string "".

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 FIELD 3: investigations  (results of tests the MEDICAL OFFICER performed)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Point-of-care tests / investigations the human medical officer carried out and
their RESULTS — for example: urine dipstick, blood glucose / blood sugar,
electrocardiogram, pregnancy test, malaria rapid test, capillary blood tests.
  - State the test and its result directly (e.g. "Blood glucose 6.1 mmol/L. Urine dipstick negative for blood and leukocytes.")
  - Do NOT include physical examination findings (those go in Field 4)
  - Do NOT include vital signs
  - Include ONLY tests actually performed and reported. If none were performed, return empty string "".

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 FIELD 4: exam  (physical examination findings by the MEDICAL OFFICER)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
What the officer found on examination — inspection, palpation, percussion,
auscultation, level of consciousness (Alert/Voice/Pain/Unresponsive), general
appearance, tenderness, guarding, swelling, range of movement, skin findings, etc.
  - State findings directly, without "Medical officer did/said/confirmed" prefixes
  - Do NOT include patient-reported symptoms or history (Fields 1–2)
  - Do NOT include investigation/test results (Field 3) or vital signs
  - Do NOT include anything said or done by Marina (the AI)
  - If the officer reported no examination, return empty string "".

Return JSON format:
{
  "problemDescription": "",
  "associatedSymptoms": "",
  "investigations": "",
  "exam": ""
}`,
};

// v2 forks the shared medical_history prompt so allergies / currentMedications
// are left EMPTY when the topic was never mentioned (instead of a
// "…was not provided" sentinel), making them behave like every other field.
// Real answers — including negatives ("no known allergies") and "unsure" — are
// kept. v1's medical_history batch is untouched. Derived from v1's prompt so the
// unchanged parts stay in lock-step.
const V1_MEDICAL_HISTORY = BATCHES.find(b => b.name === 'medical_history');
const MEDICAL_HISTORY_V2_BATCH: BatchConfig = {
  name: 'medical_history',
  prompt: (V1_MEDICAL_HISTORY?.prompt ?? '')
    .split('MUST ALWAYS HAVE CONTENT. Follow these rules:').join('Follow these rules:')
    .split('- NEVER leave this field empty.').join('- If the topic was NOT discussed at all: leave the field empty ("").')
    .split('- If medications were NOT discussed at all: Write "Information on medications was not provided."').join('')
    .split('- If allergies were NOT discussed at all: Write "Information on allergies was not provided."').join(''),
};

// v2 batch set: v1 batches EXCEPT problemAndActions and medical_history
// (replaced by the forks/split above), plus the v2 clinical split.
const BATCHES_V2: BatchConfig[] = [
  ...BATCHES.filter(b => b.name !== 'problemAndActions' && b.name !== 'medical_history'),
  MEDICAL_HISTORY_V2_BATCH,
  CLINICAL_V2_BATCH,
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
  // so extractBatch is called without a score for every batch.
  const results = await Promise.all(BATCHES_V2.map(b => extractBatch(text, b)));
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

  return merged;
}

// Re-export the model id used, for logging parity with v1 callers.
export const V2_EXTRACT_MODEL = config.nebius.model;
