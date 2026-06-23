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
 * Every text/radio field on the form has a mapping; `age` is derived from
 * `dateOfBirth` when not supplied, and a combined `location` string is split
 * into latitude/longitude. The only fields left untouched are the body-map pin
 * checkboxes (the bm_front and bm_back groups), which are driven separately by
 * the body diagram, not by the summary — use `bodyNotes` for the description.
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

/** Coerce a possibly null/boolean summary value to a trimmed string ('' when absent). */
function str(raw: unknown): string {
  return raw === null || raw === undefined || typeof raw === 'boolean' ? '' : String(raw).trim();
}

/**
 * Split a combined coordinates string into latitude / longitude. Accepts the
 * usual "<lat>, <lon>" form (e.g. "51.9244 N, 4.4777 E"); if there's no comma
 * the whole string is treated as latitude and longitude is left blank.
 */
function splitCoords(location: string): { latitude: string; longitude: string } {
  const idx = location.indexOf(',');
  if (idx < 0) return { latitude: location, longitude: '' };
  return { latitude: location.slice(0, idx).trim(), longitude: location.slice(idx + 1).trim() };
}

/** Whole years between a date-of-birth string and today; '' if unparseable. */
function ageFromDob(dob: string): string {
  if (!dob) return '';
  const born = new Date(dob);
  if (Number.isNaN(born.getTime())) return '';
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const m = now.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < born.getDate())) age--;
  return age >= 0 && age < 130 ? String(age) : '';
}

export function mapSummaryToSeafarerFields(summary: MedicalSummary): Record<string, FieldValue> {
  const vitals = parseVitals(String(summary.vitals || ''));

  // Vitals arrive either as a single `vitals` string (parsed above) or, from
  // /ai/extract, as discrete fields (circulation_*/breathing_*/expose_*). Prefer
  // the discrete fields and fall back to the parsed string — the same precedence
  // the RMD mapper uses, so both report templates read one extract shape.
  const systole = str(summary.circulation_systole) || vitals.systole || '';
  const diastole = str(summary.circulation_diastole) || vitals.diastole || '';
  const bloodPressure = systole && diastole ? `${systole}/${diastole}` : '';

  const dob = str(summary.dateOfBirth);
  const { latitude, longitude } = splitCoords(str(summary.location));

  const fields: Record<string, FieldValue | undefined> = {
    // ---- Vessel ----
    vessel_name: str(summary.shipName),
    call_sign: str(summary.shipCallSign),
    flag_state: str(summary.flagState),
    shipping_company: str(summary.patientCompany),
    ship_email: str(summary.patientEmail),
    vessel_type: str(summary.vesselType),
    satellite_phone: str(summary.shipSatellitePhone),
    // free text now (A/B/C is EU-only; flag-state chests vary), so pass through
    medicine_chest: str(summary.medicineChestType),

    // ---- Voyage & position ----
    // A combined `location` coordinates string is split on the comma into
    // latitude / longitude; explicit `latitude`/`longitude` keys win if present.
    latitude: str(summary.latitude) || latitude,
    longitude: str(summary.longitude) || longitude,
    nearest_port: str(summary.nearestPort),
    nearest_eta: str(summary.etaNearestPort),
    departure_port: str(summary.departurePort),
    departure_date: str(summary.departureDate),
    arrival_port: str(summary.destination),
    arrival_eta: str(summary.etaDestination),

    // ---- Report ----
    medical_officer: str(summary.preparedBy) || str(summary.reportedBy),
    report_date: str(summary.date) || str(summary.incidentDate),
    report_time: str(summary.incidentTime),
    report_utc: str(summary.patientUtc),

    // ---- Patient ----
    patient_name: `${summary.patientFirstName || ''} ${summary.patientLastName || ''}`.trim(),
    dob,
    age: str(summary.age) || ageFromDob(dob),
    sex: radio(summary.gender, { male: 'male', m: 'male', female: 'female', f: 'female' }),
    nationality: str(summary.patientNationality),
    rank: str(summary.position),
    language: str(summary.nativeLanguage) || str(summary.language),

    // ---- Presenting problem ----
    problem_description:
      (summary.problemDescription as string) ||
      [summary.chiefComplaint, summary.history].filter(Boolean).join(' — ') ||
      '',

    // ---- Vital signs ----
    temperature: str(summary.expose_temperature_measured_mouth) || vitals.temperature || '',
    heart_rate: str(summary.circulation_pulse_per_min) || vitals.pulse || '',
    blood_pressure: bloodPressure,
    resp_rate: str(summary.breathing_num_breaths_per_min) || vitals.respiratoryRate || '',
    spo2: str(summary.breathing_oxygen_saturation) || vitals.oxygenSaturation || '',
    consciousness: radio(summary.avpu, {
      alert: 'alert',
      voice: 'voice',
      pain: 'pain',
      unresponsive: 'unresponsive',
    }),
    blood_sugar: str(summary.bloodSugar) || str(summary.glucose),
    height: str(summary.height),
    weight: str(summary.weight),
    gcs_total: str(summary.gcsTotal),
    pain_scale: str(summary.painScale),
    mews_score:
      summary.mewsScore !== null && summary.mewsScore !== undefined
        ? String(summary.mewsScore)
        : '',

    // ---- Body map ----
    body_notes: str(summary.bodyNotes) || str(summary.markedAreas),

    // ---- History & examination ----
    associated_symptoms: (summary.chiefSymptom as string) || '',
    past_medical_history: (summary.pastHistory as string) || '',
    medications: (summary.currentMedications as string) || '',
    allergies: (summary.allergies as string) || '',
    physical_exam: (summary.exam as string) || '',

    // ---- Investigations / actions ----
    investigations: (summary.performedActions as string) || '',

    // ---- Other ----
    other_comments: str(summary.otherComments),
  };

  // Drop undefined / empty radio selections so pdftk leaves them untouched.
  const out: Record<string, FieldValue> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}
