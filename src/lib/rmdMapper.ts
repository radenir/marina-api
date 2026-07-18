/**
 * RMD Field Mapper
 * Maps MedicalSummary data to RMD PDF form field names.
 * RMD (Radio Medical) is a standardized Danish maritime medical form.
 */

import { calculateMEWS } from './mewsCalculator.js';

export type MedicalSummary = Record<string, string | boolean | null | undefined>;

/**
 * The M-EWS score for this report.
 *
 * Recomputed from the vitals on the summary rather than trusting
 * `summary.mewsScore`. The extractor calculates the score once, at extract
 * time, from whatever the transcript happened to contain — but the officer then
 * corrects the vitals by hand in the report, and nothing recalculates. A score
 * carried over from the pre-correction numbers is worse than none, because it
 * disagrees with the vitals printed beside it on the same page.
 *
 * Falls back to the stored value when the report carries no vitals at all.
 */
function mewsScore(summary: MedicalSummary, vitals: ReturnType<typeof parseVitals>): string {
  const num = (v: unknown, fallback?: string): number | null => {
    const n = parseFloat(String(v ?? fallback ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };
  const input = {
    pulse_per_min: num(summary.circulation_pulse_per_min, vitals.pulse),
    respiration_per_min: num(summary.breathing_num_breaths_per_min, vitals.respiratoryRate),
    temperature_celsius: num(summary.expose_temperature_measured_mouth, vitals.temperature),
    blood_pressure_systolic: num(summary.circulation_systole, vitals.systole),
    oxygen_saturation_percent: num(summary.breathing_oxygen_saturation, vitals.oxygenSaturation),
    oxygen_requirements: null,
    avpu: (['Alert', 'Voice', 'Pain', 'Unresponsive'].includes(String(summary.avpu))
      ? String(summary.avpu)
      : null) as 'Alert' | 'Voice' | 'Pain' | 'Unresponsive' | null,
  };
  if (Object.values(input).some((v) => v !== null)) {
    return String(calculateMEWS(input).total_score);
  }
  return String(summary.mewsScore ?? '').trim();
}

export function parseVitals(vitals: string): {
  temperature?: string;
  pulse?: string;
  systole?: string;
  diastole?: string;
  respiratoryRate?: string;
  oxygenSaturation?: string;
} {
  if (!vitals) return {};

  const parsed: Record<string, string> = {};

  const bpMatch = vitals.match(/(?:BP|Blood Pressure):?\s*(\d+)\s*\/\s*(\d+)/i);
  if (bpMatch) {
    parsed.systole = bpMatch[1];
    parsed.diastole = bpMatch[2];
  }

  const pulseMatch = vitals.match(/(?:Pulse|HR|Heart Rate):?\s*(\d+)/i);
  if (pulseMatch) parsed.pulse = pulseMatch[1];

  const rrMatch = vitals.match(/(?:RR|Resp(?:iratory)? Rate):?\s*(\d+)/i);
  if (rrMatch) parsed.respiratoryRate = rrMatch[1];

  const tempMatch = vitals.match(/(?:Temp(?:erature)?):?\s*([\d.]+)/i);
  if (tempMatch) parsed.temperature = tempMatch[1];

  const spo2Match = vitals.match(/(?:SpO2|O2 Sat(?:uration)?):?\s*(\d+)/i);
  if (spo2Match) parsed.oxygenSaturation = spo2Match[1];

  return parsed;
}

function extractAvpuFromExam(exam: string): {
  awake?: boolean;
  respondsToVoice?: boolean;
  respondsToPain?: boolean;
  unresponsive?: boolean;
} {
  if (!exam) return {};
  const lower = exam.toLowerCase();
  return {
    awake: lower.includes('alert') || lower.includes('awake') || lower.includes('conscious'),
    respondsToVoice: lower.includes('responds to voice') || lower.includes('verbal response'),
    respondsToPain: lower.includes('responds to pain') || lower.includes('painful stimuli'),
    unresponsive: lower.includes('unresponsive') || lower.includes('unconscious'),
  };
}

/**
 * The officer's AVPU selection, mapped to the form's four D-section radios
 * (Vågen / Uklar / Svarer ikke på tiltale / Bevidstløs).
 *
 * Preferred over [extractAvpuFromExam]: the app offers AVPU as a dropdown, so a
 * deliberate "Voice" used to leave the section blank unless the exam prose
 * happened to contain the words the regex looks for — and a blank consciousness
 * section reads to the doctor as "not assessed", not "responds to voice only".
 */
function avpuFromSelection(value: unknown): {
  awake?: boolean;
  respondsToVoice?: boolean;
  respondsToPain?: boolean;
  unresponsive?: boolean;
} | null {
  const v = String(value ?? '').trim().toLowerCase();
  if (!v) return null;
  return {
    awake: v === 'alert',
    respondsToVoice: v === 'voice',
    respondsToPain: v === 'pain',
    unresponsive: v === 'unresponsive',
  };
}

/**
 * The M-EWS score and the vitals behind it, as one line:
 *
 *   M-EWS: 12; Pulse 118 bpm, BP 95/60 mmHg, Resp 24/min, SpO2 92%, Temp 38.4°C, AVPU Voice
 *
 * The vitals also have dedicated boxes of their own in sections B, C and E, but
 * those are scattered across the form — repeating them beside the score puts
 * the numbers next to what they produced, so the doctor can see what the score
 * is made of without reading back up the page. Missing readings are dropped
 * rather than printed empty.
 */
function mewsAndVitalsLine(
  summary: MedicalSummary,
  vitals: ReturnType<typeof parseVitals>,
): string {
  const val = (v: unknown, fallback?: string): string => String(v ?? fallback ?? '').trim();
  const bp = [val(summary.circulation_systole, vitals.systole),
              val(summary.circulation_diastole, vitals.diastole)].filter(Boolean).join('/');
  const readings = [
    ['Pulse', val(summary.circulation_pulse_per_min, vitals.pulse), ' bpm'],
    ['BP', bp, ' mmHg'],
    ['Resp', val(summary.breathing_num_breaths_per_min, vitals.respiratoryRate), '/min'],
    ['SpO2', val(summary.breathing_oxygen_saturation, vitals.oxygenSaturation), '%'],
    ['Temp', val(summary.expose_temperature_measured_mouth, vitals.temperature), '°C'],
    ['AVPU', val(summary.avpu), ''],
  ]
    .filter(([, value]) => value !== '')
    .map(([label, value, unit]) => `${label} ${value}${unit}`)
    .join(', ');

  const score = mewsScore(summary, vitals);
  if (!score) return readings;
  return readings ? `M-EWS: ${score}; ${readings}` : `M-EWS: ${score}`;
}

/**
 * Join the parts of a section under their headings, dropping the blanks.
 * The RMD form has one free-text box where the app has several fields, so the
 * headings are what keeps them legible once concatenated.
 */
function joinSections(parts: Array<[string, unknown]>): string {
  return parts
    .map(([label, value]) => [label, String(value ?? '').trim()] as const)
    .filter(([, value]) => value !== '')
    .map(([label, value]) => (label ? `${label}: ${value}` : value))
    .join('\n\n');
}

/**
 * A port and its ETA in one field, as `THBKK/13 days`.
 *
 * The RMD form has no ETA column, so the app's separate ETA would otherwise
 * never reach the doctor. The box is narrow and its printed label already reads
 * "Destination/ETA", so the value carries no prefix or brackets of its own —
 * spelling out "(ETA ...)" only pushed the text past the edge of the field.
 */
function portWithEta(port: unknown, eta: unknown): string {
  const name = String(port ?? '').trim();
  const arrival = String(eta ?? '').trim();
  if (!name) return arrival;
  return arrival ? `${name}/${arrival}` : name;
}

function getCurrentDateTime(): { date: string; time: string; utc: string } {
  const now = new Date();
  return {
    date: now.toISOString().split('T')[0],
    time: now.toTimeString().split(' ')[0].substring(0, 5),
    utc: `UTC${now.getTimezoneOffset() / -60 >= 0 ? '+' : ''}${now.getTimezoneOffset() / -60}`,
  };
}

export function mapSummaryToRmdFields(summary: MedicalSummary): Record<string, unknown> {
  const vitals = parseVitals(String(summary.vitals || ''));
  const avpu = avpuFromSelection(summary.avpu) ?? extractAvpuFromExam(String(summary.exam || ''));
  const dateTime = getCurrentDateTime();

  return {
    // Patient information (Danish labels)
    'Navn': `${summary.patientFirstName || ''} ${summary.patientLastName || ''}`.trim(),
    'CPR': summary.dateOfBirth || '',
    'Text Field 9': summary.gender || '',
    'Text Field 10': summary.patientNationality || '',
    'Dato_af_date': summary.date || dateTime.date,
    'UTC': summary.patientUtc || dateTime.utc,

    // Vessel information
    'Text Field 13': summary.patientCompany || '',
    'Text Field 14': summary.shipName || '',
    'Text Field 15': summary.patientEmail || '',
    'Text Field 16': summary.shipSatellitePhone || '',
    'Text Field 17': summary.shipCallSign || '',
    'Text Field 18': summary.location || '',
    'Text Field 19': portWithEta(summary.destination, summary.etaDestination),
    'Text Field 20': portWithEta(summary.nearestPort, summary.etaNearestPort),
    'Text Field 21': summary.medicineChestType || '',
    'Text Field 22': '1 of 1',

    // Medical history
    'Text Field 23': summary.currentMedications || '',
    'Text Field 24': summary.allergies || '',
    'Check Box 1789': summary.no_medicine || false,
    'Check Box 1790': summary.dont_know_medicine || false,
    'Check Box 1791': summary.no_allergies || false,
    'Check Box 1792': summary.dont_know_allergies || false,

    // Chief complaint.
    //
    // The RMD form has one free-text box where the app collects four things.
    // Associated symptoms, past medical history and the M-EWS score have no
    // field of their own on this form, so without folding them in here they are
    // collected, shown in the Marina report, and then dropped on the way to the
    // Danish doctor. M-EWS goes last so the narrative reads first.
    'Text Field 25': joinSections([
      ['', summary.problemDescription],
      ['Associated symptoms', summary.associatedSymptoms],
      ['Past medical history', summary.pastHistory],
    ]),

    // Airway assessment.
    //
    // Only a real CPR start time goes here. This used to fall back to the
    // report's own time, so every report claimed CPR had been initiated —
    // the box reads "If no breathing, or insufficient gasping for air, CPR
    // initiated at:", and a time in it asserts a resuscitation that never
    // happened. Blank is the honest answer when nobody recorded one.
    'Text Field 325': summary.airway_cpr_start || '',
    'Givet ilt liter min': summary.airway_admin_oxygen_liters_per_min || '',
    'Check Box 1': summary.checkbox_airway_clear_yes || false,
    'Check Box 71': summary.checkbox_airway_clear_no || false,
    'Check Box 94': summary.checkbox_airway_jaw_lift || false,
    'Check Box 95': summary.checkbox_airway_suction || false,
    'Check Box 101': summary.checkbox_airway_guedal || false,
    'Check Box 99': summary.checkbox_airway_neck_back_injury_yes || false,
    'Check Box 98': summary.checkbox_airway_neck_back_injury_no || false,
    'Check Box 97': summary.checkbox_airway_fitted_neck_collar_yes || false,
    'Check Box 96': summary.checkbox_airway_fitted_neck_collar_no || false,

    // Breathing assessment
    'Text Field 329': summary.breathing_description || '',
    'Antal vejrtrækninger pr. min': summary.breathing_num_breaths_per_min || vitals.respiratoryRate || '',
    'Iltmætning i %': summary.breathing_oxygen_saturation || vitals.oxygenSaturation || '',
    'Check Box 106': summary.checkbox_breathing_fast || false,
    'Check Box 107': summary.checkbox_breathing_slow || false,
    'Check Box 108': summary.checkbox_breathing_shallow || false,

    // Circulation assessment
    'Kapillærrespons antal sek': summary.circulation_capillary_response || '',
    'Text Field 29': summary.circulation_skin_temp_and_humidity || '',
    'Puls / min': summary.circulation_pulse_per_min || vitals.pulse || '',
    'Systole(høj)': summary.circulation_systole || vitals.systole || '',
    'Diastole(lav)': summary.circulation_diastole || vitals.diastole || '',
    'Check Box 1020': summary.checkbox_circulation_temp_wrist || false,
    'Check Box 1021': summary.checkbox_circulation_temp_neck || false,
    'groin': summary.checkbox_circulation_temp_groin || false,

    // Disability / neurological
    'bevidsthedValue1': {
      value: summary.checkbox_disability_avpu_awake || avpu.awake || false,
      onValue: 'V\u00E5gen',
    },
    'bevidsthedValue2': summary.checkbox_disability_avpu_visual || avpu.respondsToVoice || false,
    'bevidsthedValue3': summary.checkbox_disability_avpu_pain || avpu.respondsToPain || false,
    'bevidsthedValue4': summary.checkbox_disability_avpu_unconscious || avpu.unresponsive || false,
    'Check Box 1030': summary.checkbox_disability_convulsions_yes || false,
    'Check Box 1031': summary.checkbox_disability_convulsions_no || false,
    'Check Box 1032': summary.checkbox_disability_paralysis_yes || false,
    'Check Box 1033': summary.checkbox_disability_paralysis_no || false,
    'Text Field 35': summary.disability_pupil_reaction_description || '',

    // Exposure assessment
    'Check Box 1034': summary.expose_top_to_toe_examination_performed_yes || false,
    'Check Box 1035': summary.expose_top_to_toe_examination_performed_no || false,
    // Only a top-to-toe description recorded against this box. `exam` used to
    // fall through to here as well as into performed actions, printing the same
    // findings twice on one form.
    'Text Field 36': summary.expose_top_to_toe_examination_description || '',
    'Check Box 1036': summary.expose_hypothermia_overheating_performed_yes || false,
    'Check Box 1037': summary.expose_hypothermia_overheating_performed_no || false,
    'Text Field 37': summary.expose_hypothermia_overheating_description || '',
    'Check Box 1038': summary.expose_temperature_performed_yes || false,
    'Check Box 1039': summary.expose_temperature_performed_no || false,
    'Temperatur målt i munden': summary.expose_temperature_measured_mouth || vitals.temperature || '',
    'Temperatur målt alternativt': summary.expose_temperature_measured_alternatively || '',
    'Text Field 40': summary.expose_temperature_measured_place || '',

    // Treatment & actions
    'Text Field 44': summary.preparedBy || summary.medical_officer_name_and_title || '',
    // Time of actions = the report's Time (incidentTime). Keep performed_actions_time
    // as a fallback for older/partner clients, then the computed time.
    'Kl': summary.incidentTime || summary.performed_actions_time || dateTime.time,
    // Performed actions. The form has one box here and several things that need
    // to reach the doctor: the vitals and the M-EWS they produce lead, then the
    // investigations and the examination, which v2 splits into `investigations`
    // and `exam` and which have no field of their own on this form.
    'Text Field 41': summary.performedActions
      ? String(summary.performedActions)
      : joinSections([
          ['', mewsAndVitalsLine(summary, vitals)],
          ['Investigations', summary.investigations],
          ['Physical examination', summary.exam],
        ]),
    'Medicin1': summary.medications_field1 || '',
    'medicin2': summary.medications_field2 || '',
    'medicin3': summary.medications_field3 || '',
    'medicin4': summary.medications_field4 || '',
    'Dokumentation af ordination og handlinger': summary.documentation_of_prescriptions_and_actions || summary.plan || '',

    // Observation chart
    'Text Field 194': summary.observation_chart_general_condition || '',
    'Text Field 201': summary.observation_chart_level_consciousness || '',
    'Text Field 2061': summary.observation_chart_pupil_reaction || '',
    'Venekanyle anlagt value': summary.observation_chart_cannula_inserted || '',
    'Text Field 2066': summary.observation_chart_intravenous_fluid || '',
    'Text Field 2072': summary.observation_chart_fluid_intake || '',
    'Text Field 2073': summary.observation_chart_24_hour_urine || '',
    'Text Field 2084': summary.observation_chart_urine_sticks || '',
    'Text Field 2085': summary.observation_chart_blood_sugar || '',
    'Text Field 2096': summary.observation_chart_malaria_test || '',
  };
}

export function extractMedicationFields(medications: string | boolean | null | undefined): {
  medications_field1?: string;
  medications_field2?: string;
  medications_field3?: string;
  medications_field4?: string;
} {
  if (!medications || typeof medications !== 'string') return {};

  const lines = medications
    .split(/\n|•/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .slice(0, 4);

  return {
    medications_field1: lines[0] || '',
    medications_field2: lines[1] || '',
    medications_field3: lines[2] || '',
    medications_field4: lines[3] || '',
  };
}
