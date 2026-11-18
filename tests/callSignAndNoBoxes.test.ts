/**
 * Partner test feedback, script 01 (2026-11):
 *   - normalizeCallSign: a call sign spelled in the radio alphabet is written as the code.
 *   - noMedicines / noAllergies: the forms' "No" boxes are ticked from the negative text
 *     the v2 extract writes, on the RMD and the Radio Medical Record (Norwegian) forms.
 *
 * Run: ./node_modules/.bin/tsx --env-file=.env tests/callSignAndNoBoxes.test.ts
 */
import { normalizeCallSign } from '../src/lib/callSign.js';
import { noAllergies, noMedicines, mapSummaryToRmdFields } from '../src/lib/rmdMapper.js';
import { mapSummaryToNorwegianFields } from '../src/lib/norwegianMapper.js';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : `  — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`);
}

console.log('normalizeCallSign');
check('radio alphabet', normalizeCallSign('Lima X-ray Tango Victor Niner'), 'LXTV9');
check('"X ray" with a space, commas', normalizeCallSign('Lima, X ray, Tango, Victor, Niner'), 'LXTV9');
check('words and a digit', normalizeCallSign('Lima Xray Tango Victor 9'), 'LXTV9');
check('spelled letters', normalizeCallSign('L X T V 9'), 'LXTV9');
check('radio numbers', normalizeCallSign('Oscar Zulu Tree Fife'), 'OZ35');
check('already a code', normalizeCallSign('LXTV9'), 'LXTV9');
check('a name is left alone', normalizeCallSign('Victor'), 'Victor');
check('a sentence is left alone', normalizeCallSign('call sign unknown'), 'call sign unknown');
check('one spelling word is not a call sign', normalizeCallSign('Lima'), 'Lima');
check('empty', normalizeCallSign(''), '');
check('not a string', normalizeCallSign(undefined), '');

console.log('noMedicines / noAllergies');
check('"No regular medications."', noMedicines({ currentMedications: 'No regular medications.' }), true);
check('"No known allergies."', noAllergies({ allergies: 'No known allergies.' }), true);
check('the old flag still counts', noAllergies({ no_allergies: true }), true);
check('a medicine is not "No"', noMedicines({ currentMedications: 'Metformin twice daily.' }), false);
check('an allergy is not "No"', noAllergies({ allergies: 'Penicillin — rash.' }), false);
check('"No known allergies" with more text is not ticked', noAllergies({ allergies: 'No known allergies. Latex makes him itch.' }), false);
check('empty is not "No"', noMedicines({ currentMedications: '' }), false);

console.log('forms');
const summary = { currentMedications: 'No regular medications.', allergies: 'No known allergies.' };
const nor = mapSummaryToNorwegianFields(summary);
check('Radio Medical Record: medicines "No"', nor.medicines_status, { value: true, onValue: 'no' });
check('Radio Medical Record: allergies "No"', nor.allergies_status, { value: true, onValue: 'no' });
const rmd = mapSummaryToRmdFields(summary);
check('RMD: medicines "No"', rmd['Check Box 1789'], true);
check('RMD: allergies "No"', rmd['Check Box 1791'], true);
const none = mapSummaryToNorwegianFields({ allergies: 'Penicillin — rash.' });
check('Radio Medical Record: an allergy leaves "No" unticked', none.allergies_status, undefined);

if (failures) {
  console.log(`\n${failures} FAILURE(S)`);
  process.exit(1);
}
console.log('\nALL PASS');
