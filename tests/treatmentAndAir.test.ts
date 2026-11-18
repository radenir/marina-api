/**
 * Partner test feedback, script 01 (2026-11):
 *   - Treatment that is not a medicine ("the wrist is in a splint and we are applying
 *     a cold pack") goes in `treatment` and is printed first under performed actions.
 *   - "95 percent on room air" is "0" litres of oxygen, which M-EWS reads as Air.
 *
 * Run: ./node_modules/.bin/tsx --env-file=.env tests/treatmentAndAir.test.ts
 */
import { formatTreatmentGiven } from '../src/lib/medicalExtractV2.js';
import { mewsForSummary, oxygenRequirement } from '../src/lib/mewsCalculator.js';
import { mapSummaryToNorwegianFields } from '../src/lib/norwegianMapper.js';
import { mapSummaryToRmdFields } from '../src/lib/rmdMapper.js';
import { roomAirStated } from '../src/lib/negativeEvidence.js';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : `  — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`);
}

console.log('formatTreatmentGiven');
check('script 01', formatTreatmentGiven(['Splint on the right wrist', 'cold pack applied.']), 'Splint on the right wrist. Cold pack applied.');
check('the same phrase twice', formatTreatmentGiven(['Cold pack applied', 'Cold pack applied']), 'Cold pack applied.');
check('nothing done', formatTreatmentGiven([]), '');
check('not a list', formatTreatmentGiven('Splint'), '');
check('blanks and non-strings ignored', formatTreatmentGiven([' ', null, 3, 'Arm in a sling']), 'Arm in a sling.');

console.log('oxygenRequirement');
check('"0" is air (room air)', oxygenRequirement('0'), 'air');
check('"4" is oxygen', oxygenRequirement('4'), 'oxygen');
check('"2,5" is oxygen', oxygenRequirement('2,5'), 'oxygen');
check('empty is not known', oxygenRequirement(''), null);
check('missing is not known', oxygenRequirement(undefined), null);
check('text is not known', oxygenRequirement('some'), null);

console.log('roomAirStated');
const t01 = 'OFFICER: Oxygen saturation is 95 percent on room air. Pulse is 104, regular.';
check('script 01: "on room air"', roomAirStated('95 percent on room air', t01), true);
check('a saturation alone says nothing about air', roomAirStated('Oxygen saturation is 95 percent', 'OFFICER: Oxygen saturation is 95 percent.'), false);
check('"no oxygen given"', roomAirStated('we have not given any oxygen', 'USER: We have not given any oxygen.'), true);
check('words not in the transcript', roomAirStated('on room air', 'OFFICER: Saturation 95.'), false);
check('Danish "atmosfærisk luft"', roomAirStated('95 procent på atmosfærisk luft', 'Saturationen er 95 procent på atmosfærisk luft.'), true);
check('Norwegian "romluft"', roomAirStated('95 prosent på romluft', 'Metning 95 prosent på romluft.'), true);
check('Polish "bez tlenu"', roomAirStated('saturacja 95 bez tlenu', 'Saturacja 95 bez tlenu.'), true);
check('"repair" is not air', roomAirStated('during the repair work', 'He was hurt during the repair work.'), false);

console.log('Radio Medical Record (script 01)');
const script01 = {
  breathing_num_breaths_per_min: '22', breathing_oxygen_saturation: '95', airway_admin_oxygen_liters_per_min: '0',
  circulation_systole: '105', circulation_pulse_per_min: '104', avpu: 'Voice',
  treatment: 'Splint on the right wrist. Cold pack applied.',
  exam: 'Swelling and tenderness over the right wrist.',
};
const nor = mapSummaryToNorwegianFields(script01);
check('air/oxygen row says Air', nor.ews_o2_value, 'Air');
check('Air scores 0 points', nor.ews_o2_points, '0');
check('total unchanged by air (2+1+0+1+1+3)', nor.ews_total, '8');
check('temperature still missing, so incomplete', nor.ews_status, { value: true, onValue: 'incomplete' });
check('section A prints 0 litres', nor.oxygen_lpm, '0');
check('performed actions: treatment first, then the examination',
  nor.performed_actions,
  'Treatment: Splint on the right wrist. Cold pack applied.\n\nPhysical examination: Swelling and tenderness over the right wrist.');
const withTemp = mapSummaryToNorwegianFields({ ...script01, expose_temperature_measured_mouth: '37' });
check('with a temperature, every value is there: complete', withTemp.ews_status, { value: true, onValue: 'complete' });
const onO2 = mapSummaryToNorwegianFields({ ...script01, airway_admin_oxygen_liters_per_min: '4' });
check('4 litres: Oxygen, 3 points on this form', [onO2.ews_o2_value, onO2.ews_o2_points], ['Oxygen', '3']);
const notSaid = mapSummaryToNorwegianFields({ ...script01, airway_admin_oxygen_liters_per_min: '' });
check('oxygen not mentioned: row left empty', [notSaid.ews_o2_value, notSaid.ews_o2_points], [undefined, undefined]);

console.log('RMD and the M-EWS on the report');
const rmd = mapSummaryToRmdFields(script01);
check('RMD performed actions carry the treatment', String(rmd['Text Field 41']).includes('Treatment: Splint on the right wrist. Cold pack applied.'), true);
check('M-EWS on the report: room air adds nothing', mewsForSummary(script01), 8);
check('M-EWS on the report: oxygen given now counts (2)', mewsForSummary({ ...script01, airway_admin_oxygen_liters_per_min: '4' }), 10);

if (failures) {
  console.log(`\n${failures} FAILURE(S)`);
  process.exit(1);
}
console.log('\nALL PASS');
