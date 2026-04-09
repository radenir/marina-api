import { nebius } from './nebius.js';
import { config } from '../config.js';
import { calculateMEWS } from './mewsCalculator.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserProfile {
  ship_name?: string;
  call_sign?: string;
  satellite_phone?: string;
  company?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  date_of_birth?: string;
  gender?: string;
  nationality?: string;
}

// ---------------------------------------------------------------------------
// Batch definitions — mirrors parallelExtraction.ts in the web app exactly
// Active batches: core_identification, medical_history, vitalSignsSimple,
//                 treatment_medications, problemAndActions
// ---------------------------------------------------------------------------

interface BatchConfig {
  name: string;
  prompt: string;
}

const BATCHES: BatchConfig[] = [
  {
    name: 'core_identification',
    prompt: `⚠️ OUTPUT MUST BE IN ENGLISH ONLY - TRANSLATE ALL INPUT ⚠️

Extract ONLY the following fields from the conversation. Return JSON only.

CRITICAL: If input is in any non-English language (Polish, Danish, Spanish, etc.), TRANSLATE ALL CONTENT TO ENGLISH before extraction. ALL OUTPUT FIELDS MUST BE IN ENGLISH.

🚨 ANTI-HALLUCINATION RULE - NEVER FABRICATE INFORMATION 🚨
ABSOLUTE REQUIREMENT: Only extract information that is EXPLICITLY stated in the conversation.
- Extract the ACTUAL VALUES from what was said (e.g., if user says "my name is John", extract "John")
- If information was NOT discussed → Leave field as empty string ""
- If you're unsure about a value → Leave it as empty string ""
- NEVER guess, infer, or make up information
- NEVER use placeholder values like "Unknown", "N/A", or "Not mentioned"
- Better to leave a field blank than to fabricate data

EXTRACT THESE FIELDS (look for the semantic meaning, not exact field names):
- shipName (name of vessel/ship mentioned)
- shipCallSign (radio call sign)
- shipSatellitePhone (phone number)
- location (coordinates, position)
- patientFirstName, patientLastName (patient's name)
- dateOfBirth (birth date or CPR number)
- gender (male/female)
- position (job role on ship)
- incidentDate, incidentTime (when incident occurred)
- reportedBy (who reported it)
- chiefComplaint (main medical complaint/problem)
- chiefSymptom (primary symptom)
- preparedBy (who prepared report)
- date (report date)

Return JSON format:
{
  "shipName": "",
  "shipCallSign": "",
  "shipSatellitePhone": "",
  "location": "",
  "patientFirstName": "",
  "patientLastName": "",
  "dateOfBirth": "",
  "gender": "",
  "position": "",
  "incidentDate": "",
  "incidentTime": "",
  "reportedBy": "",
  "chiefComplaint": "",
  "chiefSymptom": "",
  "preparedBy": "",
  "date": ""
}`,
  },
  {
    name: 'medical_history',
    prompt: `⚠️ OUTPUT MUST BE IN ENGLISH ONLY - TRANSLATE ALL INPUT ⚠️

Extract medical history fields from the conversation. Return JSON only.

CRITICAL: Translate all non-English input to English. ALL OUTPUT MUST BE IN ENGLISH.

🚨 ANTI-HALLUCINATION RULE 🚨
- ONLY include information EXPLICITLY stated in the conversation
- NEVER guess, infer, or make up information

📋 FIELDS TO EXTRACT:

**history** - How the illness/problem started and developed. Leave empty if not discussed.

**pastHistory** - Previous medical conditions, surgeries, hospitalizations. Leave empty if not discussed.

**currentMedications** - MUST ALWAYS HAVE CONTENT. Follow these rules:
- If patient provided medication information: Include ALL details mentioned:
  * Brand name and/or generic name
  * Dosage (e.g., 500mg, 10mg)
  * Frequency (e.g., twice daily, once at bedtime, as needed)
  * Any recent changes to medications
  * Any medications not taken recently or additional medications used
  * Include prescriptions, over-the-counter drugs, supplements, vitamins
  * Example: "Metformin 500mg twice daily, Lisinopril 10mg once daily in the morning, Vitamin D supplement daily"
- If patient stated they take NO medications: Write "Patient states they do not take any medications."
- If patient was unsure or couldn't remember: Write "Patient was asked about medications but was unsure/could not remember."
- If medications were NOT discussed at all: Write "Information on medications was not provided."
- NEVER leave this field empty.

**allergies** - MUST ALWAYS HAVE CONTENT. Follow these rules:
- If patient provided allergy information: Include ALL allergies mentioned with reactions if specified.
  * Example: "Penicillin (causes rash), shellfish (anaphylaxis), latex"
- If patient stated they have NO allergies: Write "Patient states they have no known allergies."
- If patient was unsure or couldn't remember: Write "Patient was asked about allergies but was unsure/could not remember."
- If allergies were NOT discussed at all: Write "Information on allergies was not provided."
- NEVER leave this field empty.

Return JSON format:
{
  "history": "",
  "pastHistory": "",
  "allergies": "",
  "currentMedications": ""
}`,
  },
  {
    name: 'vitalSignsSimple',
    prompt: `⚠️ OUTPUT MUST BE IN ENGLISH ONLY - TRANSLATE ALL INPUT ⚠️

Extract ONLY vital sign values from the conversation. Return JSON only.

CRITICAL: Translate all non-English input to English.

🚨 ANTI-HALLUCINATION RULE 🚨
- ONLY extract values that are EXPLICITLY stated in the conversation
- If a vital sign was NOT mentioned → Leave field as empty string ""
- NEVER guess or infer values
- Extract the NUMERIC VALUE only (no units in the field)

EXTRACT THESE 6 VITAL SIGNS + AVPU:
- circulation_pulse_per_min: Heart rate/pulse in beats per minute (just the number, e.g., "72")
- circulation_systole: Systolic blood pressure (just the number, e.g., "120")
- circulation_diastole: Diastolic blood pressure (just the number, e.g., "80")
- breathing_num_breaths_per_min: Respiratory rate per minute (just the number, e.g., "16")
- breathing_oxygen_saturation: Oxygen saturation percentage (just the number, e.g., "98")
- expose_temperature_measured_mouth: Temperature in Celsius (just the number, e.g., "37.5")
- avpu: Level of consciousness - ONLY one of: "Alert", "Voice", "Pain", "Unresponsive" (or "" if not mentioned)

Return JSON format:
{
  "circulation_pulse_per_min": "",
  "circulation_systole": "",
  "circulation_diastole": "",
  "breathing_num_breaths_per_min": "",
  "breathing_oxygen_saturation": "",
  "expose_temperature_measured_mouth": "",
  "avpu": ""
}`,
  },
  {
    name: 'treatment_medications',
    prompt: `⚠️ OUTPUT MUST BE IN ENGLISH ONLY - TRANSLATE ALL INPUT ⚠️

Extract treatment and vessel information. Return JSON only.

CRITICAL: If input is in any non-English language, TRANSLATE ALL CONTENT TO ENGLISH before extraction. ALL OUTPUT FIELDS MUST BE IN ENGLISH.

🚨 ANTI-HALLUCINATION RULE - NEVER FABRICATE INFORMATION 🚨
ABSOLUTE REQUIREMENT: Only extract information that is EXPLICITLY stated in the conversation.
- Extract the ACTUAL VALUES from what was said
- If information was NOT discussed → Leave field as empty string ""
- If you're unsure about a value → Leave it as empty string ""
- NEVER guess, infer, or make up information
- NEVER use placeholder values like "Unknown", "N/A", or "Not mentioned"
- Better to leave a field blank than to fabricate data

EXTRACT THESE FIELDS (look for the semantic meaning):
- redFlag (red flag yes/no)
- redFlagType (type of red flag if present)
- performed_actions_time (time when actions were performed, HH:MM format)

VESSEL INFO (if mentioned):
- patientNationality, patientUtc, patientCompany, patientEmail
- destination, nearestPort, medicineChestType
- medical_officer_name_and_title

Return JSON format:
{
  "redFlag": "",
  "redFlagType": "",
  "performed_actions_time": "",
  "patientNationality": "",
  "patientUtc": "",
  "patientCompany": "",
  "patientEmail": "",
  "destination": "",
  "nearestPort": "",
  "medicineChestType": "",
  "medical_officer_name_and_title": ""
}`,
  },
  {
    name: 'problemAndActions',
    prompt: `⚠️ OUTPUT MUST BE IN ENGLISH ONLY - TRANSLATE ALL INPUT ⚠️

Generate TWO fields: problemDescription and performedActions. Return JSON only.

🚫🚫🚫 VITAL SIGNS BAN - READ THIS FIRST 🚫🚫🚫
DO NOT INCLUDE ANY VITAL SIGNS IN YOUR OUTPUT. THIS IS MANDATORY.
- NO blood pressure (e.g., 120/80, 220/100)
- NO pulse or heart rate (e.g., 72 bpm, 150 beats per minute)
- NO respiratory rate or breathing rate (e.g., 19 breaths per minute)
- NO oxygen saturation or SpO2 (e.g., 95%, 98%)
- NO temperature (e.g., 39 degrees, 37.5°C)
Vital signs are extracted separately into dedicated fields. NEVER mention them here.
If vital signs appear in your output, you have failed this task.

CRITICAL: Translate all non-English input to English. ALL OUTPUT MUST BE IN ENGLISH.

🚨 ANTI-HALLUCINATION RULE 🚨
- ONLY include information EXPLICITLY stated in the conversation
- NEVER guess, infer, or make up information
- NEVER use placeholders like "Unknown", "N/A", "Not assessed"

🚫 DO NOT USE MEDICAL ABBREVIATIONS 🚫
- Write everything in full, clear English
- Do NOT use: "c/o", "h/o", "yo", "SOB", "N/V", "BP", "HR", "w/", "b/l", "pt", "IV", "IM", "PO", etc.
- Write "complains of" not "c/o", "history of" not "h/o", "year-old" not "yo"
- Write "shortness of breath" not "SOB", "intravenous" not "IV"
- The readers (ship medical officers and Danish shore doctors) may not know medical abbreviations

🚨🚨🚨 CRITICAL: DOCUMENT ALL RELEVANT FINDINGS - POSITIVE AND NEGATIVE 🚨🚨🚨
This is the most important rule. You MUST document:
- EVERY symptom the patient CONFIRMS having (positive findings)
- EVERY symptom the patient EXPLICITLY DENIES having (negative findings) - e.g., "I didn't vomit" → "Denies vomiting"
- EVERY question asked where patient was UNSURE or couldn't remember
- If a symptom was asked about and patient said NO, this MUST appear in the report
- Missing negative findings is a FAILURE - they are as important as positive findings
- Every question asked in the conversation should have its answer (or lack thereof) reflected in the report

⚠️ CRITICAL DISTINCTION - DO NOT CONFUSE THESE:
- "Not discussed" ≠ "No" - If something was NEVER ASKED or NEVER MENTIONED, do NOT write "No X" or "Denies X"
- ONLY write "Denies X" or "No X" if the patient EXPLICITLY said no, or was asked and answered negatively
- If medications/procedures/tests were not discussed → OMIT entirely (do not write "No medications given")
- If patient was asked about vomiting and said "no" → Write "Denies vomiting"
- NEVER assume absence of discussion means "no" - this is HALLUCINATION

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 FIELD 1: problemDescription
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This field describes the patient's problem and history. EXCLUDE: vital signs, allergies (dedicated field), daily medications list (dedicated field).

🚨 CRITICAL: DOCUMENT ALL QUESTIONS AND ANSWERS 🚨
- If the patient was asked a question but could not remember or was unsure, THIS MUST BE DOCUMENTED
- Example: "Patient could not recall previous migraines."
- Example: "Family history uncertain."
- Every question asked in the conversation should have its answer (or lack thereof) reflected in the report
- DO NOT omit this section - document what was asked and answered

CONTENT TO INCLUDE:

**1. Patient Introduction & Past Medical History:**
- ONLY include age/gender if EXPLICITLY stated in the conversation - NEVER guess or fabricate
- If age/gender not stated, simply omit them and start with medical history or "Patient" or "The patient"
- Chronic conditions from TWO sources (if mentioned):
  a) Inferred from daily medications (antihypertensives → hypertension, statins → hypercholesterolemia, metformin/insulin → diabetes, inhalers → asthma/COPD)
  b) Explicitly stated past medical history (previous conditions, surgeries, hospitalizations)
- If no chronic conditions mentioned → "previously healthy" or omit this part
Examples when age/gender IS stated:
- "57-year-old male with hypertension, diabetes, previous appendectomy 2015."
- "42-year-old female, previously healthy."
Examples when age/gender is NOT stated (DO NOT FABRICATE):
- "Patient with history of hypertension presents with..."
- "Previously healthy patient presents with..."
- "The patient reports..." (when no medical history mentioned either)

**2. Current Condition - ALL Information Discussed:**
- Include EVERYTHING discussed about the current problem
- This includes: main complaint, onset, duration, character, location, severity, radiation, aggravating/alleviating factors, progression, context, timing, quality, and ANY other details mentioned
- Use multiple sentences as needed for clarity

**3. Associated Symptoms - REPORT ALL QUESTIONS AND ANSWERS:**
- Document ALL symptom-related questions asked during the conversation
- POSITIVE findings: "Reports nausea and dizziness."
- NEGATIVE findings: "Denies vomiting, fever, chest pain." ← THIS IS CRITICAL - if patient said "no" to a symptom, it MUST be here
- UNCERTAIN findings: "Unsure about previous headaches."
- DO NOT omit this section - document what was asked and answered
- Prioritize: every question asked and its answer > clinical details > context

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 FIELD 2: performedActions
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

performedActions contains all physical examination findings and investigations that were performed during the interview. It documents what the medical officer observed during the examination and what tests were discussed. Do NOT include: medications, allergies, vital sign numeric measurements, patient-reported symptoms, or patient history (those belong in other fields).

Here is an example of a correctly populated performedActions for a chest pain case:

"Physical Examination:
General: Alert, oriented, talking freely. Mild distress. Slightly diaphoretic. No pallor or grey discoloration.
Breathing: No respiratory difficulty. No mouth breathing.
Skin: Slightly sweaty. No visible wounds or bruising.
Limbs: No peripheral oedema. No leg swelling. Capillary refill 2 seconds.
Mobility: Able to stand and walk several metres without assistance.

Investigations:
ECG: Not performed during this assessment.
CRP: Not indicated — no cough and temperature below 38°C."

Follow this structure exactly. Use the area name as a label, then state the finding. Include every area the medical officer assessed.

VITAL SIGNS RULE: Do NOT copy numeric measurements (BP, HR, SpO2, RR, temperature) — those are extracted separately. Extract only qualitative observations.
- WRONG: "Respiratory rate is 16 breaths per minute."
- RIGHT: "Breathing regular, unlabored."
- WRONG: "Oxygen saturation 98%."
- RIGHT: "Lungs clear bilaterally, no crackles."
- ALLOWED: Capillary refill time (not a vital sign — always include it).

When an MO answer mixes a vital sign number with a clinical observation, extract ONLY the observation and drop the number.

INVESTIGATIONS: Include every test discussed — performed, not performed, pending, or only recommended. If a test was mentioned at all, document it. If no tests were discussed, omit this section.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📏 WRITING STYLE FOR BOTH FIELDS - INFORMATION-DENSE AND CONCISE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Be CONCISE: Every word must earn its place. No filler, no fluff.
- Be COMPLETE: Include ALL clinically relevant information from the conversation.
- Be CLEAR: Despite being concise, the text must be easy to read and understand.
- NO arbitrary word or sentence limits, but do not be verbose
- Use short, direct sentences rather than long complex ones
- ALWAYS write numbers as digits (e.g., "57" not "fifty-seven", "7/10" not "seven out of ten")
- State each fact ONCE only - no redundancy

Return JSON format:
{
  "problemDescription": "",
  "performedActions": ""
}`,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function conversationToText(conversation: Array<{ role: string; content: string }>): string {
  return conversation.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
}

async function extractBatch(
  text: string,
  batch: BatchConfig,
  mewsScore?: number | null,
): Promise<Record<string, string | boolean>> {
  const start = Date.now();

  // Inject M-EWS score into the problemAndActions batch prompt
  let prompt = batch.prompt;
  if (batch.name === 'problemAndActions' && mewsScore !== null && mewsScore !== undefined) {
    prompt = batch.prompt.replace(
      'Return JSON format:',
      `⚠️ IMPORTANT: The calculated M-EWS score is ${mewsScore}. Include this in the performedActions output.\n\nReturn JSON format:`
    );
  }

  try {
    const completion = await nebius.chat.completions.create({
      model: config.nebius.model,
      temperature: 0.3,
      max_tokens: 1500,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: text },
      ],
    });

    let raw = completion.choices[0]?.message?.content?.trim() ?? '{}';
    raw = raw
      .replace(/^```json/i, '')
      .replace(/^```/i, '')
      .replace(/```$/i, '')
      .trim();

    const extracted: Record<string, string | boolean> = JSON.parse(raw);
    const duration = Date.now() - start;
    const populated = Object.values(extracted).filter(v => v !== '' && v !== false && v !== null && v !== undefined).length;
    console.log(`[ai/extract] batch=${batch.name} duration=${duration}ms fields=${populated}/${Object.keys(extracted).length}`);
    return extracted;
  } catch (err) {
    console.error(`[ai/extract] batch=${batch.name} failed:`, (err as Error).message);
    return {};
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function parallelExtract(
  conversation: Array<{ role: string; content: string }>,
  userProfile?: UserProfile,
  mewsScore?: number | null,
): Promise<Record<string, string | boolean>> {
  const text = conversationToText(conversation);

  const results = await Promise.all(BATCHES.map(b => extractBatch(text, b, mewsScore)));
  const merged: Record<string, string | boolean> = {};
  results.forEach(r => Object.assign(merged, r));

  // If no M-EWS score was provided, calculate it from extracted vitals
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
      console.log(`[ai/extract] M-EWS calculated from extracted vitals: ${finalMewsScore}`);
    }
  } else {
    console.log(`[ai/extract] M-EWS from request: ${finalMewsScore}`);
  }

  // Inject authoritative M-EWS score into performedActions.
  // Always strip any LLM-written M-EWS line first to prevent hallucinated values.
  if (finalMewsScore !== null) {
    const stripped = String(merged.performedActions ?? '')
      .replace(/^m-ews score:[^\n]*\n?/gim, '')
      .trim();
    merged.performedActions = `M-EWS score: ${finalMewsScore}${stripped ? '\n\n' + stripped : ''}`;
  }

  // Post-processing: pre-populate from userProfile (only if AI left field empty)
  if (userProfile) {
    if (userProfile.ship_name && !merged.shipName)           merged.shipName = userProfile.ship_name;
    if (userProfile.call_sign && !merged.shipCallSign)       merged.shipCallSign = userProfile.call_sign;
    if (userProfile.satellite_phone && !merged.shipSatellitePhone) merged.shipSatellitePhone = userProfile.satellite_phone;
    if (userProfile.company && !merged.patientCompany)       merged.patientCompany = userProfile.company;
    if (userProfile.email && !merged.patientEmail)           merged.patientEmail = userProfile.email;
    if (userProfile.first_name && !merged.patientFirstName)  merged.patientFirstName = userProfile.first_name;
    if (userProfile.last_name && !merged.patientLastName)    merged.patientLastName = userProfile.last_name;
    if (userProfile.gender && !merged.gender)                merged.gender = userProfile.gender;
    if (userProfile.nationality && !merged.patientNationality) merged.patientNationality = userProfile.nationality;
    if (userProfile.date_of_birth && !merged.dateOfBirth) {
      const dob = new Date(userProfile.date_of_birth);
      if (!isNaN(dob.getTime())) {
        const day = String(dob.getDate()).padStart(2, '0');
        const month = String(dob.getMonth() + 1).padStart(2, '0');
        merged.dateOfBirth = `${day}/${month}/${dob.getFullYear()}`;
      } else {
        merged.dateOfBirth = userProfile.date_of_birth;
      }
    }
  }

  return merged;
}
