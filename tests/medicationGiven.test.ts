/**
 * Medication given on board: from the v2 extract's `medicationGivenOnBoard`
 * to the four forms that print it.
 *
 *   - formatMedicationGiven (src/lib/medicalExtractV2.ts): the model's drug
 *     parts become one line per drug, and anything malformed becomes "".
 *   - medicationLines (src/lib/rmdMapper.ts): the four lines of the RMD and
 *     Norwegian forms; the officer's typed lines win, a fifth drug shares line 4.
 *   - each mapper, and the Marina form actually having the new box.
 *
 * No test runner is configured; run directly:
 *     ./node_modules/.bin/tsx tests/medicationGiven.test.ts
 * Exits non-zero on any failure.
 */
import * as fs from 'fs';
import { PDFDocument, PDFTextField } from 'pdf-lib';
import { formatMedicationGiven } from '../src/lib/medicalExtractV2.js';
import { medicationLines, mapSummaryToRmdFields } from '../src/lib/rmdMapper.js';
import { mapSummaryToNorwegianFields } from '../src/lib/norwegianMapper.js';
import { mapSummaryToGermanFields } from '../src/lib/germanMapper.js';
import { mapSummaryToSeafarerFields } from '../src/lib/seafarerMapper.js';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : `  — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`);
}

const GIVEN = 'Paracetamol 1 g orally 14:20\nMorphine 5 mg intramuscular 14:30';

(async () => {
  console.log('formatMedicationGiven');
  check('one line per drug, parts in order',
    formatMedicationGiven([
      { name: 'paracetamol', dose: '1 g', route: 'orally', time: '14:20' },
      { name: 'Morphine', dose: '5 mg', route: 'intramuscular', time: '14:30' },
    ]), GIVEN);
  check('missing parts are skipped', formatMedicationGiven([{ name: 'Ibuprofen', dose: '', route: '', time: 'about 1 hour ago' }]), 'Ibuprofen about 1 hour ago');
  check('a drug without a name is dropped', formatMedicationGiven([{ name: '', dose: '1 g' }]), '');
  check('empty list', formatMedicationGiven([]), '');
  check('not a list', formatMedicationGiven('paracetamol'), '');
  check('absent', formatMedicationGiven(undefined), '');
  check('junk entries', formatMedicationGiven([null, 3, 'x']), '');

  console.log('medicationLines');
  check('from medicationGivenOnBoard', medicationLines({ medicationGivenOnBoard: GIVEN }),
    ['Paracetamol 1 g orally 14:20', 'Morphine 5 mg intramuscular 14:30', '', '']);
  check('typed lines win, untouched', medicationLines({ medicationGivenOnBoard: GIVEN, medications_field2: 'Typed by hand' }),
    ['', 'Typed by hand', '', '']);
  check('five drugs: the last two share line 4', medicationLines({ medicationGivenOnBoard: 'A\nB\nC\nD\nE' }),
    ['A', 'B', 'C', 'D; E']);
  check('nothing given', medicationLines({}), ['', '', '', '']);

  // A patient who takes amlodipine and was given paracetamol and morphine.
  const summary = { currentMedications: 'Amlodipine 5 mg daily.', medicationGivenOnBoard: GIVEN, exam: 'Deformed right lower leg.' };

  console.log('RMD');
  const rmd = mapSummaryToRmdFields(summary);
  check('Medicin1–4 are the drugs given', [rmd.Medicin1, rmd.medicin2, rmd.medicin3, rmd.medicin4],
    ['Paracetamol 1 g orally 14:20', 'Morphine 5 mg intramuscular 14:30', '', '']);
  check('own medicines stay in Text Field 23', rmd['Text Field 23'], 'Amlodipine 5 mg daily.');

  console.log('Norwegian');
  const no = mapSummaryToNorwegianFields(summary);
  check('premed_1–4 are the drugs given', [no.premed_1, no.premed_2, no.premed_3, no.premed_4].map((v) => v ?? ''),
    ['Paracetamol 1 g orally 14:20', 'Morphine 5 mg intramuscular 14:30', '', '']);

  console.log('German');
  const de = mapSummaryToGermanFields(summary);
  check('box 19 leads with the drugs given, then the examination',
    de['19 Bisherige Maßnahmen Treatment on board'],
    'Medication given on board: Paracetamol 1 g orally 14:20; Morphine 5 mg intramuscular 14:30\n\nPhysical examination: Deformed right lower leg.');
  check('box 19 unchanged when nothing was given',
    mapSummaryToGermanFields({ exam: 'Deformed right lower leg.' })['19 Bisherige Maßnahmen Treatment on board'],
    'Physical examination: Deformed right lower leg.');

  console.log('Marina');
  const sf = mapSummaryToSeafarerFields(summary);
  check('medication_given box', sf.medication_given, GIVEN);
  check('own medicines box unchanged', sf.medications, 'Amlodipine 5 mg daily.');
  const form = (await PDFDocument.load(fs.readFileSync('public/templates/seafarer-medical-report.pdf'))).getForm();
  let isText = false;
  try { isText = form.getField('medication_given') instanceof PDFTextField; } catch { /* missing */ }
  check('the form has a medication_given text box', isText, true);

  console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'}: ${failures} failure(s)`);
  process.exit(failures === 0 ? 0 : 1);
})();
