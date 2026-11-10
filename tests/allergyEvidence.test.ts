/**
 * Allergies must be stated as allergies in the transcript (negativeEvidence.ts).
 *
 *   - allergyStated: the quote is in the transcript and an allergy word is in
 *     it or just before it (an interview question), in any supported language.
 *   - verifyAllergies: "allergies" is built only from verified items; anything
 *     else the model wrote is dropped; "No known allergies." is left for
 *     verifyNegatives; a stated allergy outranks the negative.
 *
 * No test runner is configured; run directly:
 *     ./node_modules/.bin/tsx tests/allergyEvidence.test.ts
 * Exits non-zero on any failure.
 */
import { allergyStated, verifyAllergies } from '../src/lib/negativeEvidence.js';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : `  — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`);
}

console.log('allergyStated');
const dictation =
  'The patient is a stewardess. She is allergic to penicillin, it gives her a rash. ' +
  'And ibuprofen makes her stomach really upset.';
check('said as an allergy', allergyStated('allergic to penicillin, it gives her a rash', dictation), true);
check('punctuation and case ignored', allergyStated('Allergic to Penicillin it gives her a rash', dictation), true);
check('a side effect, never called an allergy', allergyStated('ibuprofen makes her stomach really upset', dictation), false);
check('words not in the transcript', allergyStated('allergic to latex', dictation), false);
check('a single word is not evidence', allergyStated('penicillin', dictation), false);
check('missing quote', allergyStated(undefined, dictation), false);

const interview =
  'Marina: Do you have any allergies to medicines, food or anything else? Patient: yes penicillin gives me a rash';
check('interview: the allergy word is in the question', allergyStated('penicillin gives me a rash', interview), true);

const far =
  'He has no allergies that he knows of. ' + 'He has been working on deck all week in the cold and wind. '.repeat(5) +
  'Codeine makes him drowsy.';
check('an allergy word far before does not count', allergyStated('codeine makes him drowsy', far), false);

check(
  'the allergy word in the sentence before does not vouch for the next one',
  allergyStated('ibuprofen makes her stomach really upset', 'She is allergic to penicillin. Ibuprofen makes her stomach really upset.'),
  false,
);
check(
  'a quote over two sentences, allergy word in the first',
  allergyStated(
    'allergic to shellfish his throat swells badly every time it has happened twice',
    'He is allergic to shellfish, his throat swells badly every time. It has happened twice.',
  ),
  true,
);
check(
  'interview: an answer to a question about something else',
  allergyStated(
    'codeine makes me drowsy',
    'ASSISTANT: Do you have any allergies?\n\nUSER: No.\n\nASSISTANT: Do you take any medicines?\n\nUSER: Codeine makes me drowsy.',
  ),
  false,
);
check(
  'interview: turns as the API joins them',
  allergyStated(
    'penicillin it gives me a rash',
    'ASSISTANT: Are you allergic to any medicines, food or anything else?\n\nUSER: Penicillin, it gives me a rash.',
  ),
  true,
);

check('Danish', allergyStated('allergisk over for jod', 'Han er allergisk over for jod.'), true);
check('Polish', allergyStated('uczulony na penicylinę', 'Jest uczulony na penicylinę, ma wysypkę.'), true);
check('German', allergyStated('Allergie gegen Nüsse', 'Er hat eine Allergie gegen Nüsse.'), true);
check('Russian', allergyStated('аллергия на пенициллин', 'У него аллергия на пенициллин.'), true);
check('Danish side effect', allergyStated('ondt i maven af ibuprofen', 'Hun får ondt i maven af ibuprofen.'), false);

console.log('verifyAllergies');
const run = (s: Record<string, unknown>, t: string) => (verifyAllergies(s, t), s);

check(
  'keeps the stated allergy, drops the side effect',
  run({
    allergies: '',
    allergyItems: [
      { entry: 'Penicillin — rash.', quote: 'allergic to penicillin, it gives her a rash' },
      { entry: 'Ibuprofen — stomach upset.', quote: 'ibuprofen makes her stomach really upset' },
    ],
  }, dictation),
  { allergies: 'Penicillin — rash.', allergiesEvidence: '' },
);
check(
  'text written straight into the field, without items, is dropped',
  run({ allergies: 'Penicillin — rash, mild.', allergyItems: [] }, dictation),
  { allergies: '' },
);
check(
  '"No known allergies." is left for verifyNegatives',
  run({ allergies: 'No known allergies.', allergiesEvidence: 'no allergies', allergyItems: [] }, 'He has no allergies.'),
  { allergies: 'No known allergies.', allergiesEvidence: 'no allergies' },
);
check(
  'a stated allergy outranks the negative',
  run({
    allergies: 'No known allergies.',
    allergiesEvidence: 'no allergies',
    allergyItems: [{ entry: 'Latex — itchy hands', quote: 'allergic to latex' }],
  }, 'He said no allergies at first, then remembered he is allergic to latex.'),
  { allergies: 'Latex — itchy hands.', allergiesEvidence: '' },
);
check(
  'malformed items are ignored',
  run({ allergies: '', allergyItems: [null, { quote: 'allergic to latex' }, { entry: '  ' }] }, 'allergic to latex'),
  { allergies: '' },
);
check('no allergyItems key at all', run({ allergies: '' }, dictation), { allergies: '' });

if (failures) {
  console.log(`\n${failures} FAILURE(S)`);
  process.exit(1);
}
console.log('\nALL PASS');
