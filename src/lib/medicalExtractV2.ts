// ---------------------------------------------------------------------------
// medicalExtractV2.ts — versioned extractor powering POST /v2/ai/extract.
//
// v1 (medicalExtract.ts / POST /ai/extract) is frozen: other clients depend on
// its exact shape, so it must NOT change. v2 forks identification/vitals/
// treatment/medical-history with prompt fixes (same JSON shape), adds the
// medication given on board, and replaces the
// "problemAndActions" batch with a CLEAN SPLIT:
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
import { chatWithFallback } from './llmFallback.js';
import { ovh } from './ovh.js';
import { calculateMEWS } from './mewsCalculator.js';
import { searchPorts } from './portIndex.js';
import { normalizePatientFields } from './patientFields.js';
import { verifyNegatives } from './negativeEvidence.js';
import { symptomGuidelines as _symptomGuidelines } from './symptomGuidelines.js';
import { examinationInstructions } from './examinationInstructions.js';
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
export function canonicalPathway(s: string): string | null {
  const lc = s.trim().toLowerCase();
  if (!lc) return null;
  // 1. Exact pathway name.
  const exact = PATHWAY_BY_LC.get(lc);
  if (exact) return exact;
  // 2. A pathway name appears inside a descriptive phrase (e.g. "right-hand side
  //    headache" → "Headache", "sharp chest pain" → "Chest pain"). Prefer the
  //    longest match so specific pathways win over shorter accidental ones.
  let best: string | null = null;
  let bestLen = 0;
  for (const [keyLc, key] of PATHWAY_BY_LC) {
    if (keyLc.length > bestLen && lc.includes(keyLc)) {
      best = key;
      bestLen = keyLc.length;
    }
  }
  return best;
}

// Resolve a spoken port name/phrase to its UN/LOCODE. Tries the whole string,
// then progressively simpler forms (before a comma, before " in ", without a
// leading "the"/"port of") so "Copenhagen in Denmark" still finds Copenhagen
// (DKCPH) and "Port of Klang, Malaysia" finds Port Klang (MYPKG).
//
// Deliberately NO first-word fallback: "Port of Klang" → "Port" used to
// substring-match an arbitrary port (Port Suez, Egypt). An unresolved name is
// better than a confidently wrong port.
function resolvePortCode(raw: string): string | null {
  const base = raw.trim();
  const beforeComma = base.split(',')[0].trim();
  const beforeIn = beforeComma.split(/\s+in\s+/i)[0].trim();
  const noPrefix = beforeIn.replace(/^(?:the\s+)?port\s+of\s+/i, '').trim();
  const candidates = [base, beforeComma, beforeIn, noPrefix]
    .filter((s, i, a) => s && a.indexOf(s) === i);
  for (const c of candidates) {
    const hit = searchPorts(c, 1)[0];
    if (hit?.unlocode) return hit.unlocode;
  }
  return null;
}

// v2 runs its batches on config.nebius.extractV2Model (gpt-oss-120b) — faster
// than the v1 model — so /v2/ai/extract returns quicker. This is a local fork of
// v1's extractBatch (no M-EWS prompt injection, since no v2 batch needs it); the
// shared v1 extractBatch is deliberately left untouched.
//
// If Nebius stalls (>10s) or errors, fall back to the OVH gpt-oss-120b backup so
// "Update report" can't hang indefinitely on a slow primary provider.
async function extractBatchV2(text: string, batch: BatchConfig): Promise<Record<string, string | boolean>> {
  const start = Date.now();
  try {
    const completion = await chatWithFallback(
      {
        // 0, not 0.3: at 0.3 the model left out a stated value at random (the
        // temperature in 9 of 100 runs of one dictation, S19); at 0, 0 of 100.
        // Wording can still vary slightly between runs.
        temperature: 0,
        max_tokens: 1500,
        // gpt-oss-120b is a reasoning model; at the default (medium) effort most
        // of each batch's tokens are hidden chain-of-thought. Structured
        // extraction doesn't need it: 'low' cuts reasoning ~7× and roughly
        // halves batch latency on both providers ('none' is rejected by the
        // model's Harmony format). Applies to the OVH fallback call too.
        reasoning_effort: 'low',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: batch.prompt },
          { role: 'user', content: text },
        ],
      },
      {
        primaryModel: config.nebius.extractV2Model,
        timeoutMs: 10000,
        backupClient: ovh,
        backupModel: config.ovh.model,
      },
    );
    let raw = completion.choices[0]?.message?.content?.trim() ?? '{}';
    raw = raw.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
    const extracted: Record<string, string | boolean> = JSON.parse(raw);
    console.log(`[v2/ai/extract] batch=${batch.name} duration=${Date.now() - start}ms`);
    return extracted;
  } catch (err) {
    const e = err as Error & { status?: number };
    console.error(`[v2/ai/extract] batch=${batch.name} failed: status=${e.status ?? 'n/a'} message=${e.message}`);
    // Fail the whole extraction rather than return {}: an empty piece merged
    // into the report made /v2/ai/extract and /free/ai/extract answer 200 with
    // an empty or partial report when the AI providers (primary and backup)
    // were down, and the officer could not tell (S13, SWT-19). The routes turn
    // this into 502 "Extraction service unavailable", which the clients show
    // with Retry. Retry resends the same conversation.
    throw new Error(`extraction batch ${batch.name} failed: ${e.message}`);
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
6. NEVER describe what is missing or was not said. Do NOT write sentences such as "no other details were provided", "not mentioned", "not specified", "no information about ...", or "the patient did not report ...". Simply omit anything that was not discussed — the reader must never see a note about absent information. Stating a fact was not said is itself a claim you must not make.
7. The transcript is auto-transcribed speech and may be long, fragmented and unpunctuated. Search ALL of it — a fact stated at the very beginning counts exactly as much as the latest words, and must never be dropped because the transcript grew. If a value is corrected or restated later, the FINAL statement wins.`;

const HISTORY_V2_BATCH: BatchConfig = {
  name: 'historyV2',
  prompt: `You extract two fields of a maritime medical report from a transcript in which a ship's officer describes a patient. Return ONE JSON object with keys: "problemDescription", "associatedSymptoms".

${SHARED_RULES}

────────────────────────────────────────────────────────
problemDescription : the MAIN problem, as described
────────────────────────────────────────────────────────
Write the story of the presenting complaint as prose, using ONLY what was said about it, plus anything asked about and explicitly denied. The list below is just a guide to WHAT to capture IF it came up — include only the points that were actually discussed, and never mention or list the ones that were not:
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
ONLY things the PATIENT feels or reports (or denies feeling) belong here. Do NOT put here:
  • past illnesses, conditions, operations or their denials ("denies diabetes", "no previous surgery" — that is past medical history, not a symptom)
  • allergies or medications (captured elsewhere, including their denials)
  • findings from the OFFICER's examination (pupil checks, strength or walking tests, swallow tests — those are examination findings, even when normal)
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

// When the chief symptom maps to a SYBRA pathway, enrich the findings batch
// with that pathway's own examination questions and investigation list. The
// officer literally works through these questions, so their spoken answers
// ("colour came back after two seconds") often name neither the examination
// nor the finding — without the checklist the model can't tell that's the
// capillary refill test. The checklist is framed strictly as recognition
// context: rule 6 already forbids recording anything the transcript doesn't
// state, and the block repeats that guard.
export function findingsBatchFor(pathway: string | null): BatchConfig {
  const g = pathway ? (_symptomGuidelines as Record<string, Record<string, unknown>>)[pathway] : undefined;
  if (!g) return FINDINGS_V2_BATCH;

  const investigations = (g['Investigations'] as string[] | undefined) ?? [];
  const examIdList = (g['Examinations'] as number[] | undefined) ?? [];
  const examQuestions = examIdList
    .map((id) => (examinationInstructions as Record<number, string>)[id])
    .filter(Boolean)
    // "Eye examination:Q3/9:" → "Eye examination:" — the counters are UI noise.
    .map((s) => s.replace(/:Q\d+\/\d+:/g, ':').replace(/\n{2,}/g, '\n').trim())
    .join('\n');
  if (!investigations.length && !examQuestions) return FINDINGS_V2_BATCH;

  const context = `────────────────────────────────────────────────────────
PATHWAY CHECKLIST — "${pathway}" (recognition aid)
────────────────────────────────────────────────────────
The officer works through the "${pathway}" pathway, answering the examination questions below. Spoken answers rarely name the examination — use the questions to RECOGNISE them, then record the finding in "exam" WITH the examination's name: "colour came back in two seconds" → exam: "Capillary refill normal (about 2 seconds)".
Likewise, when a spoken result matches a test on the Tests list, name the test the way the pathway calls it — ALWAYS the same canonical name, so repeated extractions never flip wording: "the blood test for infection was negative" → investigations: "C-reactive protein (CRP) negative". Never invent a result, only a recognised name for a result that was stated.
Every answer to one of these examination questions belongs in "exam" — even when the examination is called a test (capillary refill test, pain assessment). Only laboratory / point-of-care results (the Tests list) belong in "investigations".
${examQuestions ? `\nExaminations of the "${pathway}" pathway ("exam"):\n${examQuestions}\n` : ''}${investigations.length ? `\nTests of the "${pathway}" pathway ("investigations"):\n${investigations.map((t) => `  • ${t}`).join('\n')}\n` : ''}
Work through BOTH lists ITEM BY ITEM — every examination question and every test: for each one, search the ENTIRE transcript for an answer or result — statements from the beginning of the recording count exactly as much as the most recent ones, and a finding or test result must NEVER be dropped just because it was said early or the transcript is long. Then add any examination findings or test results that are not on the checklist at all.
The checklist is what MIGHT have been done, not what was done: record only findings and results the transcript actually states, stay silent about checklist items it never mentions, and never note that something was not done (rule 6 applies).

Return JSON:`;

  return {
    name: FINDINGS_V2_BATCH.name,
    prompt: FINDINGS_V2_BATCH.prompt.replace('Return JSON:', context),
  };
}

// Same idea for the history batch: when the pathway is known, give the model
// the pathway's own "History Taking" and "Associated Symptoms" question lists
// so it can tell what belongs to the story of the complaint, what is an
// associated symptom, and — crucially — what belongs to NEITHER (past-history
// denials and examination findings were being dumped into associatedSymptoms).
export function historyBatchFor(pathway: string | null): BatchConfig {
  const g = pathway ? (_symptomGuidelines as Record<string, Record<string, unknown>>)[pathway] : undefined;
  if (!g) return HISTORY_V2_BATCH;

  const historyTaking = (g['History Taking'] as string[] | undefined) ?? [];
  const associated = (g['Associated Symptoms'] as string[] | undefined) ?? [];
  if (!historyTaking.length && !associated.length) return HISTORY_V2_BATCH;

  const context = `────────────────────────────────────────────────────────
PATHWAY CHECKLIST — "${pathway}" (recognition aid)
────────────────────────────────────────────────────────
The officer works through the "${pathway}" pathway, asking the questions below. Use them to RECOGNISE what a statement answers and WHICH field it belongs to. Work through BOTH lists ITEM BY ITEM, searching the ENTIRE transcript for each — early statements count exactly as much as the latest words.
${historyTaking.length ? `\nQuestions about the MAIN problem ("problemDescription"):\n${historyTaking.map((q) => `  • ${q}`).join('\n')}\n` : ''}${associated.length ? `\nSymptoms asked alongside it ("associatedSymptoms" — record present OR denied):\n${associated.map((q) => `  • ${q}`).join('\n')}\n` : ''}
The checklist is what MIGHT have been asked, not what was asked: record only what the transcript actually states, stay silent about items it never mentions, and never note that something was not asked (rule 6 applies).

Return JSON:`;

  return {
    name: HISTORY_V2_BATCH.name,
    prompt: HISTORY_V2_BATCH.prompt.replace('Return JSON:', context),
  };
}

// And for past medical history: the pathway's "Focused Past Medical History"
// list tells the model which conditions the officer is prompted to ask about,
// so those answers (and denials) land in pastHistory instead of drifting into
// associatedSymptoms.
export function medicalHistoryBatchFor(pathway: string | null): BatchConfig {
  const g = pathway ? (_symptomGuidelines as Record<string, Record<string, unknown>>)[pathway] : undefined;
  const focused = (g?.['Focused Past Medical History'] as string[] | undefined) ?? [];
  if (!focused.length) return MEDICAL_HISTORY_V2_BATCH;

  const context = `────────────────────────────────────────────────────────
PATHWAY CHECKLIST — "${pathway}" (recognition aid)
────────────────────────────────────────────────────────
For this complaint the officer is prompted to ask specifically about:
${focused.map((q) => `  • ${q}`).join('\n')}
Work through these ITEM BY ITEM, searching the ENTIRE transcript for each — answers AND explicit denials both belong in "pastHistory". Record only what the transcript actually states; never mention items it is silent about.

Return JSON:`;

  return {
    name: MEDICAL_HISTORY_V2_BATCH.name,
    prompt: MEDICAL_HISTORY_V2_BATCH.prompt.replace('Return JSON:', context),
  };
}

// v2 medical-history batch — a purpose-written prompt aligned with the
// past-medical-history, allergy and medication judges (so each field carries the
// details those judges grade). Replaces v1's medical_history batch for v2 only;
// v1's batch is untouched. Fields are left EMPTY when the topic was never raised.
const MEDICAL_HISTORY_V2_BATCH: BatchConfig = {
  name: 'medical_history',
  prompt: `You extract three fields of a maritime medical report from a transcript. Return ONE JSON object with exactly these keys: "pastHistory", "allergies", "currentMedications", "allergiesEvidence", "currentMedicationsEvidence".

OUTPUT LANGUAGE: "pastHistory", "allergies" and "currentMedications" are ALWAYS written in English, even when the whole transcript — the patient's answers and the interviewer's own questions and summaries — is in another language. Translate; never copy a sentence in another language into these fields. Only the two Evidence keys keep the language of the transcript.

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
  • Occupation / job role and physically relevant work habits, if mentioned (e.g. heavy lifting, repetitive movements, prolonged standing, deck work) — for many complaints these are the risk factors the doctor needs
  • For women, pregnancy status or gynaecological history, if relevant and mentioned
Only include a chronic condition if the patient stated it (or clearly stated a regular medicine for it).
Write it in plain everyday English — translate what the patient said, but never convert it to medical terminology (write "gallbladder removed", not "cholecystectomy"; "appendix out", not "appendectomy"). The readers are ship officers, not doctors.
Record explicit DENIALS too: if the patient was asked about a past condition, surgery, or hospitalisation and said no, document it (e.g. "Denies diabetes and heart disease. No previous surgery."). A documented negative is as valuable as a positive. Never invent a denial for a topic that was never raised.
"" if past medical history was not discussed at all.

────────────────────────────────────────────────────────
allergies
────────────────────────────────────────────────────────
If the patient named one or more allergies, for EACH give:
  • the substance (e.g. penicillin, peanuts, latex)
  • what kind it is — medicine, food, or environmental
  • the reaction it causes (e.g. rash, swelling, difficulty breathing)
  • how severe it is, or whether it has happened more than once
  Example: "Penicillin (medicine) — skin rash, moderate. Shellfish (food) — throat swelling, severe."
If the patient clearly has NO allergies, write "No known allergies." — and in "allergiesEvidence" copy, word for word and in the language spoken, the words of the transcript that say so (e.g. "I have no allergies"). If no words in the transcript say so, the topic was not discussed: write "".
If allergies were not discussed at all, "". Saying nothing about allergies is NOT a denial.

────────────────────────────────────────────────────────
currentMedications
────────────────────────────────────────────────────────
ONLY medicines the patient takes as their own, from before this illness. Medicine given ON BOARD to treat THIS illness ("I gave him 1 gram of paracetamol") is TREATMENT — never list it here, it is captured elsewhere.
If the patient named one or more of their own medicines, for EACH give:
  • the name (e.g. paracetamol, metformin, amlodipine)
  • the dose / strength (e.g. 500 mg, 10 units, one tablet)
  • how often it is taken (e.g. twice daily, every 8 hours, as needed)
  • what it is for, if stated
  Include tablets, inhalers, injections, and supplements.
  Example: "Metformin 500 mg twice daily for diabetes. Ibuprofen 400 mg as needed for pain."
If the patient clearly takes NO regular medicines, write "No regular medications." — even if treatment was given on board — and in "currentMedicationsEvidence" copy, word for word and in the language spoken, the words of the transcript that say so (e.g. "he takes no medicines"). If no words in the transcript say so, the topic was not discussed: write "".
If medications were not discussed at all, "". Saying nothing about medicines is NOT a denial; an allergy to a medicine is NOT a statement about the medicines the patient takes.
"allergiesEvidence" and "currentMedicationsEvidence" are "" unless the field above is the negative statement.

Return JSON:
{"pastHistory":"","allergies":"","currentMedications":"","allergiesEvidence":"","currentMedicationsEvidence":""}`,
};

// ---------------------------------------------------------------------------
// v2 forks of the frozen v1 identification/treatment batches. v1 must not
// change, but its prompts under-describe several fields and the weaker v2
// model misses them (measured on gpt-oss-120b, scripts/test-extract-v2-*.ts):
//
//   • patientNationality sat under "VESSEL INFO" with no description —
//     adjective forms ("a Polish motorman") extracted 0/5; with the reworded
//     block below, 18/18.
//   • location is coordinates-only in the app, but "(coordinates, position)"
//     let the model drop prose there ("sailing to Bangkok"); it must return
//     "" instead so the app keeps the current (GPS-set) value.
//   • gender was never inferred from pronouns ("he vomited twice" → "").
//
// The forks are built by patching the v1 prompt text so the shared scaffolding
// (translation, anti-hallucination rules, JSON shape) stays identical by
// construction. v1 is frozen, so the anchors are stable; forkPrompt throws at
// module load if an anchor ever fails to match.
// ---------------------------------------------------------------------------
function forkPrompt(v1Name: string, edits: Array<[string, string]>): string {
  const v1 = BATCHES.find(b => b.name === v1Name);
  if (!v1) throw new Error(`v2 fork: v1 batch "${v1Name}" not found`);
  let prompt = v1.prompt;
  for (const [from, to] of edits) {
    if (!prompt.includes(from)) throw new Error(`v2 fork of "${v1Name}": anchor not found: ${from.slice(0, 60)}`);
    prompt = prompt.replace(from, to);
  }
  return prompt;
}

// chiefSymptom can only ever be a SYBRA pathway (the report snaps it to one),
// but v1's "(primary symptom)" yields free text like "stomach pain" that no
// pathway name contains — so the field came back empty for anything not said
// in textbook words. Constrain the model to the actual pathway list instead;
// canonicalPathway() then merely validates the spelling.
const PATHWAY_LIST = Object.keys(_symptomGuidelines as Record<string, unknown>).join('; ');

const CORE_IDENTIFICATION_V2_BATCH: BatchConfig = {
  name: 'core_identification',
  prompt: forkPrompt('core_identification', [
    // The app's Location field is COORDINATES ONLY (it has a GPS "Use my
    // location" button); prose like "sailing to Bangkok" is junk there. An
    // empty "" lets the app keep whatever the field already holds.
    [
      '- location (coordinates, position)',
      `- location (the ship's position as COORDINATES ONLY — latitude/longitude in any spoken form, e.g. "55 degrees 30 minutes north, 012 degrees 10 minutes east" or "43 12 north, 005 22 east".
  If no coordinates were stated, leave "" — NEVER put a place name, sea area, port, heading, or phrases like "sailing to X" / "docked in X" here. Where the ship is GOING belongs in no field here (destination is captured elsewhere).)`,
    ],
    [
      '- chiefSymptom (primary symptom)',
      `- chiefSymptom (the ONE entry from this list that best matches the main problem — copy it EXACTLY as written, or "" if nothing fits: ${PATHWAY_LIST})`,
    ],
    // Examples are load-bearing: instruction-only wordings ("a pronoun counts
    // as stated") still extracted "" for he/him 0/9 on gpt-oss-120b; with the
    // examples below it's 9/9 (and "" is still returned when no pronoun). The
    // multi-person example matters too — without it, long transcripts that
    // also mention the officer made the model drop the field.
    [
      '- gender (male/female)',
      `- gender ("male" or "female". The patient's pronouns state their gender explicitly — ALWAYS extract it from them, even in a long report that mentions other people.
  Example: "The patient is an oiler. He vomited twice." → "gender": "male"
  Example: "She has had a headache since morning." → "gender": "female"
  Example: "This is the captain speaking. The patient is Rajesh Kumar. He has had pain since yesterday." → "gender": "male" (the patient's pronoun, not the speaker's)
  Only leave "" if the transcript never uses he/she (or an equivalent) for the patient.)`,
    ],
  ]),
};

const TREATMENT_V2_BATCH: BatchConfig = {
  name: 'treatment_medications',
  prompt: forkPrompt('treatment_medications', [
    [
      `VESSEL INFO (if mentioned):
- patientNationality, patientUtc, patientCompany, patientEmail
- destination, nearestPort, medicineChestType
- medical_officer_name_and_title`,
      `PATIENT DETAILS (if mentioned):
- patientNationality: the PATIENT's nationality/citizenship, however phrased — "a Polish motorman", "he is Filipino", "holds a Romanian passport", "nationality Ukrainian" all count. The patient's nationality, NEVER the reporting officer's.
- patientCompany, patientEmail

VOYAGE INFO (if mentioned):
- destination: the port the ship is heading to / next port of call ("bound for X", "en route to X", "ETA X tomorrow")
- nearestPort: the closest port right now, if different from the destination
- patientUtc, medicineChestType
- medical_officer_name_and_title`,
    ],
  ]),
};

// Medication given ON BOARD for this illness — what the doctor most needs to
// know before advising more. v1 lumped it into performedActions; the v2 split
// left it nowhere. A batch of its own so it cannot disturb currentMedications
// (tuning that prompt to separate the two dropped or invented entries). The
// model returns the parts of each drug; formatMedicationGiven() writes the
// lines, so the format never drifts between runs.
const MEDICATION_ON_BOARD_V2_BATCH: BatchConfig = {
  name: 'medication_on_board',
  prompt: `You extract one item of a maritime medical report from a transcript: the medicines GIVEN TO THE PATIENT ON BOARD for this illness or injury.

OUTPUT LANGUAGE: English only (translate first if needed).

RULES (follow strictly):
1. Only medicines the transcript says WERE GIVEN or taken on board for this problem, by the crew or by the patient (e.g. "we gave him 1 gram of paracetamol", "he took two ibuprofen an hour ago").
2. NOT the patient's own regular medicines from before this illness, unless the transcript says a dose was given for this problem.
3. NOT medicines only considered, planned, recommended or asked about.
4. NOT oxygen, and not procedures (cannula, neck collar, bandage, splint, CPR).
5. Use ONLY what was said. Never guess a dose, route or time. Leave a part "" if it was not said.
   - dose: an amount ("1 g") or a count ("2 tablets", "2 puffs").
   - time: a clock time ("14:20") or, if that is how it was said, a relative one ("about 1 hour ago").
6. Numbers as digits, units abbreviated: "g", "mg", "mcg", "ml", "units" (e.g. "1 gram" → "1 g", "5 milligrams" → "5 mg"). Route in plain words: "orally", "intramuscular", "intravenous", "subcutaneous", "rectal", "inhaled", "on the skin".
7. If no medicine was given, or medication was not discussed, return an empty list.

Return JSON:
{"medicationGiven":[{"name":"","dose":"","route":"","time":""}]}`,
};

// One line per drug, "Paracetamol 1 g orally 14:20". Anything that is not a
// list of drug objects counts as nothing given — an empty field is safe, a
// malformed one is not.
export function formatMedicationGiven(raw: unknown): string {
  if (!Array.isArray(raw)) return '';
  return raw
    .map((d) => {
      if (!d || typeof d !== 'object') return '';
      const part = (k: string) => String((d as Record<string, unknown>)[k] ?? '').trim();
      const name = part('name');
      if (!name) return '';
      return [name.charAt(0).toUpperCase() + name.slice(1), part('dose'), part('route'), part('time')]
        .filter(Boolean)
        .join(' ');
    })
    .filter(Boolean)
    .join('\n');
}

// Consciousness: AVPU has no "confused", so "awake but confused" came back as
// Alert — the Norwegian form then printed "Awake, alert and well orientated"
// and M-EWS scored it 0. New confusion counts as not alert (ACVPU in NEWS2; the
// Norwegian form's own M-EWS row) and scores as V, so it is extracted as Voice.
// Clinical decision: Peter Biesenbach, 2026-10-31.
const VITALS_V2_BATCH: BatchConfig = {
  name: 'vitalSignsSimple',
  prompt: forkPrompt('vitalSignsSimple', [
    // The field is named "..._mouth" for the RMD form's history, and the model
    // took the name literally: "34.5 measured in the ear" came back "", so the
    // report had no temperature and M-EWS scored none — for a hypothermic
    // patient. Where it was measured is captured by the A–E batch.
    [
      '- expose_temperature_measured_mouth: Temperature in Celsius (just the number, e.g., "37.5")',
      '- expose_temperature_measured_mouth: Body temperature in Celsius, WHEREVER it was measured (mouth, ear, armpit, rectum, forehead) — despite the field name (just the number, e.g., "37.5")',
    ],
    [
      '- avpu: Level of consciousness - ONLY one of: "Alert", "Voice", "Pain", "Unresponsive" (or "" if not mentioned)',
      `- avpu: Level of consciousness - ONLY one of: "Alert", "Voice", "Pain", "Unresponsive" (or "" if not mentioned)
  If the patient is awake but CONFUSED — disoriented, unclear, muddled, not making sense, not knowing where they are or what happened — yet still responds to questions, use "Voice", NOT "Alert".
  Use "Alert" only when the patient is awake and clear, or when only "awake"/"alert" was said and confusion was not mentioned.
  Example: "He is awake but confused, responds to questions." → "avpu": "Voice"
  Example: "She is awake, alert and orientated." → "avpu": "Alert"
  Example: "He is awake and talking normally." → "avpu": "Alert"`,
    ],
  ]),
};

// ---------------------------------------------------------------------------
// A–E (ABCDE) assessment — the tick boxes and short fields of the RMD and
// Norwegian forms, which no batch filled: a dictation of "airway clear, collar
// fitted, no convulsions" reached the free-text exam and left every box blank.
//
// Two batches, A+B and C+D+E, so neither prompt carries thirty-odd fields. As
// with the medication batch, the model answers in plain terms ("yes"/"no"/"",
// short lists, short phrases) under one key of its own; abcdeFields() alone
// writes the form's field names, and anything it does not recognise stays
// empty. A box is only ever ticked on an explicit statement: an empty box says
// "not reported", a wrong "no" would say something false.
// ---------------------------------------------------------------------------
const ABCDE_RULES = `OUTPUT LANGUAGE: English only (translate first if needed).

RULES (follow strictly):
1. Use ONLY what the transcript states explicitly. Never infer: a number is not a description (a breathing rate of 24 does NOT mean "fast" unless "fast" was said), and a normal finding elsewhere does not mean this one is normal.
2. "yes"/"no" items: "yes" only if stated, "no" only if explicitly denied or stated as absent ("no convulsions", "airway is clear" → airwayClear "yes"). Not mentioned → "".
3. Lists: only the listed words, only if stated. Not mentioned → [].
4. Text items: a short phrase in plain words, only what was said. Not mentioned → "".
5. Numbers as digits.`;

const ABCDE_AB_V2_BATCH: BatchConfig = {
  name: 'abcde_airway_breathing',
  prompt: `You extract the A (Airway) and B (Breathing) part of a maritime medical report's A–E assessment from a transcript.

${ABCDE_RULES}

ITEMS:
- airwayClear: are the airways clear? "yes" / "no" / "". Talking normally counts as "yes" only if the transcript says the airway is clear or the patient talks normally.
- airwayManoeuvres: list of what was done to open the airway, from: "jaw lift", "suction", "guedel airway".
- cprStartedAt: clock time CPR was started, "hh:mm", only if CPR was started.
- oxygenLitresPerMin: oxygen given, in litres per minute, digits only (e.g. "4").
- neckBackInjurySuspected: is a neck or back (spine) injury suspected? "yes" / "no" / "".
- neckCollarFitted: was a neck (cervical) collar fitted? "yes" / "no" / "".
  Example: "No neck or back injury suspected, so no collar." → neckBackInjurySuspected "no", neckCollarFitted "no".
- breathingPattern: list of how the breathing was described, from: "fast", "slow", "shallow", "deep", "normal".
- breathingOther: any other description of HOW the breathing sounds or looks that is not one of those words (e.g. "noisy, wheezing", "laboured"), or "". Never a number or rate: the breathing rate is recorded elsewhere.

Return JSON:
{"ab":{"airwayClear":"","airwayManoeuvres":[],"cprStartedAt":"","oxygenLitresPerMin":"","neckBackInjurySuspected":"","neckCollarFitted":"","breathingPattern":[],"breathingOther":""}}`,
};

const ABCDE_CDE_V2_BATCH: BatchConfig = {
  name: 'abcde_circulation_disability_expose',
  prompt: `You extract the C (Circulation), D (Disability) and E (Expose) part of a maritime medical report's A–E assessment from a transcript.

${ABCDE_RULES}

ITEMS:
- capillaryRefillSeconds: capillary refill time in seconds, digits only (e.g. "3").
- skinColour: one of "pale", "reddish", "bluish", "normal", or "".
- skinFeel: how the skin feels — temperature and moisture (e.g. "cold and sweaty"), or "".
- pulseMeasuredAt: where the pulse / heart rate was measured: "wrist", "neck", "groin", or "".
- convulsions: "yes" / "no" / "".
- paralysis: "yes" / "no" / "".
- pupilsNormal: are the pupils normal (equal, reacting normally)? "yes" / "no" / "".
- pupilsDescription: what was seen if the pupils are NOT normal (e.g. "left pupil larger, slow to react"), or "".
  Example: "The left pupil is larger than the right and reacts slowly." → pupilsNormal "no", pupilsDescription "left pupil larger than right, reacts slowly".
- topToToeDone: was a top-to-toe examination done? "yes" / "no" / "".
- topToToeFindings: injuries or signs of illness found on it (e.g. "deformed right lower leg, possible fracture"), or "".
- hypothermiaOrOverheating: signs of hypothermia or overheating? "yes" / "no" / "".
- hypothermiaOrOverheatingFindings: what those signs are, or "".
- temperatureMeasuredAt: where the body temperature was measured: e.g. "mouth", "ear", "armpit", "rectum", "forehead", or "".

Return JSON:
{"cde":{"capillaryRefillSeconds":"","skinColour":"","skinFeel":"","pulseMeasuredAt":"","convulsions":"","paralysis":"","pupilsNormal":"","pupilsDescription":"","topToToeDone":"","topToToeFindings":"","hypothermiaOrOverheating":"","hypothermiaOrOverheatingFindings":"","temperatureMeasuredAt":""}}`,
};

/**
 * The form fields for the A–E answers, keyed by the names the RMD and Norwegian
 * mappers read. Only what is unambiguous is written: a "yes"/"no" ticks one box
 * of its pair, anything else ticks neither; list words outside the allowed set
 * are dropped; numbers must look like numbers. Boxes are only ever `true`.
 */
export function abcdeFields(ab: unknown, cde: unknown, temperature = ''): Record<string, string | boolean> {
  const a = (ab && typeof ab === 'object' ? ab : {}) as Record<string, unknown>;
  const c = (cde && typeof cde === 'object' ? cde : {}) as Record<string, unknown>;
  const out: Record<string, string | boolean> = {};
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const word = (v: unknown) => text(v).toLowerCase();
  const list = (v: unknown) => (Array.isArray(v) ? v.map(word) : []);
  const number = (v: unknown) => (/^\d+(\.\d+)?$/.test(text(v)) ? text(v) : '');
  const yesNo = (v: unknown, yesKey: string, noKey: string) => {
    if (word(v) === 'yes') out[yesKey] = true;
    else if (word(v) === 'no') out[noKey] = true;
  };
  const set = (key: string, v: string) => { if (v) out[key] = v; };

  // A — Airway
  yesNo(a.airwayClear, 'checkbox_airway_clear_yes', 'checkbox_airway_clear_no');
  const manoeuvres = list(a.airwayManoeuvres);
  if (manoeuvres.includes('jaw lift')) out.checkbox_airway_jaw_lift = true;
  if (manoeuvres.includes('suction')) out.checkbox_airway_suction = true;
  if (manoeuvres.includes('guedel airway')) out.checkbox_airway_guedal = true;
  set('airway_cpr_start', /^\d{1,2}:\d{2}$/.test(text(a.cprStartedAt)) ? text(a.cprStartedAt) : '');
  set('airway_admin_oxygen_liters_per_min', number(a.oxygenLitresPerMin));
  yesNo(a.neckBackInjurySuspected, 'checkbox_airway_neck_back_injury_yes', 'checkbox_airway_neck_back_injury_no');
  yesNo(a.neckCollarFitted, 'checkbox_airway_fitted_neck_collar_yes', 'checkbox_airway_fitted_neck_collar_no');

  // B — Breathing. "normal" next to an abnormal word is a contradiction; the
  // abnormal words were said explicitly, so they stand and "normal" goes.
  const pattern = list(a.breathingPattern).filter((w) => ['fast', 'slow', 'shallow', 'deep', 'normal'].includes(w));
  const abnormal = pattern.filter((w) => w !== 'normal');
  for (const w of abnormal.length ? abnormal : pattern) out[`checkbox_breathing_${w}`] = true;
  set('breathing_description', text(a.breathingOther));

  // C — Circulation
  set('circulation_capillary_response', number(c.capillaryRefillSeconds));
  const colour = word(c.skinColour);
  if (['pale', 'reddish', 'bluish', 'normal'].includes(colour)) out.circulation_skin_colour = colour;
  set('circulation_skin_temp_and_humidity', text(c.skinFeel));
  const site = word(c.pulseMeasuredAt);
  if (['wrist', 'neck', 'groin'].includes(site)) out[`checkbox_circulation_temp_${site}`] = true;

  // D — Disability (the level of consciousness is avpu, from the vitals batch)
  yesNo(c.convulsions, 'checkbox_disability_convulsions_yes', 'checkbox_disability_convulsions_no');
  yesNo(c.paralysis, 'checkbox_disability_paralysis_yes', 'checkbox_disability_paralysis_no');
  yesNo(c.pupilsNormal, 'checkbox_disability_pupils_normal_yes', 'checkbox_disability_pupils_normal_no');
  set('disability_pupil_reaction_description', text(c.pupilsDescription));

  // E — Expose
  yesNo(c.topToToeDone, 'expose_top_to_toe_examination_performed_yes', 'expose_top_to_toe_examination_performed_no');
  set('expose_top_to_toe_examination_description', text(c.topToToeFindings));
  yesNo(c.hypothermiaOrOverheating, 'expose_hypothermia_overheating_performed_yes', 'expose_hypothermia_overheating_performed_no');
  set('expose_hypothermia_overheating_description', text(c.hypothermiaOrOverheatingFindings));
  // Measured or not: as stated (voice editing sends it), else a temperature on
  // record means one was measured. Where, only if said.
  if (['yes', 'no'].includes(word(c.temperatureMeasured))) {
    yesNo(c.temperatureMeasured, 'expose_temperature_performed_yes', 'expose_temperature_performed_no');
  } else if (temperature.trim()) {
    out.expose_temperature_performed_yes = true;
  }
  set('expose_temperature_measured_place', text(c.temperatureMeasuredAt));

  return out;
}

/** Every field abcdeFields can write: the A–E part of the report. */
export const ABCDE_FIELD_KEYS = [
  'checkbox_airway_clear_yes', 'checkbox_airway_clear_no',
  'checkbox_airway_jaw_lift', 'checkbox_airway_suction', 'checkbox_airway_guedal',
  'airway_cpr_start', 'airway_admin_oxygen_liters_per_min',
  'checkbox_airway_neck_back_injury_yes', 'checkbox_airway_neck_back_injury_no',
  'checkbox_airway_fitted_neck_collar_yes', 'checkbox_airway_fitted_neck_collar_no',
  'checkbox_breathing_fast', 'checkbox_breathing_slow', 'checkbox_breathing_shallow',
  'checkbox_breathing_deep', 'checkbox_breathing_normal', 'breathing_description',
  'circulation_capillary_response', 'circulation_skin_colour', 'circulation_skin_temp_and_humidity',
  'checkbox_circulation_temp_wrist', 'checkbox_circulation_temp_neck', 'checkbox_circulation_temp_groin',
  'checkbox_disability_convulsions_yes', 'checkbox_disability_convulsions_no',
  'checkbox_disability_paralysis_yes', 'checkbox_disability_paralysis_no',
  'checkbox_disability_pupils_normal_yes', 'checkbox_disability_pupils_normal_no',
  'disability_pupil_reaction_description',
  'expose_top_to_toe_examination_performed_yes', 'expose_top_to_toe_examination_performed_no',
  'expose_top_to_toe_examination_description',
  'expose_hypothermia_overheating_performed_yes', 'expose_hypothermia_overheating_performed_no',
  'expose_hypothermia_overheating_description',
  'expose_temperature_performed_yes', 'expose_temperature_performed_no', 'expose_temperature_measured_place',
] as const;

/** Tick boxes among them; the rest are text. */
export const isAbcdeBox = (key: string) => key.startsWith('checkbox_') || key.includes('_performed_');

/**
 * The plain answers for what the report's A–E fields hold now — the inverse of
 * abcdeFields, so voice editing can show the model the current state in the
 * same terms extraction uses, and the answer goes back through abcdeFields.
 */
export function abcdeAnswersFromFields(f: Record<string, unknown>): Record<string, unknown> {
  const on = (k: string) => f[k] === true;
  const pair = (yes: string, no: string) => (on(yes) ? 'yes' : on(no) ? 'no' : '');
  const text = (k: string) => (typeof f[k] === 'string' ? (f[k] as string).trim() : '');
  const pick = (prefix: string, words: string[]) => words.filter((w) => on(prefix + w.replace(/ /g, '_')));
  return {
    airwayClear: pair('checkbox_airway_clear_yes', 'checkbox_airway_clear_no'),
    airwayManoeuvres: [
      ...(on('checkbox_airway_jaw_lift') ? ['jaw lift'] : []),
      ...(on('checkbox_airway_suction') ? ['suction'] : []),
      ...(on('checkbox_airway_guedal') ? ['guedel airway'] : []),
    ],
    cprStartedAt: text('airway_cpr_start'),
    oxygenLitresPerMin: text('airway_admin_oxygen_liters_per_min'),
    neckBackInjurySuspected: pair('checkbox_airway_neck_back_injury_yes', 'checkbox_airway_neck_back_injury_no'),
    neckCollarFitted: pair('checkbox_airway_fitted_neck_collar_yes', 'checkbox_airway_fitted_neck_collar_no'),
    breathingPattern: pick('checkbox_breathing_', ['fast', 'slow', 'shallow', 'deep', 'normal']),
    breathingOther: text('breathing_description'),
    capillaryRefillSeconds: text('circulation_capillary_response'),
    skinColour: text('circulation_skin_colour'),
    skinFeel: text('circulation_skin_temp_and_humidity'),
    pulseMeasuredAt: pick('checkbox_circulation_temp_', ['wrist', 'neck', 'groin'])[0] ?? '',
    convulsions: pair('checkbox_disability_convulsions_yes', 'checkbox_disability_convulsions_no'),
    paralysis: pair('checkbox_disability_paralysis_yes', 'checkbox_disability_paralysis_no'),
    pupilsNormal: pair('checkbox_disability_pupils_normal_yes', 'checkbox_disability_pupils_normal_no'),
    pupilsDescription: text('disability_pupil_reaction_description'),
    topToToeDone: pair('expose_top_to_toe_examination_performed_yes', 'expose_top_to_toe_examination_performed_no'),
    topToToeFindings: text('expose_top_to_toe_examination_description'),
    hypothermiaOrOverheating: pair('expose_hypothermia_overheating_performed_yes', 'expose_hypothermia_overheating_performed_no'),
    hypothermiaOrOverheatingFindings: text('expose_hypothermia_overheating_description'),
    temperatureMeasured: pair('expose_temperature_performed_yes', 'expose_temperature_performed_no'),
    temperatureMeasuredAt: text('expose_temperature_measured_place'),
  };
}

// v2 batch set: v1 batches EXCEPT the ones forked/replaced above, plus the
// v2 clinical split.
const V2_REPLACED = new Set(['problemAndActions', 'medical_history', 'core_identification', 'treatment_medications', 'vitalSignsSimple']);
const BATCHES_V2: BatchConfig[] = [
  ...BATCHES.filter(b => !V2_REPLACED.has(b.name)),
  CORE_IDENTIFICATION_V2_BATCH,
  VITALS_V2_BATCH,
  TREATMENT_V2_BATCH,
  MEDICAL_HISTORY_V2_BATCH,
  HISTORY_V2_BATCH,
  FINDINGS_V2_BATCH,
  MEDICATION_ON_BOARD_V2_BATCH,
  ABCDE_AB_V2_BATCH,
  ABCDE_CDE_V2_BATCH,
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// Examination findings the officer already confirmed from photos
// (/ai/exam-media). They are written into "exam" in code, word for word, rather
// than left for the model to pick out of the transcript: an LLM can drop or
// reword them, and they must read the same every time. The findings batch is
// told they exist so it does not record the same questions a second time.
export function withPhotoFindings(batch: BatchConfig, photoExam: string): BatchConfig {
  if (!photoExam) return batch;
  const block = `────────────────────────────────────────────────────────
ALREADY RECORDED FROM PHOTOS
────────────────────────────────────────────────────────
The officer photographed the patient and confirmed these examination findings. They are added to "exam" automatically — do NOT write them again. In "exam", record only the examination findings the transcript adds beyond these:
${photoExam}

Return JSON:`;
  const i = batch.prompt.lastIndexOf('Return JSON:');
  return { name: batch.name, prompt: batch.prompt.slice(0, i) + block + batch.prompt.slice(i + 'Return JSON:'.length) };
}

export async function parallelExtractV2(
  conversation: Array<{ role: string; content: string }>,
  userProfile?: UserProfile,
  mewsScore?: number | null,
  photoExam = '',
): Promise<Record<string, string | boolean>> {
  const text = conversationToText(conversation);

  // The v2 clinical batch takes no M-EWS injection (M-EWS is a separate field),
  // so every batch runs through the gpt-oss-120b v2 runner.
  //
  // The clinical batches (findings, history, medical history) run AFTER
  // core_identification: once the chief symptom maps to a SYBRA pathway, each
  // prompt is enriched with that pathway's own question lists (see
  // *BatchFor helpers) so terse spoken answers are recognised for what they
  // are — and routed to the right field. They pay one sequential hop on the
  // core batch, then run in parallel with each other; vitals/treatment stay
  // fully parallel from the start.
  const corePromise = extractBatchV2(text, CORE_IDENTIFICATION_V2_BATCH);
  const pathwayPromise = corePromise.then((core) =>
    canonicalPathway(String(core.chiefSymptom ?? '')) ??
    canonicalPathway(String(core.chiefComplaint ?? '')),
  );
  const PATHWAY_ENRICHED = new Set([FINDINGS_V2_BATCH, HISTORY_V2_BATCH, MEDICAL_HISTORY_V2_BATCH]);
  const parallelBatches = BATCHES_V2.filter(
    (b) => b !== CORE_IDENTIFICATION_V2_BATCH && !PATHWAY_ENRICHED.has(b),
  );
  const results = await Promise.all([
    corePromise,
    ...parallelBatches.map((b) => extractBatchV2(text, b)),
    pathwayPromise.then((p) => extractBatchV2(text, withPhotoFindings(findingsBatchFor(p), photoExam))),
    pathwayPromise.then((p) => extractBatchV2(text, historyBatchFor(p))),
    pathwayPromise.then((p) => extractBatchV2(text, medicalHistoryBatchFor(p))),
  ]);
  const merged: Record<string, string | boolean> = {};
  results.forEach(r => Object.assign(merged, r));

  merged.medicationGivenOnBoard = formatMedicationGiven(merged.medicationGiven);
  delete merged.medicationGiven;

  Object.assign(merged, abcdeFields(merged.ab, merged.cde, String(merged.expose_temperature_measured_mouth ?? '')));
  delete merged.ab;
  delete merged.cde;

  if (photoExam) {
    const spoken = typeof merged.exam === 'string' ? merged.exam.trim() : '';
    merged.exam = spoken ? `${photoExam} ${spoken}` : photoExam;
  }

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

  // Resolve spoken destination / nearest ports to their UN/LOCODE (5-letter code).
  for (const key of ['destination', 'nearestPort']) {
    const v = merged[key];
    if (typeof v === 'string' && v.trim()) {
      const code = resolvePortCode(v);
      if (code) merged[key] = code;
    }
  }

  // Chief symptom is restricted to the SYBRA pathway list — it can only ever be a
  // pathway name, never free text. Canonicalise it; if it can't be mapped to a
  // pathway, clear it (the raw wording is preserved in chiefComplaint).
  if (typeof merged.chiefSymptom === 'string' && merged.chiefSymptom.trim()) {
    merged.chiefSymptom = canonicalPathway(merged.chiefSymptom) ?? '';
  }

  normalizePatientFields(merged);
  verifyNegatives(merged, text);

  return merged;
}

// Re-export the model id used, for logging parity with v1 callers.
export const V2_EXTRACT_MODEL = config.nebius.model;
