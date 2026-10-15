/**
 * Test for mapSummaryToNorwegianFields (src/lib/norwegianMapper.ts) and the
 * pdf-lib fill of public/templates/radio-medical-record.pdf.
 *
 * Checks that every mapped name exists on the form with the right field type,
 * that radios use the form's export values, and that the M-EWS points follow
 * the bands printed on the form.
 *
 * No test runner is configured; run directly:
 *     ./node_modules/.bin/tsx tests/norwegianMapper.test.ts
 * Exits non-zero on any failure.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PDFDocument, PDFTextField, PDFCheckBox, PDFName, PDFArray } from 'pdf-lib';
import { mapSummaryToNorwegianFields } from '../src/lib/norwegianMapper.js';
import { fillNorwegianForm } from '../src/lib/seafarerPdf.js';

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.log(`  ✗ ${name}${detail ? `  — ${detail}` : ''}`);
  }
}

const summary: Record<string, string | boolean> = {
  patientFirstName: 'Jonas', patientLastName: 'Berg', gender: 'male',
  problemDescription: 'Fell 2 m from a ladder.', associatedSymptoms: 'Mild shortness of breath.',
  breathing_num_breaths_per_min: '22', breathing_oxygen_saturation: '94',
  circulation_pulse_per_min: '38', circulation_systole: '132', circulation_diastole: '84',
  expose_temperature_measured_mouth: '36.9', avpu: 'Alert', airway_admin_oxygen_liters_per_min: '2',
  checkbox_airway_clear_yes: true, checkbox_breathing_fast: true, checkbox_circulation_temp_wrist: true,
  no_allergies: true, plan: 'Paracetamol 1 g every 6 hours.\nReassess hourly.', incidentTime: '10:15',
};

(async () => {
  const fields = mapSummaryToNorwegianFields(summary);

  console.log('mapping');
  check('name joined', fields.patient_name === 'Jonas Berg');
  check('gender radio', JSON.stringify(fields.gender) === '{"value":true,"onValue":"male"}');
  check('consciousness 1 for Alert', JSON.stringify(fields.consciousness) === '{"value":true,"onValue":"1"}');
  check('allergies "No"', JSON.stringify(fields.allergies_status) === '{"value":true,"onValue":"no"}');
  check('associated symptoms folded into problem', String(fields.problem_description).includes('Associated symptoms: Mild'));
  check('checkboxes are booleans', fields.airway_jaw_lift === undefined && fields.breath_fast === true);
  check('plan split across log rows', fields.log_1 === 'Paracetamol 1 g every 6 hours.' && fields.log_2 === 'Reassess hourly.');
  check('no CPR time invented', fields.cpr_started_at === undefined);

  console.log('M-EWS (printed Radio Medico bands)');
  check('oxygen scores 3', fields.ews_o2_points === '3', String(fields.ews_o2_points));
  check('HR 38 scores 3', fields.ews_hr_points === '3', String(fields.ews_hr_points));
  check('RR 22 scores 2', fields.ews_rr_points === '2');
  check('SpO2 94 scores 1', fields.ews_spo2_points === '1');
  // 2 + 1 + 3 + 0 + 3 + 0 + 0
  check('total 9', fields.ews_total === '9', String(fields.ews_total));
  check('status complete', JSON.stringify(fields.ews_status) === '{"value":true,"onValue":"complete"}');

  console.log('form');
  const form = (await PDFDocument.load(fs.readFileSync('public/templates/radio-medical-record.pdf'))).getForm();
  for (const [name, value] of Object.entries(fields)) {
    let field;
    try { field = form.getField(name); } catch { check(`field "${name}" exists`, false); continue; }
    if (typeof value === 'string') check(`"${name}" is text`, field instanceof PDFTextField);
    else if (typeof value === 'boolean') check(`"${name}" is a checkbox`, field instanceof PDFCheckBox);
    else {
      const opt = field.acroField.dict.lookup(PDFName.of('Opt'));
      const names = opt instanceof PDFArray
        ? opt.asArray().map((v) => (v as { decodeText?: () => string }).decodeText?.() ?? '') : [];
      check(`"${name}" offers "${value.onValue}"`, names.includes(value.onValue), names.join(','));
    }
  }

  const out = path.join(os.tmpdir(), `norwegian-test-${Date.now()}.pdf`);
  const buf = await fillNorwegianForm(fields, out);
  fs.unlinkSync(out);
  const filled = (await PDFDocument.load(buf)).getForm();
  check('filled text reads back', filled.getTextField('patient_name').getText() === 'Jonas Berg');
  check('filled checkbox reads back', filled.getCheckBox('breath_fast').isChecked());

  console.log(failures ? `\n${failures} failure(s)` : '\nall passed');
  process.exit(failures ? 1 : 0);
})();
