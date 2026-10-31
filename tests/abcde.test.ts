/**
 * The A–E (ABCDE) assessment: from the two v2 extract batches' plain answers
 * (abcdeFields in src/lib/medicalExtractV2.ts) to the boxes of the Norwegian
 * and RMD forms.
 *
 * The rule under test: a box is ticked only on an unambiguous answer. Empty,
 * junk, unknown words and contradictions tick nothing.
 *
 * No test runner is configured; run directly:
 *     ./node_modules/.bin/tsx --env-file=.env tests/abcde.test.ts
 * Exits non-zero on any failure.
 */
import { abcdeFields, abcdeAnswersFromFields, ABCDE_FIELD_KEYS } from '../src/lib/medicalExtractV2.js';
import { completeAbcde } from '../src/lib/reviseAbcde.js';
import { mapSummaryToNorwegianFields } from '../src/lib/norwegianMapper.js';
import { mapSummaryToRmdFields } from '../src/lib/rmdMapper.js';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : `  — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`);
}

// What the batches answer for the partner's dictation (fall from a ladder).
const AB = {
  airwayClear: 'yes', airwayManoeuvres: [], cprStartedAt: '', oxygenLitresPerMin: '4',
  neckBackInjurySuspected: 'yes', neckCollarFitted: 'yes', breathingPattern: ['fast', 'shallow'], breathingOther: '',
};
const CDE = {
  capillaryRefillSeconds: '3', skinColour: 'pale', skinFeel: 'cold and sweaty', pulseMeasuredAt: 'wrist',
  convulsions: 'no', paralysis: 'no', pupilsNormal: 'yes', pupilsDescription: '',
  topToToeDone: 'yes', topToToeFindings: 'deformed right lower leg, possible fracture',
  hypothermiaOrOverheating: 'no', hypothermiaOrOverheatingFindings: '', temperatureMeasuredAt: 'mouth',
};

console.log('abcdeFields: a full dictation');
const f = abcdeFields(AB, CDE, '36.4');
check('every field', f, {
  checkbox_airway_clear_yes: true,
  airway_admin_oxygen_liters_per_min: '4',
  checkbox_airway_neck_back_injury_yes: true,
  checkbox_airway_fitted_neck_collar_yes: true,
  checkbox_breathing_fast: true,
  checkbox_breathing_shallow: true,
  circulation_capillary_response: '3',
  circulation_skin_colour: 'pale',
  circulation_skin_temp_and_humidity: 'cold and sweaty',
  checkbox_circulation_temp_wrist: true,
  checkbox_disability_convulsions_no: true,
  checkbox_disability_paralysis_no: true,
  checkbox_disability_pupils_normal_yes: true,
  expose_top_to_toe_examination_performed_yes: true,
  expose_top_to_toe_examination_description: 'deformed right lower leg, possible fracture',
  expose_hypothermia_overheating_performed_no: true,
  expose_temperature_performed_yes: true,
  expose_temperature_measured_place: 'mouth',
});

console.log('abcdeFields: nothing said, nothing ticked');
check('empty answers', abcdeFields({ airwayClear: '', breathingPattern: [] }, { convulsions: '' }), {});
check('missing batches', abcdeFields(undefined, undefined), {});
check('batches that are not objects', abcdeFields('yes', 42), {});

console.log('abcdeFields: only unambiguous answers tick a box');
check('"Yes"/"NO" in any case', abcdeFields({ airwayClear: 'Yes' }, { paralysis: 'NO' }),
  { checkbox_airway_clear_yes: true, checkbox_disability_paralysis_no: true });
check('"maybe", "unknown", booleans → nothing', abcdeFields({ airwayClear: 'maybe', neckCollarFitted: true }, { convulsions: 'unknown' }), {});
check('unknown list words dropped', abcdeFields({ airwayManoeuvres: ['jaw lift', 'intubation'], breathingPattern: ['laboured'] }, {}),
  { checkbox_airway_jaw_lift: true });
check('all three airway manoeuvres', abcdeFields({ airwayManoeuvres: ['Jaw lift', 'suction', 'Guedel airway'] }, {}),
  { checkbox_airway_jaw_lift: true, checkbox_airway_suction: true, checkbox_airway_guedal: true });
check('"normal" next to "fast": fast stands, normal goes', abcdeFields({ breathingPattern: ['normal', 'fast'] }, {}),
  { checkbox_breathing_fast: true });
check('"normal" alone', abcdeFields({ breathingPattern: ['normal'] }, {}), { checkbox_breathing_normal: true });
check('numbers must be numbers', abcdeFields({ oxygenLitresPerMin: 'a lot', cprStartedAt: 'just now' }, { capillaryRefillSeconds: '2-3' }), {});
check('CPR time hh:mm kept', abcdeFields({ cprStartedAt: '14:05' }, {}), { airway_cpr_start: '14:05' });
check('unknown skin colour / pulse site dropped', abcdeFields({}, { skinColour: 'grey', pulseMeasuredAt: 'ankle' }), {});
check('no temperature, no "measured" tick', abcdeFields({}, { temperatureMeasuredAt: '' }, ''), {});

console.log('round trip: fields → answers → fields (voice editing must not move anything untouched)');
{
  const full = completeAbcde(f);
  check('the partner case survives unchanged', completeAbcde(abcdeFields(abcdeAnswersFromFields(full), abcdeAnswersFromFields(full), '')), full);
  // Every box and text field on its own, so none is lost on the way.
  for (const key of ABCDE_FIELD_KEYS) {
    const one = completeAbcde({ [key]: key.startsWith('checkbox_') || key.includes('_performed_') ? true : key === 'circulation_skin_colour' ? 'pale' : key.includes('cpr') ? '10:42' : /oxygen|capillary/.test(key) ? '4' : 'x' });
    const back = completeAbcde(abcdeFields(abcdeAnswersFromFields(one), abcdeAnswersFromFields(one), ''));
    if (JSON.stringify(back) !== JSON.stringify(one)) check(`round trip of ${key}`, back, one);
  }
  check('all ' + ABCDE_FIELD_KEYS.length + ' fields round-trip', true, true);
}

console.log('Norwegian form');
const no = mapSummaryToNorwegianFields({ ...f, expose_temperature_measured_mouth: '36.4' });
const radio = (v: unknown) => (v && typeof v === 'object' ? (v as { onValue: string }).onValue : v);
check('A: airway clear, neck injury, collar', [radio(no.airway_clear), radio(no.neck_injury_suspected), radio(no.neck_collar)], ['yes', 'yes', 'yes']);
check('A: oxygen litres', no.oxygen_lpm, '4');
check('B: fast and shallow, not normal', [no.breath_fast, no.breath_shallow, no.breath_normal ?? false], [true, true, false]);
check('C: capillary, skin colour, skin feel, pulse site', [no.cap_refill, radio(no.skin_colour), no.skin_feel, radio(no.pulse_site)], ['3', 'pale', 'cold and sweaty', 'wrist']);
check('D: convulsions no, paralysis no, pupils normal', [radio(no.convulsions), radio(no.paralysis), radio(no.pupils_normal)], ['no', 'no', 'yes']);
check('E: top to toe yes + findings', [radio(no.top_to_toe), no.top_to_toe_findings], ['yes', 'deformed right lower leg, possible fracture']);
check('E: no hypothermia, temperature measured in the mouth', [radio(no.temp_disorder), radio(no.temp_measured), no.temp_site], ['no', 'yes', 'mouth']);

console.log('RMD form');
const rmd = mapSummaryToRmdFields({ ...f, expose_temperature_measured_mouth: '36.4' });
const filled = Object.entries(rmd).filter(([, v]) => v === true || (v && typeof v === 'object' && (v as { value?: unknown }).value === true)).length;
check('ticks reach the RMD form too', filled >= 10, true);

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'}: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
