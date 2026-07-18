/**
 * German RM Field Mapper
 *
 * Maps MedicalSummary data to the "Radio Medical Advice Form - Primary" issued
 * by TMAS Germany / Medico Cuxhaven, the German counterpart to the Danish RMD
 * form. Two pages, 57 AcroForm fields.
 *
 * Page-1 field names are self-describing and bilingual ("1 Schiffsname Name of
 * ship"). The ABCDE findings block is not: its widgets are named `Text7`,
 * `Group5`, `Check Box11` and so on, and the mapping below was resolved by
 * matching each widget's position on the page against the printed labels. The
 * comments carry the section number so the next reader does not have to repeat
 * that.
 *
 * Radio groups export `Auswahl1` / `Auswahl2`, not `Yes`, so they are written
 * with the `{ value, onValue }` shape that pdftk.ts understands. Checkboxes
 * export `Ja`.
 */

import { parseVitals, type MedicalSummary } from './rmdMapper.js';

/** A radio option, which this form exports as Auswahl1/Auswahl2 rather than Yes. */
function choice(selected: boolean, option: 'Auswahl1' | 'Auswahl2') {
  return { value: selected, onValue: option };
}

/** A checkbox, which this form exports as `Ja` rather than `Yes`. */
function tick(selected: boolean) {
  return { value: selected, onValue: 'Ja' };
}

const str = (v: unknown): string => String(v ?? '').trim();

/** Whole years between a date of birth and today, or '' if unparseable. */
function ageFromDateOfBirth(dob: unknown): string {
  const raw = str(dob);
  if (!raw) return '';
  // Accept both ISO (1990-04-23) and the app's dd/MM/yyyy.
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const born = slash
    ? new Date(Number(slash[3]), Number(slash[2]) - 1, Number(slash[1]))
    : new Date(raw);
  if (Number.isNaN(born.getTime())) return '';
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const beforeBirthday =
    now.getMonth() < born.getMonth() ||
    (now.getMonth() === born.getMonth() && now.getDate() < born.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 && age < 130 ? String(age) : '';
}

/**
 * The date split across the form's `____.____.20____` boxes.
 * `DatumDate` takes the day, `undefined` the month, `20` the last two digits of
 * the year — the third box is preprinted "20".
 */
function splitDate(value: unknown): { day: string; month: string; year: string } {
  const raw = str(value);
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) return { day: slash[1], month: slash[2], year: slash[3].slice(2) };
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return { day: iso[3], month: iso[2], year: iso[1].slice(2) };
  return { day: '', month: '', year: '' };
}

/** Latitude and longitude halves of the app's single `location` string. */
function splitLocation(value: unknown): { ns: string; we: string } {
  const raw = str(value);
  if (!raw) return { ns: '', we: '' };
  const parts = raw.split(/[,;]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return { ns: parts[0], we: parts.slice(1).join(', ') };
  return { ns: raw, we: '' };
}

/** Join labelled parts, dropping the blanks. */
function joinSections(parts: Array<[string, unknown]>): string {
  return parts
    .map(([label, value]) => [label, str(value)] as const)
    .filter(([, value]) => value !== '')
    .map(([label, value]) => (label ? `${label}: ${value}` : value))
    .join('\n\n');
}

export function mapSummaryToGermanFields(summary: MedicalSummary): Record<string, unknown> {
  const vitals = parseVitals(str(summary.vitals));
  const date = splitDate(summary.date);
  const location = splitLocation(summary.location);
  const val = (v: unknown, fallback?: string): string => str(v) || str(fallback);

  const gender = str(summary.gender).toLowerCase();
  const avpu = str(summary.avpu).toLowerCase();
  const chest = str(summary.medicineChestType).toUpperCase();

  const name = [str(summary.patientFirstName), str(summary.patientLastName)]
    .filter(Boolean)
    .join(' ');
  const nationality = str(summary.patientNationality);

  return {
    // Header — Datum/Date ____.____.20____, Zeit/Time (UTC)
    'DatumDate': date.day,
    'undefined': date.month,
    '20': date.year,
    'ZeitTime UTC': val(summary.incidentTime),

    // Dringlichkeit (level of urgency) — Group1 — deliberately left unset.
    // The form asks the officer to declare a life-threatening emergency, which
    // additionally instructs them to telephone TMAS. That is a human decision,
    // not one to infer from an extracted red-flag heuristic.

    // 1-8 vessel
    '1 Schiffsname Name of ship': val(summary.shipName),
    '2Rufzeichen Callsign': val(summary.shipCallSign),
    '31 Telefon': val(summary.shipSatellitePhone),
    '32 Email': val(summary.patientEmail),
    'Text2': location.ns, // 4. Lat./Long. — N/S line
    'WE': location.we, //              — W/E line
    '5 Kapitän Master': '', // not collected; the app knows the medical officer, not the master
    '6 Reederei Owner': val(summary.patientCompany),
    '71 Zielhafen Port of destination': val(summary.destination),
    '72 ETA': val(summary.etaDestination),
    '8 Type of ship': '', // not collected
    '101 Nothafen Next possible emergency port': val(summary.nearestPort),
    '102 ETA': val(summary.etaNearestPort),

    // 9. Medikamentenliste (Druglist) — A1/2, B, C1/C2
    'Check Box2': tick(chest.startsWith('A')),
    'Check Box3': tick(chest.startsWith('B')),
    'Check Box4': tick(chest.startsWith('C')),

    // 11-13.2 patient
    '11Patient NameNationalität': [name, nationality].filter(Boolean).join(' / '),
    '13 Alter Age': ageFromDateOfBirth(summary.dateOfBirth),
    '131 Größe cm height': val(summary.height),
    '132 Gewicht bodyweight kg': val(summary.weight),

    // 12. Geschlecht — Group5: männlich / weiblich
    'Group5': gender.startsWith('m')
      ? choice(true, 'Auswahl1')
      : gender.startsWith('f') || gender.startsWith('w')
        ? choice(true, 'Auswahl2')
        : choice(false, 'Auswahl1'),

    // 16.1.1 Atemfrequenz, 16.2.1 Herzfrequenz, 16.2.3 Blutdruck
    'Text7': val(summary.breathing_num_breaths_per_min, vitals.respiratoryRate),
    'Text8': val(summary.circulation_pulse_per_min, vitals.pulse),
    'Text9': val(summary.circulation_systole, vitals.systole),
    'Text10': val(summary.circulation_diastole, vitals.diastole),

    // 16.3.1 Patient ist — A/V/P/U
    'Check Box11': tick(avpu === 'alert'),
    'Check Box12': tick(avpu === 'voice'),
    'Check Box13': tick(avpu === 'pain'),
    'Check Box14': tick(avpu === 'unresponsive'),

    // 16.4.2 Temperatur
    '1642 Temp C oralaxillarrectal': val(
      summary.expose_temperature_measured_mouth,
      vitals.temperature,
    ),

    // 17.1 Symptoms. The form has no oxygen-saturation box anywhere, so SpO2
    // rides along here rather than being dropped.
    '1711': joinSections([
      ['', summary.problemDescription],
      ['Associated symptoms', summary.associatedSymptoms],
      [
        'SpO2',
        val(summary.breathing_oxygen_saturation, vitals.oxygenSaturation) &&
          `${val(summary.breathing_oxygen_saturation, vitals.oxygenSaturation)}%`,
      ],
    ]),

    // 17.2-17.6 SAMPLE
    '172 A llergies': val(summary.allergies),
    '173 M edication previous': val(summary.currentMedications),
    '174 P ast Medical History': val(summary.pastHistory),
    '175 L ast oral Intake': '', // not collected
    '176 E vents prior to Incident': '', // not collected

    // 18. Verdachtsdiagnose an Bord — the SYBRA pathway the officer selected,
    // which is the nearest thing the app has to a suspected diagnosis and
    // reaches neither of the other two forms.
    '18 Verdachtsdiagnose an Bord Suspected diagnosis': val(summary.chiefSymptom),

    // 19. Bisherige Maßnahmen (page 2)
    '19 Bisherige Maßnahmen Treatment on board': summary.performedActions
      ? str(summary.performedActions)
      : joinSections([
          ['Investigations', summary.investigations],
          ['Physical examination', summary.exam],
        ]),
  };
}
