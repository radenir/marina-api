/**
 * Norwegian Radio Medical Record field mapper.
 *
 * Maps a MedicalSummary (the same camelCase/snake_case extract the RMD and
 * Marina mappers read) to the AcroForm field names of
 * public/templates/radio-medical-record.pdf — the English Radio Medical Record
 * branded for Radio Medico Norway (Mariners Medico Guide, Helse Bergen), built
 * by scripts/gen-radio-medical-record.py + scripts/build-seafarer-form.ts.
 *
 * The layout follows the Danish RMD form, so the source keys are the RMD
 * mapper's. Unlike the RMD PDF, this form has real radio groups and an M-EWS
 * table with a value and points box per parameter.
 *
 * Value shapes (as fillNorwegianForm expects):
 *   string                       text field
 *   boolean                      checkbox (true = ticked)
 *   { value: true, onValue }     radio group selection, onValue = export value
 *
 * Left untouched: the body-map pin checkboxes (bm_*), driven by the body
 * diagram rather than the summary, and the signature box.
 */
import { calculateMEWS, type MEWSInput, type MEWSResult } from './mewsCalculator.js';
import {
  type MedicalSummary, parseVitals, joinSections, portWithEta, getCurrentDateTime,
} from './rmdMapper.js';

export type NorwegianFieldValue = string | boolean | { value: boolean; onValue: string };

/** Rows on the page-3 "Documentation of prescriptions and actions" log. */
const LOG_ROWS = 39;
/** Characters that fit on one log row before wrapping to the next. */
const LOG_ROW_CHARS = 110;

/** Coerce a possibly null/boolean summary value to a trimmed string ('' when absent). */
function str(raw: unknown): string {
  return raw === null || raw === undefined || typeof raw === 'boolean' ? '' : String(raw).trim();
}

function num(raw: string): number | null {
  const n = parseFloat(raw.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function radio(onValue: string | undefined): NorwegianFieldValue | undefined {
  return onValue ? { value: true, onValue } : undefined;
}

/** A yes/no radio from the extract's paired checkbox_*_yes / _no flags. */
function yesNo(yes: unknown, no: unknown): NorwegianFieldValue | undefined {
  return radio(yes === true ? 'yes' : no === true ? 'no' : undefined);
}

/**
 * Split free text across the log rows: one row per line, long lines wrapped at
 * a word boundary. Text beyond the last row is dropped — the log is the end of
 * the form — so the last row says so rather than silently truncating.
 */
function logRows(text: string): string[] {
  const rows: string[] = [];
  for (const line of text.split('\n').map((l) => l.trim()).filter(Boolean)) {
    let rest = line;
    while (rest.length > LOG_ROW_CHARS) {
      const cut = rest.lastIndexOf(' ', LOG_ROW_CHARS);
      const at = cut > 0 ? cut : LOG_ROW_CHARS;
      rows.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
    if (rest) rows.push(rest);
  }
  if (rows.length > LOG_ROWS) {
    rows.length = LOG_ROWS;
    rows[LOG_ROWS - 1] = '… continued in the Marina report';
  }
  return rows;
}

/**
 * Bring the points in line with the M-EWS table printed on this form (Radio
 * Medico's), which scores three bands higher than lib/mewsCalculator: oxygen
 * 3 (calculator 2), heart rate ≤40 3 (calculator 2) and a temperature of
 * exactly 35.0 °C 3 (calculator 1). The points sit beside those printed bands,
 * so they must agree with them; the total is recomputed to match.
 */
function radioMedicoBands(result: MEWSResult, input: MEWSInput): MEWSResult {
  const r = { ...result };
  if (input.oxygen_requirements === 'oxygen') r.oxygen_req_score = 3;
  if (input.pulse_per_min !== null && input.pulse_per_min <= 40) r.heart_rate_score = 3;
  if (input.temperature_celsius !== null && input.temperature_celsius <= 35.0) r.temperature_score = 3;
  r.total_score = r.heart_rate_score + r.respiratory_rate_score + r.temperature_score + r.bp_score
    + r.spo2_score + r.oxygen_req_score + r.consciousness_score;
  return r;
}

export function mapSummaryToNorwegianFields(summary: MedicalSummary): Record<string, NorwegianFieldValue> {
  const vitals = parseVitals(String(summary.vitals || ''));
  const dateTime = getCurrentDateTime();

  // ---- Vitals: discrete extract fields first, the parsed vitals string second ----
  const rr = str(summary.breathing_num_breaths_per_min) || vitals.respiratoryRate || '';
  const spo2 = str(summary.breathing_oxygen_saturation) || vitals.oxygenSaturation || '';
  const hr = str(summary.circulation_pulse_per_min) || vitals.pulse || '';
  const systolic = str(summary.circulation_systole) || vitals.systole || '';
  const diastolic = str(summary.circulation_diastole) || vitals.diastole || '';
  const tempMouth = str(summary.expose_temperature_measured_mouth) || vitals.temperature || '';
  const temp = tempMouth || str(summary.expose_temperature_measured_alternatively);
  const oxygenLpm = str(summary.airway_admin_oxygen_liters_per_min);

  // AVPU: the officer's dropdown selection, else the D-section checkboxes.
  const avpuRaw = str(summary.avpu).toLowerCase();
  const avpu =
    ['alert', 'voice', 'pain', 'unresponsive'].includes(avpuRaw) ? avpuRaw
    : summary.checkbox_disability_avpu_awake === true ? 'alert'
    : summary.checkbox_disability_avpu_visual === true ? 'voice'
    : summary.checkbox_disability_avpu_pain === true ? 'pain'
    : summary.checkbox_disability_avpu_unconscious === true ? 'unresponsive'
    : '';

  // Air or oxygen is only known when oxygen is being given.
  const onOxygen = (num(oxygenLpm) ?? 0) > 0;

  // ---- M-EWS: recomputed from the vitals on this form (see rmdMapper.mewsScore) ----
  const mewsInput: MEWSInput = {
    respiration_per_min: num(rr),
    oxygen_saturation_percent: num(spo2),
    oxygen_requirements: onOxygen ? 'oxygen' : null,
    blood_pressure_systolic: num(systolic),
    pulse_per_min: num(hr),
    avpu: avpu ? ((avpu[0].toUpperCase() + avpu.slice(1)) as 'Alert' | 'Voice' | 'Pain' | 'Unresponsive') : null,
    temperature_celsius: num(temp),
  };
  const anyVital = Object.values(mewsInput).some((v) => v !== null);
  const mews = anyVital ? radioMedicoBands(calculateMEWS(mewsInput), mewsInput) : null;
  const points = (present: boolean, score: number | undefined) => (present && mews ? String(score) : '');

  const ews: Record<string, NorwegianFieldValue | undefined> = {
    ews_rr_value: rr,
    ews_rr_points: points(mewsInput.respiration_per_min !== null, mews?.respiratory_rate_score),
    ews_spo2_value: spo2,
    ews_spo2_points: points(mewsInput.oxygen_saturation_percent !== null, mews?.spo2_score),
    ews_o2_value: onOxygen ? 'Oxygen' : '',
    ews_o2_points: points(onOxygen, mews?.oxygen_req_score),
    ews_sbp_value: systolic,
    ews_sbp_points: points(mewsInput.blood_pressure_systolic !== null, mews?.bp_score),
    ews_hr_value: hr,
    ews_hr_points: points(mewsInput.pulse_per_min !== null, mews?.heart_rate_score),
    ews_avpu_value: avpu ? avpu[0].toUpperCase() + avpu.slice(1) : '',
    ews_avpu_points: points(avpu !== '', mews?.consciousness_score),
    ews_temp_value: temp,
    ews_temp_points: points(mewsInput.temperature_celsius !== null, mews?.temperature_score),
    ews_total: mews ? String(mews.total_score) : str(summary.mewsScore),
    ews_status: radio(mews ? (mews.missing_values.length === 0 ? 'complete' : 'incomplete') : undefined),
  };

  const fields: Record<string, NorwegianFieldValue | undefined> = {
    // ---- Patient & vessel ----
    patient_name: `${summary.patientFirstName || ''} ${summary.patientLastName || ''}`.trim(),
    dob: str(summary.dateOfBirth),
    gender: radio(({ male: 'male', m: 'male', female: 'female', f: 'female' } as Record<string, string>)[
      str(summary.gender).toLowerCase()]),
    nationality: str(summary.patientNationality),
    report_date: str(summary.date) || dateTime.date,
    report_utc: str(summary.patientUtc) || dateTime.utc,
    shipping_company: str(summary.patientCompany),
    ship_name: str(summary.shipName),
    ship_email: str(summary.patientEmail),
    satellite_phone: str(summary.shipSatellitePhone),
    call_sign: str(summary.shipCallSign),
    coordinates: str(summary.location),
    destination_eta: portWithEta(summary.destination, summary.etaDestination),
    nearest_port_eta: portWithEta(summary.nearestPort, summary.etaNearestPort),
    medicine_chest: str(summary.medicineChestType),
    pages_total: '4',

    // ---- Medicines & allergies ----
    medicines: str(summary.currentMedications),
    medicines_status: radio(summary.no_medicine === true ? 'no'
      : summary.dont_know_medicine === true ? 'unknown' : undefined),
    allergies: str(summary.allergies),
    allergies_status: radio(summary.no_allergies === true ? 'no'
      : summary.dont_know_allergies === true ? 'unknown' : undefined),

    // ---- Problem description ----
    // One box where the app collects several things; associated symptoms and
    // past history have no field of their own on this form.
    problem_description: joinSections([
      ['', summary.problemDescription],
      ['Associated symptoms', summary.associatedSymptoms],
      ['Past medical history', summary.pastHistory],
    ]),

    ...ews,

    // ---- A: Airway ----
    airway_clear: yesNo(summary.checkbox_airway_clear_yes, summary.checkbox_airway_clear_no),
    airway_jaw_lift: summary.checkbox_airway_jaw_lift === true,
    airway_suction: summary.checkbox_airway_suction === true,
    airway_guedel: summary.checkbox_airway_guedal === true,
    // Only a recorded CPR start time — a time here asserts a resuscitation.
    cpr_started_at: str(summary.airway_cpr_start),
    oxygen_lpm: oxygenLpm,
    neck_injury_suspected: yesNo(summary.checkbox_airway_neck_back_injury_yes,
      summary.checkbox_airway_neck_back_injury_no),
    neck_collar: yesNo(summary.checkbox_airway_fitted_neck_collar_yes,
      summary.checkbox_airway_fitted_neck_collar_no),

    // ---- B: Breathing ----
    breath_fast: summary.checkbox_breathing_fast === true,
    breath_slow: summary.checkbox_breathing_slow === true,
    breath_shallow: summary.checkbox_breathing_shallow === true,
    breath_deep: summary.checkbox_breathing_deep === true,
    breath_normal: summary.checkbox_breathing_normal === true,
    breath_other: str(summary.breathing_description),
    resp_rate: rr,
    spo2,

    // ---- C: Circulation ----
    cap_refill: str(summary.circulation_capillary_response),
    skin_feel: str(summary.circulation_skin_temp_and_humidity),
    heart_rate: hr,
    pulse_site: radio(summary.checkbox_circulation_temp_wrist === true ? 'wrist'
      : summary.checkbox_circulation_temp_neck === true ? 'neck'
      : summary.checkbox_circulation_temp_groin === true ? 'groin' : undefined),
    bp_systolic: systolic,
    bp_diastolic: diastolic,

    // ---- D: Disability ----
    consciousness: radio(({ alert: '1', voice: '2', pain: '3', unresponsive: '4' } as Record<string, string>)[avpu]),
    convulsions: yesNo(summary.checkbox_disability_convulsions_yes, summary.checkbox_disability_convulsions_no),
    paralysis: yesNo(summary.checkbox_disability_paralysis_yes, summary.checkbox_disability_paralysis_no),
    pupils_description: str(summary.disability_pupil_reaction_description),

    // ---- E: Expose ----
    top_to_toe: yesNo(summary.expose_top_to_toe_examination_performed_yes,
      summary.expose_top_to_toe_examination_performed_no),
    top_to_toe_findings: str(summary.expose_top_to_toe_examination_description),
    temp_disorder: yesNo(summary.expose_hypothermia_overheating_performed_yes,
      summary.expose_hypothermia_overheating_performed_no),
    temp_disorder_findings: str(summary.expose_hypothermia_overheating_description),
    temp_measured: yesNo(summary.expose_temperature_performed_yes, summary.expose_temperature_performed_no),
    temperature: temp,
    temp_site: str(summary.expose_temperature_measured_place) || (tempMouth ? 'Mouth' : ''),

    // ---- Performed actions ----
    // The vitals already sit in the M-EWS table on this form, so unlike the RMD
    // box this one carries only the investigations and the examination.
    performed_actions: str(summary.performedActions) || joinSections([
      ['Investigations', summary.investigations],
      ['Physical examination', summary.exam],
    ]),

    // ---- Medication given before contact with Radio Medico ----
    // Only explicit entries: the patient's regular medicines go in `medicines`.
    premed_1: str(summary.medications_field1),
    premed_2: str(summary.medications_field2),
    premed_3: str(summary.medications_field3),
    premed_4: str(summary.medications_field4),

    // ---- Medical officer ----
    medical_officer: str(summary.preparedBy) || str(summary.medical_officer_name_and_title),

    // ---- Body map ----
    body_notes: str(summary.bodyNotes) || str(summary.markedAreas),
  };

  // ---- Page 3: documentation of prescriptions and actions ----
  const log = logRows(str(summary.documentation_of_prescriptions_and_actions) || str(summary.plan));
  log.forEach((row, i) => { fields[`log_${i + 1}`] = row; });
  if (log.length) fields.log_1_time = str(summary.incidentTime) || str(summary.performed_actions_time);

  const out: Record<string, NorwegianFieldValue> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === '' || v === false) continue;
    out[k] = v;
  }
  return out;
}
