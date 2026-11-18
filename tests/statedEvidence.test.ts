/**
 * Associated symptoms and past medical history must be stated in the transcript
 * (negativeEvidence.ts: statementStated, verifyStatedFields).
 *
 *   - statementStated: the quote is in the transcript (role labels ignored) and
 *     a denial's quote contains a negation word, in any supported language.
 *   - verifyStatedFields: each field is built only from backed statements; text
 *     the model wrote straight into the field is dropped; the item lists never
 *     reach the report.
 *
 * The case that started it (2026-11-18): a Headache dictation that said nothing
 * but the headache came back with the pathway's whole checklist denied and
 * "Hypertension." as past history.
 *
 * No test runner is configured; run directly:
 *     ./node_modules/.bin/tsx tests/statedEvidence.test.ts
 * Exits non-zero on any failure.
 */
import { hasNegation, isDenialEntry, statementStated, verifyNegatives, verifyStatedFields } from '../src/lib/negativeEvidence.js';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : `  — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`);
}

console.log('hasNegation');
check('English "no"', hasNegation('no fever'), true);
check('"no" is a whole word, not inside "nose"', hasNegation('his nose is running'), false);
check('Polish', hasNegation('nie ma gorączki'), true);
check('Polish "tak" is yes, not a negation', hasNegation('tak, ma gorączkę'), false);
check('Danish', hasNegation('han har ikke feber'), true);
check('German', hasNegation('kein Fieber'), true);
check('Russian', hasNegation('температуры нет'), true);
check('Chinese', hasNegation('没有发烧'), true);
check('no negation', hasNegation('he threw up twice'), false);
check('"haven\'t" (script 01)', hasNegation("I haven't vomited."), true);
check('"doesn\'t" with a curly apostrophe', hasNegation('he doesn’t have a fever'), true);
check('"it\'s" is not a negation', hasNegation("it's sore"), false);
check('not a string', hasNegation(undefined), false);

console.log('isDenialEntry');
check('"Denies fever."', isDenialEntry('Denies fever.'), true);
check('"No previous surgery."', isDenialEntry('No previous surgery.'), true);
check('"Reports nausea."', isDenialEntry('Reports nausea.'), false);
check('"Hypertension."', isDenialEntry('Hypertension.'), false);

console.log('statementStated');
const headache =
  'USER: The patient reports a headache that began yesterday. He rates it eight out of ten.';
check('a denial with no "no" anywhere in the transcript', statementStated('Denies fever.', 'no fever', headache), false);
check('a past condition never mentioned', statementStated('Hypertension.', 'high blood pressure', headache), false);
check('a quote that is not in the transcript', statementStated('Reports nausea.', 'he feels sick', headache), false);
check('a single word is not evidence', statementStated('Reports headache.', 'headache', headache), false);

const dictation =
  'USER: He has had a headache since yesterday, eight out of ten. He also feels sick and threw up once. No fever. ' +
  'He has high blood pressure and takes tablets for it. Never had an operation.';
check('a present symptom, quoted', statementStated('Reports nausea and one episode of vomiting.', 'he also feels sick and threw up once', dictation), true);
check('a denial, quoted with its "no"', statementStated('Denies fever.', 'No fever', dictation), true);
check('a denial quoted without its "no"', statementStated('Denies fever.', 'eight out of ten', dictation), false);
check('a present condition, quoted', statementStated('High blood pressure, takes tablets for it.', 'he has high blood pressure and takes tablets for it', dictation), true);
check('a past-history denial, quoted', statementStated('No previous surgery.', 'never had an operation', dictation), true);

const interview =
  'ASSISTANT: Do you have a fever?\n\nUSER: No.\n\nASSISTANT: Any nausea or vomiting?\n\nUSER: Yes, I threw up this morning.';
check('interview: question and "no" answer quoted together', statementStated('Denies fever.', 'Do you have a fever? No.', interview), true);
check('interview: a "yes" answer is not a denial', statementStated('Denies nausea and vomiting.', 'Any nausea or vomiting? Yes', interview), false);
check('interview: the answer quoted alone', statementStated('Reports vomiting.', 'I threw up this morning', interview), true);
check('interview: role labels inline', statementStated('Denies fever.', 'Any fever? No', 'Marina: Any fever? Patient: No.'), true);

// The limit of the check: the quote must be real, but its meaning is not
// compared with the entry. A present condition backed by an unrelated real
// sentence passes. Denials are safer: their quote must at least say "no".
check(
  'LIMIT: a present condition with a real but unrelated quote passes',
  statementStated('Hypertension.', 'the patient reports a headache', headache),
  true,
);

check('Polish denial', statementStated('Denies fever.', 'nie ma gorączki', 'USER: Pacjent nie ma gorączki, boli go głowa.'), true);
check('Polish symptom without a "no" cannot be a denial', statementStated('Denies fever.', 'boli go głowa', 'USER: Pacjent nie ma gorączki, boli go głowa.'), false);

console.log('verifyStatedFields');
const run = (s: Record<string, unknown>, t: string) => (verifyStatedFields(s, t), s);

check(
  'the headache case: the invented checklist and history are dropped',
  run({
    associatedSymptoms: '',
    associatedSymptomItems: [
      { entry: 'Denies fever.', quote: 'no fever' },
      { entry: 'Denies nausea and vomiting.', quote: 'no nausea or vomiting' },
      { entry: 'Denies visual disturbances.', quote: '' },
      { entry: 'Denies neck stiffness.' },
      { entry: 'Denies confusion.', quote: 'eight out of ten' },
      { entry: 'Denies weakness.', quote: 'began yesterday' },
    ],
    pastHistory: '',
    pastHistoryItems: [{ entry: 'Hypertension.', quote: 'high blood pressure' }],
  }, headache),
  { associatedSymptoms: '', pastHistory: '' },
);
check(
  'keeps what was said, drops what was not',
  run({
    associatedSymptoms: '',
    associatedSymptomItems: [
      { entry: 'Reports nausea and one episode of vomiting.', quote: 'he also feels sick and threw up once' },
      { entry: 'Denies fever.', quote: 'No fever.' },
      { entry: 'Denies neck stiffness.', quote: 'no neck stiffness' },
    ],
    pastHistory: '',
    pastHistoryItems: [
      { entry: 'High blood pressure, takes tablets for it', quote: 'has high blood pressure and takes tablets for it' },
      { entry: 'No previous surgery.', quote: 'Never had an operation' },
      { entry: 'Denies migraine.', quote: 'no migraine' },
    ],
  }, dictation),
  {
    associatedSymptoms: 'Reports nausea and one episode of vomiting. Denies fever.',
    pastHistory: 'High blood pressure, takes tablets for it. No previous surgery.',
  },
);
check(
  'text written straight into the field, without items, is dropped',
  run({ associatedSymptoms: 'Denies fever. Denies weakness.', pastHistory: 'Hypertension.' }, headache),
  { associatedSymptoms: '', pastHistory: '' },
);
check(
  'the same statement twice is written once',
  run({
    associatedSymptomItems: [
      { entry: 'Denies fever.', quote: 'no fever' },
      { entry: 'Denies fever', quote: 'No fever.' },
    ],
  }, dictation),
  { associatedSymptoms: 'Denies fever.', pastHistory: '' },
);
check(
  'malformed items are ignored',
  run({ associatedSymptomItems: [null, { quote: 'no fever' }, { entry: '  ' }], pastHistoryItems: 'Hypertension' }, dictation),
  { associatedSymptoms: '', pastHistory: '' },
);

console.log('verifyNegatives: an empty field restored from its own evidence');
const script01 = 'PATIENT: No regular medicines, and no known allergies.';
const neg = (s: Record<string, string | boolean>, t: string) => (verifyNegatives(s, t), s);
check(
  'script 01: both fields empty, evidence given (gpt-oss, 1 in 8 runs)',
  neg({ allergies: '', allergiesEvidence: 'no known allergies', currentMedications: '', currentMedicationsEvidence: 'No regular medicines' }, script01),
  { allergies: 'No known allergies.', currentMedications: 'No regular medications.' },
);
check(
  'the "no" belongs to the medicines, not to the allergy',
  neg({ allergies: '', allergiesEvidence: 'No regular medicines, he is allergic to penicillin' }, 'USER: No regular medicines, he is allergic to penicillin.'),
  { allergies: '' },
);
check(
  'evidence not in the transcript restores nothing',
  neg({ allergies: '', allergiesEvidence: 'no allergies' }, 'USER: He has a headache.'),
  { allergies: '' },
);
check(
  'evidence about allergies cannot restore the medicines',
  neg({ currentMedications: '', currentMedicationsEvidence: 'no known allergies' }, script01),
  { currentMedications: '' },
);
check(
  'a field with text is left alone',
  neg({ currentMedications: 'Metformin twice daily.', currentMedicationsEvidence: 'No regular medicines' }, script01),
  { currentMedications: 'Metformin twice daily.' },
);

if (failures) {
  console.log(`\n${failures} FAILURE(S)`);
  process.exit(1);
}
console.log('\nALL PASS');
