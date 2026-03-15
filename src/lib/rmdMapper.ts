/**
 * RMD Field Mapper
 * Maps MedicalSummary data to RMD PDF form field names.
 * RMD (Radio Medical) is a standardized Danish maritime medical form.
 */

export type MedicalSummary = Record<string, string | boolean | null | undefined>;

function parseVitals(vitals: string): {
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
  const avpu = extractAvpuFromExam(String(summary.exam || ''));
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
    'Text Field 19': summary.destination || '',
    'Text Field 20': summary.nearestPort || '',
    'Text Field 21': summary.medicineChestType || '',
    'Text Field 22': '1 of 1',

    // Medical history
    'Text Field 23': summary.currentMedications || '',
    'Text Field 24': summary.allergies || '',
    'Check Box 1789': summary.no_medicine || false,
    'Check Box 1790': summary.dont_know_medicine || false,
    'Check Box 1791': summary.no_allergies || false,
    'Check Box 1792': summary.dont_know_allergies || false,

    // Chief complaint
    'Text Field 25': summary.problemDescription || '',

    // Airway assessment
    'Text Field 325': summary.airway_cpr_start || summary.incidentTime || '',
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
    'Text Field 36': summary.expose_top_to_toe_examination_description || summary.exam || '',
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
    'Kl': summary.performed_actions_time || dateTime.time,
    'Text Field 41': summary.performedActions || '',
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
