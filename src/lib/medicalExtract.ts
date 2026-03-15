import { nebius } from './nebius.js';
import { config } from '../config.js';

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
// Batch definitions (verbatim prompts from parallelExtraction.ts)
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

Extract ONLY the following medical history fields from the conversation. Return JSON only.

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
- history (how the illness/problem started and developed)
- pastHistory (previous medical conditions, surgeries)
- allergies (known allergies - if mentioned)
- currentMedications (medications currently taking - if mentioned)

⚠️ CHECKBOX LOGIC - ONLY CHECK IF ABSOLUTELY CERTAIN ⚠️
CRITICAL: Better to leave checkboxes UNCHECKED (false) than to check them incorrectly. Only set to true if you have EXPLICIT, CLEAR evidence from the conversation.

- "no_medicine": true → ONLY if patient EXPLICITLY states "I don't take any medications" or similar clear statement
- "dont_know_medicine": true → ONLY if patient EXPLICITLY states "I don't know what medications I take" OR medications were clearly asked about but patient couldn't answer
- "no_allergies": true → ONLY if patient EXPLICITLY states "I have no allergies" or "no known allergies"
- "dont_know_allergies": true → ONLY if patient EXPLICITLY states "I don't know if I have allergies" OR allergies were clearly asked about but patient couldn't answer

WHEN IN DOUBT: Leave checkbox as false. Missing a checkbox is better than checking it incorrectly.

Return JSON format:
{
  "history": "",
  "pastHistory": "",
  "allergies": "",
  "currentMedications": "",
  "no_medicine": false,
  "dont_know_medicine": false,
  "no_allergies": false,
  "dont_know_allergies": false
}`,
  },
  {
    name: 'vitals_abc',
    prompt: `⚠️ OUTPUT MUST BE IN ENGLISH ONLY - TRANSLATE ALL INPUT ⚠️

Extract ONLY vital signs and ABC assessment if explicitly discussed. Return JSON only.

CRITICAL: If input is in any non-English language, TRANSLATE ALL CONTENT TO ENGLISH before extraction. ALL OUTPUT FIELDS MUST BE IN ENGLISH.

🚨 ANTI-HALLUCINATION RULE - NEVER FABRICATE INFORMATION 🚨
ABSOLUTE REQUIREMENT: Only extract information that is EXPLICITLY stated in the conversation.
- Extract the ACTUAL VALUES from what was said
- If information was NOT discussed → Leave field as empty string ""
- If you're unsure about a value → Leave it as empty string ""
- NEVER guess, infer, or make up information
- NEVER use placeholder values like "Unknown", "N/A", or "Not mentioned"
- Better to leave a field blank than to fabricate data

AIRWAY (A):
- airway_cpr_start, airway_admin_oxygen_liters_per_min
- CHECKBOXES: checkbox_airway_clear_yes, checkbox_airway_clear_no, checkbox_airway_jaw_lift, checkbox_airway_suction, checkbox_airway_guedal

BREATHING (B):
- breathing_description, breathing_num_breaths_per_min, breathing_oxygen_saturation
- CHECKBOXES: checkbox_breathing_fast, checkbox_breathing_slow, checkbox_breathing_shallow

CIRCULATION (C):
- circulation_capillary_response, circulation_skin_temp_and_humidity
- circulation_pulse_per_min, circulation_systole, circulation_diastole

⚠️ CHECKBOX RULES - ONLY CHECK IF ABSOLUTELY CERTAIN ⚠️
CRITICAL: Better to leave checkboxes UNCHECKED (false) than to check them incorrectly.

ONLY set checkbox to true if:
- The specific condition is EXPLICITLY mentioned in the conversation
- You have CLEAR, UNAMBIGUOUS evidence for that exact checkbox
- Example: Only check "checkbox_airway_clear_yes" if airway was assessed and explicitly stated as clear

WHEN IN DOUBT: Leave checkbox as false. Missing a checkbox is better than checking it incorrectly.

LEGACY (for backward compatibility):
- vitals (summary of vital signs)
- exam (physical examination findings)

Return JSON format:
{
  "airway_cpr_start": "",
  "airway_admin_oxygen_liters_per_min": "",
  "checkbox_airway_clear_yes": false,
  "checkbox_airway_clear_no": false,
  "checkbox_airway_jaw_lift": false,
  "checkbox_airway_suction": false,
  "checkbox_airway_guedal": false,
  "breathing_description": "",
  "breathing_num_breaths_per_min": "",
  "breathing_oxygen_saturation": "",
  "checkbox_breathing_fast": false,
  "checkbox_breathing_slow": false,
  "checkbox_breathing_shallow": false,
  "circulation_capillary_response": "",
  "circulation_skin_temp_and_humidity": "",
  "circulation_pulse_per_min": "",
  "circulation_systole": "",
  "circulation_diastole": "",
  "vitals": "",
  "exam": ""
}`,
  },
  {
    name: 'neuro_exposure',
    prompt: `⚠️ OUTPUT MUST BE IN ENGLISH ONLY - TRANSLATE ALL INPUT ⚠️

Extract ONLY neurological and exposure assessment if explicitly discussed. Return JSON only.

CRITICAL: If input is in any non-English language, TRANSLATE ALL CONTENT TO ENGLISH before extraction. ALL OUTPUT FIELDS MUST BE IN ENGLISH.

🚨 ANTI-HALLUCINATION RULE - NEVER FABRICATE INFORMATION 🚨
ABSOLUTE REQUIREMENT: Only extract information that is EXPLICITLY stated in the conversation.
- Extract the ACTUAL VALUES from what was said
- If information was NOT discussed → Leave field as empty string ""
- If you're unsure about a value → Leave it as empty string ""
- NEVER guess, infer, or make up information
- NEVER use placeholder values like "Unknown", "N/A", or "Not mentioned"
- Better to leave a field blank than to fabricate data

DISABILITY (D - Neurological):
- disability_pupil_reaction_description
- AVPU CHECKBOXES: checkbox_disability_avpu_awake, checkbox_disability_avpu_visual, checkbox_disability_avpu_pain, checkbox_disability_avpu_unconscious
- OTHER CHECKBOXES: checkbox_disability_convulsions_yes/no, checkbox_disability_paralysis_yes/no

EXPOSURE (E):
- expose_top_to_toe_examination_description
- expose_hypothermia_overheating_description
- expose_temperature_measured_mouth
- expose_temperature_measured_alternatively
- expose_temperature_measured_place
- CHECKBOXES: expose_top_to_toe_examination_performed_yes/no, expose_hypothermia_overheating_performed_yes/no, expose_temperature_performed_yes/no

⚠️ CHECKBOX RULES - ONLY CHECK IF ABSOLUTELY CERTAIN ⚠️
CRITICAL: Better to leave checkboxes UNCHECKED (false) than to check them incorrectly.

ONLY set checkbox to true if:
- The specific condition is EXPLICITLY mentioned in the conversation
- You have CLEAR, UNAMBIGUOUS evidence for that exact checkbox
- Example: Only check "checkbox_disability_avpu_awake" if consciousness level was explicitly assessed as alert/awake
- For yes/no pairs: Only check if explicitly stated (don't assume "no" if "yes" wasn't mentioned)

WHEN IN DOUBT: Leave checkbox as false. Missing a checkbox is better than checking it incorrectly.

Return JSON format:
{
  "disability_pupil_reaction_description": "",
  "checkbox_disability_avpu_awake": false,
  "checkbox_disability_avpu_visual": false,
  "checkbox_disability_avpu_pain": false,
  "checkbox_disability_avpu_unconscious": false,
  "checkbox_disability_convulsions_yes": false,
  "checkbox_disability_convulsions_no": false,
  "checkbox_disability_paralysis_yes": false,
  "checkbox_disability_paralysis_no": false,
  "expose_top_to_toe_examination_description": "",
  "expose_top_to_toe_examination_performed_yes": false,
  "expose_top_to_toe_examination_performed_no": false,
  "expose_hypothermia_overheating_description": "",
  "expose_hypothermia_overheating_performed_yes": false,
  "expose_hypothermia_overheating_performed_no": false,
  "expose_temperature_measured_mouth": "",
  "expose_temperature_performed_yes": false,
  "expose_temperature_performed_no": false,
  "expose_temperature_measured_alternatively": "",
  "expose_temperature_measured_place": ""
}`,
  },
  {
    name: 'treatment_medications',
    prompt: `⚠️ OUTPUT MUST BE IN ENGLISH ONLY - TRANSLATE ALL INPUT ⚠️

Extract treatment, medications, observation chart, and vessel information. Return JSON only.

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
- treatment (treatment provided)
- plan (recommendations and plan)
- notes (additional notes)
- redFlag (red flag yes/no)
- redFlagType (type of red flag if present)
- performed_actions_time (time when actions were performed)
- documentation_of_prescriptions_and_actions

MEDICATIONS ADMINISTERED (up to 4):
- medications_field1, medications_field2, medications_field3, medications_field4
- Format: "Drug name dosage - given at HH:MM"

VESSEL INFO (if mentioned):
- patientNationality, patientUtc, patientCompany, patientEmail
- destination, nearestPort, medicineChestType
- medical_officer_name_and_title

Return JSON format:
{
  "treatment": "",
  "plan": "",
  "notes": "",
  "redFlag": "",
  "redFlagType": "",
  "performed_actions_time": "",
  "documentation_of_prescriptions_and_actions": "",
  "medications_field1": "",
  "medications_field2": "",
  "medications_field3": "",
  "medications_field4": "",
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
    name: 'problem_description',
    prompt: `⚠️ OUTPUT MUST BE IN ENGLISH ONLY - TRANSLATE ALL INPUT ⚠️

Generate a comprehensive PROBLEM DESCRIPTION narrative. This is the PRIMARY description of what happened to the patient. Return JSON only.

CRITICAL: If input is in any non-English language (Polish, Danish, Spanish, etc.), TRANSLATE ALL CONTENT TO ENGLISH before extraction. ALL OUTPUT FIELDS MUST BE IN ENGLISH.

🚨 ANTI-HALLUCINATION RULE - NEVER FABRICATE INFORMATION 🚨
ABSOLUTE REQUIREMENT: Only include information that is EXPLICITLY stated in the conversation.
- ONLY write about what was actually discussed
- Extract and synthesize the ACTUAL VALUES from the conversation
- If information is missing (e.g., no date mentioned, no medical history discussed), OMIT that part entirely
- NEVER guess, infer, assume, or make up information
- NEVER use placeholder text like "[date]", "[age]", "Unknown", "N/A"
- NEVER use template structures with missing data
- Write a narrative ONLY from what was actually said - if very little was discussed, write very little
- Better to have a SHORT, ACCURATE description than a LONG, FABRICATED one

IMPORTANT: This is a SYNTHESIS task - combine information from the conversation into a coherent narrative, but only using ACTUAL stated information.

TASK: Write "problemDescription" as a comprehensive narrative describing:

INCLUDE:
- What happened (chief complaint, primary symptoms)
- When it happened (incident date and time)
- Where it happened (location on vessel, circumstances)
- Patient's relevant medical history (past conditions, current medications, allergies)
- Current symptom progression and timeline
- How the incident was reported and by whom

FORMAT: Write as a clear, structured medical narrative. Use professional clinical language. Include temporal markers (e.g., "The incident occurred on [date] at [time]...").

EXAMPLE STRUCTURE:
"The incident occurred on [date] at [time] when the patient, a [age]-year-old [gender] [position on vessel], experienced [chief complaint]. [Describe symptoms, progression, circumstances]. Patient has a history of [relevant past medical history]. Current medications include [list]. [Known allergies or no known allergies]. The incident was reported by [name/role] at [time]."

Return JSON format:
{
  "problemDescription": ""
}`,
  },
  {
    name: 'performed_actions',
    prompt: `⚠️ OUTPUT MUST BE IN ENGLISH ONLY - TRANSLATE ALL INPUT ⚠️

Generate a comprehensive PERFORMED ACTIONS summary. This describes all physical examination findings and clinical assessments. Return JSON only.

CRITICAL: If input is in any non-English language (Polish, Danish, Spanish, etc.), TRANSLATE ALL CONTENT TO ENGLISH before extraction. ALL OUTPUT FIELDS MUST BE IN ENGLISH.

🚨 ANTI-HALLUCINATION RULE - NEVER FABRICATE INFORMATION 🚨
ABSOLUTE REQUIREMENT: Only include information that is EXPLICITLY stated in the conversation.
- ONLY write about what was actually discussed
- Extract and synthesize the ACTUAL VALUES from the conversation
- If an assessment wasn't performed (e.g., no airway check mentioned), OMIT that section entirely
- NEVER guess, infer, assume, or make up information
- NEVER use placeholder text like "[X]", "Unknown", "N/A", "Not assessed"
- NEVER use template structures with missing data
- Write a summary ONLY from what was actually assessed - if very little was examined, write very little
- Better to have a SHORT, ACCURATE summary than a LONG, FABRICATED one

IMPORTANT: This is a SYNTHESIS task - combine information from the conversation into a structured summary, but only using ACTUAL stated information.

TASK: Write "performedActions" as a comprehensive summary of physical examination and observations:

INCLUDE:
- ABCDE Assessment findings:
  * Airway status and interventions
  * Breathing pattern, rate, oxygen saturation
  * Circulation: pulse, blood pressure, capillary refill, skin condition
  * Disability: level of consciousness (AVPU), neurological findings, pupils
  * Exposure: body examination findings, temperature
- Vital signs (format: "BP 120/80, HR 72, RR 16, Temp 37.2°C, SpO2 98%")
- Physical examination findings from head-to-toe
- Any interventions performed (oxygen, IV access, medications given)
- Observation chart data if monitored over time
- Past medical history if not already mentioned in problem description
- Additional clinical notes or concerns

FORMAT: Write as structured clinical documentation. Group by assessment category (ABCDE). Use professional medical terminology.

EXAMPLE STRUCTURE:
"AIRWAY: Clear and patent. [interventions if any]
BREATHING: Respiratory rate [X]/min, SpO2 [X]%, [pattern description]
CIRCULATION: BP [X/X] mmHg, Pulse [X] bpm, [additional findings]
DISABILITY: [consciousness level], pupils [description]
EXPOSURE: Temperature [X]°C, [examination findings]
INTERVENTIONS: [list any treatments, medications, procedures]
OBSERVATION: [ongoing monitoring data if applicable]"

Return JSON format:
{
  "performedActions": "",
  "observation_chart_general_condition": "",
  "observation_chart_level_consciousness": "",
  "observation_chart_pupil_reaction": "",
  "observation_chart_cannula_inserted": "",
  "observation_chart_intravenous_fluid": "",
  "observation_chart_fluid_intake": "",
  "observation_chart_24_hour_urine": "",
  "observation_chart_urine_sticks": "",
  "observation_chart_blood_sugar": "",
  "observation_chart_malaria_test": ""
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
): Promise<Record<string, string | boolean>> {
  const start = Date.now();
  try {
    const completion = await nebius.chat.completions.create({
      model: config.nebius.model,
      temperature: 0.3,
      max_tokens: 1500,
      messages: [
        { role: 'system', content: batch.prompt },
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
): Promise<Record<string, string | boolean>> {
  const text = conversationToText(conversation);

  const results = await Promise.all(BATCHES.map(b => extractBatch(text, b)));
  const merged: Record<string, string | boolean> = {};
  results.forEach(r => Object.assign(merged, r));

  // Post-processing 1: medication extraction from treatment text
  if (merged.treatment && !merged.medications_field1) {
    const treatmentLines = String(merged.treatment)
      .split(/\n/)
      .map(line => line.trim())
      .filter(line => line.length > 0);

    const medicationLines = treatmentLines
      .filter(line => /\d+\s*mg|ml|IV|oral|sublingual|administered|given/i.test(line))
      .slice(0, 4);

    if (medicationLines.length > 0) {
      merged.medications_field1 = medicationLines[0] ?? '';
      merged.medications_field2 = medicationLines[1] ?? '';
      merged.medications_field3 = medicationLines[2] ?? '';
      merged.medications_field4 = medicationLines[3] ?? '';
    }
  }

  // Post-processing 2: pre-populate from userProfile (only if AI left field empty)
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
