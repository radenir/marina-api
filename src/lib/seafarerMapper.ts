/**
 * Seafarer Medical Report field mapper.
 *
 * Maps a MedicalSummary (camelCase, the same data the RMD endpoint uses) to the
 * AcroForm field names of public/templates/seafarer-medical-report.pdf
 * (snake_case). Mirrors rmdMapper.ts but for the Marina seafarer form.
 *
 * Radio fields (sex, consciousness) are selected by emitting
 * `{ value: true, onValue: '<exportValue>' }`, which the FDF generator turns
 * into `/V /<exportValue>` — the export values must match the form exactly:
 *   sex:           male | female
 *   consciousness: alert | voice | pain | unresponsive
 * medicine_chest is a free-text field (flag-state chests vary; A/B/C is EU-only).
 *
 * Fields with no source in MedicalSummary are simply omitted (left blank):
 * flag_state, vessel_type, latitude/longitude (only a combined location exists),
 * departure_port/date, nearest_eta, arrival_eta, blood_sugar, height, weight,
 * gcs_total, pain_scale, language, body_notes, other_comments.
 */
import { type MedicalSummary, parseVitals } from './rmdMapper.js';

type FieldValue = string | { value: boolean; onValue: string };

/** Select a radio option only when the incoming value maps to a known export value. */
function radio(raw: unknown, allowed: Record<string, string>): FieldValue | undefined {
  if (raw === null || raw === undefined || raw === '') return undefined;
  const key = String(raw).trim().toLowerCase();
  const onValue = allowed[key];
  if (!onValue) return undefined;
  return { value: true, onValue };
}

export function mapSummaryToSeafarerFields(summary: MedicalSummary): Record<string, FieldValue> {
  const vitals = parseVitals(String(summary.vitals || ''));

  const bloodPressure =
    vitals.systole && vitals.diastole ? `${vitals.systole}/${vitals.diastole}` : '';

  const fields: Record<string, FieldValue | undefined> = {
    // ---- Vessel ----
    vessel_name: (summary.shipName as string) || '',
    call_sign: (summary.shipCallSign as string) || '',
    shipping_company: (summary.patientCompany as string) || '',
    ship_email: (summary.patientEmail as string) || '',
    satellite_phone: (summary.shipSatellitePhone as string) || '',
    // free text now (A/B/C is EU-only; flag-state chests vary), so pass through
    medicine_chest: (summary.medicineChestType as string) || '',

    // ---- Voyage & position ----
    nearest_port: (summary.nearestPort as string) || '',
    arrival_port: (summary.destination as string) || '',
    // latitude/longitude: only a combined `location` coordinates string exists,
    // so drop it into latitude rather than guess a split. (Note: `position` is
    // the patient's job role, NOT geographic — it maps to `rank`.)
    latitude: (summary.location as string) || '',

    // ---- Report ----
    medical_officer: (summary.preparedBy as string) || (summary.reportedBy as string) || '',
    report_date: (summary.date as string) || (summary.incidentDate as string) || '',
    report_time: (summary.incidentTime as string) || '',
    report_utc: (summary.patientUtc as string) || '',

    // ---- Patient ----
    patient_name: `${summary.patientFirstName || ''} ${summary.patientLastName || ''}`.trim(),
    dob: (summary.dateOfBirth as string) || '',
    sex: radio(summary.gender, { male: 'male', m: 'male', female: 'female', f: 'female' }),
    nationality: (summary.patientNationality as string) || '',
    rank: (summary.position as string) || '',

    // ---- Presenting problem ----
    problem_description:
      (summary.problemDescription as string) ||
      [summary.chiefComplaint, summary.history].filter(Boolean).join(' — ') ||
      '',

    // ---- Vital signs ----
    temperature: vitals.temperature || '',
    heart_rate: vitals.pulse || '',
    blood_pressure: bloodPressure,
    resp_rate: vitals.respiratoryRate || '',
    spo2: vitals.oxygenSaturation || '',
    consciousness: radio(summary.avpu, {
      alert: 'alert',
      voice: 'voice',
      pain: 'pain',
      unresponsive: 'unresponsive',
    }),
    mews_score:
      summary.mewsScore !== null && summary.mewsScore !== undefined
        ? String(summary.mewsScore)
        : '',

    // ---- History & examination ----
    associated_symptoms: (summary.chiefSymptom as string) || '',
    past_medical_history: (summary.pastHistory as string) || '',
    medications: (summary.currentMedications as string) || '',
    allergies: (summary.allergies as string) || '',
    physical_exam: (summary.exam as string) || '',

    // ---- Investigations / actions ----
    investigations: (summary.performedActions as string) || '',
  };

  // Drop undefined / empty radio selections so pdftk leaves them untouched.
  const out: Record<string, FieldValue> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}
