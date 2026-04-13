import { nebius } from './nebius.js';
import { config } from '../config.js';

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

export interface VitalSigns {
  heartRate: string;
  oxygenSaturation: string;
  bloodPressureSystolic: string;
  bloodPressureDiastolic: string;
  respirationRate: string;
  AVPU: string;
  bodyTemperature: string;
  supplementalOxygen: string;
}

export interface InterviewExtractResult {
  pathway: string;
  currentHistoryTaking: string;
  associatedSymptoms: string;
  pastMedicalHistory: string;
  medications: string;
  allergies: string;
  vitalSigns: VitalSigns;
  investigations: string;
  physicalExam: string;
  additionalNotes: string;
}

export type ConversationMessage = { role: string; content: unknown };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function conversationText(history: ConversationMessage[]): string {
  return history
    .filter(
      m =>
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' &&
        (m.content as string).trim().length > 0,
    )
    .map(m => `${m.role === 'assistant' ? 'MARINA' : 'USER'}: ${String(m.content)}`)
    .join('\n\n');
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Valid SYBRA pathway names — used in the prompt to enforce exact matching
// ---------------------------------------------------------------------------

const SYBRA_PATHWAYS = [
  'Abdominal Pain',
  'Fever',
  'Chest pain',
  'Headache',
  'Nausea and Vomiting',
  'Back Pain',
  'Cough/Respiratory Symptoms',
  'Dizziness/Vertigo',
  'Skin Infections/Rash',
  'Dental Pain',
  'Laceration or Open Wounds',
  'Burns and Chemical Injuries',
  'Eye Pain',
  'Ear Pain or Hearing Problems',
  'Urinary Symptoms',
  'Shortness of Breath',
  'Joint Pain or Swelling',
  'Fatigue or Exhaustion',
  'Diarrhea',
  'Psychological Stress or Anxiety',
  'Unspecific Symptoms',
  'Anaphylaxis and Allergic Reactions',
  'Palpitations or Irregular Heartbeat',
  'Altered Consciousness or Confusion',
  'Mental Health Crisis',
  'Syncope or Presyncope',
  'Trauma',
  'Cold Exposure/Hypothermia',
  'Heat Stroke/Heat Exhaustion',
  'Tropical Disease',
  'Poisoning/Overdose',
  'Musculoskeletal injuries',
  'Eye Foreign Body',
  'Nosebleed',
  'Sexually Transmitted Diseases',
  'Female Health',
  'Diabetic complications',
  'Drowning or Near Drowning',
  'Throat Pain and Sore Throat',
  'Neurological symptoms',
  'Obstipation',
  'Sea Sickness',
  'Sleeplessness / Insomnia',
];

const SYSTEM_PROMPT = `You are a clinical documentation assistant for Marina, a maritime telemedicine system.

You will receive the full transcript of a structured medical interview conducted by Marina (an AI medical assistant) with two participants:
- A PATIENT — a sick crew member aboard a maritime vessel, who may speak any language.
- A MEDICAL OFFICER — a non-medical crew member who observes the patient, takes measurements, and performs examinations. The medical officer may speak a different language from the patient.

Marina conducts the interview in 9 sequential stages. In stages 1–6 Marina speaks with the patient. In stages 7–9 Marina switches to addressing the medical officer only for vital signs, investigations, and physical examination. In the transcript, MARINA lines are Marina's messages and USER lines are responses from either the patient or the medical officer depending on the current stage.

Your task is to extract and summarise all medical information gathered during the interview into a structured JSON object. Every field must reflect ONLY what was actually said in the conversation. Never invent, infer, or guess information that was not explicitly stated.

---

FIELD DEFINITIONS:

"pathway"
The primary symptom identified and confirmed by the patient in Stage 1 of the interview. Marina asks what is wrong, follows up, then asks the patient to confirm: "If I understand correctly, the main complaint is X. Do you confirm?" You must use EXACTLY one of the following SYBRA pathway names — copy it character-for-character, including capitalisation:

${SYBRA_PATHWAYS.map(p => `  - ${p}`).join('\n')}

Choose the entry from this list that best matches the confirmed symptom. Translate the symptom to English if necessary, then select the closest matching name from the list above. If no symptom was confirmed by the patient, write exactly "Not identified".

"currentHistoryTaking"
A narrative summary of everything gathered in Stage 2 (History Taking). This covers the patient's age, gender, and the detailed history of the presenting complaint: onset (when it started), duration, character (what it feels like), severity, location, radiation, aggravating and relieving factors, and any other symptom-specific history-taking topics. Write in clear prose. Include only what the patient actually stated. If the patient said "no" or "I don't know" to a question, include that negative finding. Do not include associated symptoms, medications, allergies, or past history (those have dedicated fields below).

"associatedSymptoms"
A narrative summary from Stage 3 (Associated Symptoms). These are additional symptoms the patient was asked about that may accompany the primary complaint. Include BOTH positive findings (symptoms the patient confirmed) AND negative findings (symptoms the patient explicitly denied when directly asked). Write as concise prose.
Write "Not assessed" ONLY if Marina never asked about ANY symptoms beyond the primary complaint. If Marina asked about even one additional symptom — regardless of whether the patient confirmed or denied it — summarise what was asked and what the patient answered. A list of all-negative answers is still a valid summary (e.g. "Patient denied nausea, vomiting, and blurred vision.").

"pastMedicalHistory"
A narrative summary from Stage 4 (Past Medical History). Covers previous illnesses, chronic conditions, prior surgeries, hospitalisations, and other relevant medical history. Include both positive and negative findings. If this stage was not reached, write "Not assessed".

"medications"
A summary from Stage 5 (Medications). To determine whether this stage was reached, check whether Marina explicitly asked the patient about their current medications in the transcript. If Marina asked and the patient responded: list all medications mentioned (name, dosage, frequency where given). If the patient explicitly said they take nothing, write "Patient states no current medications." If Marina never asked about medications at all in the transcript, write "Not assessed" — do NOT infer from silence that the patient has no medications.

"allergies"
A summary from Stage 6 (Allergies). To determine whether this stage was reached, check whether Marina explicitly asked the patient about allergies in the transcript. If Marina asked and the patient responded: list all known allergies with allergen and reaction type. If the patient explicitly stated no known allergies, write "No known allergies." If Marina never asked about allergies at all in the transcript, write "Not assessed" — do NOT infer from silence that the patient has no allergies.

"vitalSigns"
Vital signs measured by the medical officer in Stage 7. Marina asks the medical officer for each measurement one at a time. Extract each value from what the medical officer reported. Populate each sub-field as follows:

  "heartRate" — Heart rate or pulse as a plain number only, no units (e.g. "88"). Empty string if not reported.
  "oxygenSaturation" — Peripheral oxygen saturation as a plain number only, no percent sign (e.g. "96"). Empty string if not reported.
  "bloodPressureSystolic" — Systolic blood pressure as a plain number only, no units (e.g. "140"). If reported as "140/90", extract only the first number. Empty string if not reported.
  "bloodPressureDiastolic" — Diastolic blood pressure as a plain number only, no units (e.g. "90"). If reported as "140/90", extract only the second number. Empty string if not reported.
  "respirationRate" — Respiratory rate as a plain number only, no units (e.g. "18"). Empty string if not reported.
  "AVPU" — Level of consciousness. Must be exactly one of: "Alert", "Voice", "Pain", "Unresponsive". Empty string if not reported.
  "bodyTemperature" — Body temperature as a plain number only, no units (e.g. "37.1"). Empty string if not reported.
  "supplementalOxygen" — Whether the patient is on supplemental oxygen. Look for this anywhere in the vital signs exchange. Write "Yes", "No", or empty string if not mentioned.

"investigations"
A summary of all investigation results from Stage 8. Marina asks the medical officer whether specific diagnostic tests were performed and their results (e.g. ECG, CRP, blood sugar, urine analysis, malaria test, pregnancy test). For each test: state the test name and the result or finding the medical officer reported. If no investigations were performed or this stage was not reached, write "No investigations performed".

"physicalExam"
A summary of all physical examination findings from Stage 9. Marina guides the medical officer through a structured examination specific to the patient's symptom (e.g. Capillary Refill, Abdominal Examination, Neurological Check, Eye Examination). Summarise the examination type and findings question by question in order. Write as concise prose. If this stage was not reached, write "Not performed".

"additionalNotes"
Any medically relevant information from the conversation that does not fit the fields above — for example: spontaneous complaints the patient mentioned outside the structured questions, concerns raised by the medical officer, context about the vessel's situation or sailing conditions, or follow-up information added after a stage summary. Do not repeat information already captured in other fields. If nothing additional was noted, return empty string "".

---

STRICT RULES:
- Output ONLY valid JSON matching the structure below. No markdown, no text outside the JSON.
- ALL output must be in English. If the conversation was in another language, translate the extracted content.
- Never fabricate or infer information not explicitly stated.
- Never use placeholder values like "N/A", "Unknown", "Not mentioned" — use empty string "" for truly missing values unless a specific fallback is defined above.
- For vitalSigns numeric fields (heartRate, oxygenSaturation, bloodPressureSystolic, bloodPressureDiastolic, respirationRate, bodyTemperature) return ONLY the plain number as a string — no units, no symbols, no suffixes.

---

OUTPUT FORMAT (with examples of expected values):
{
  "pathway": "Chest pain",
  "currentHistoryTaking": "...",
  "associatedSymptoms": "...",
  "pastMedicalHistory": "...",
  "medications": "...",
  "allergies": "...",
  "vitalSigns": {
    "heartRate": "88",
    "oxygenSaturation": "96",
    "bloodPressureSystolic": "140",
    "bloodPressureDiastolic": "90",
    "respirationRate": "18",
    "AVPU": "Alert",
    "bodyTemperature": "37.1",
    "supplementalOxygen": "No"
  },
  "investigations": "...",
  "physicalExam": "...",
  "additionalNotes": ""
}`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function extractInterviewSummary(
  conversationHistory: ConversationMessage[],
): Promise<InterviewExtractResult> {
  const transcript = conversationText(conversationHistory);

  const completion = await nebius.chat.completions.create({
    model: config.nebius.model,
    temperature: 0.2,
    max_tokens: 50000,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: transcript },
    ],
  });

  let raw = completion.choices[0]?.message?.content?.trim() ?? '{}';
  raw = raw.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();

  return JSON.parse(raw) as InterviewExtractResult;
}
