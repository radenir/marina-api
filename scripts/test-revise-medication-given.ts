// Voice editing of medicationGivenOnBoard: /v2/ai/revise-field on the new
// field. Runs the REAL reviseField against the model.
//
// Run: cd marina-api && node_modules/.bin/tsx scripts/test-revise-medication-given.ts [reps]
import 'dotenv/config';
import { reviseField } from '../src/lib/reviseField.js';

const REPS = parseInt(process.argv[2] ?? '3', 10);
const BASE = 'Paracetamol 1 g orally 14:20\nMorphine 5 mg intramuscular 14:30';

const CASES: Array<{ id: string; current: string; instruction: string; want: RegExp[]; forbid?: RegExp[] }> = [
  { id: 'add-drug', current: BASE, instruction: 'At 15:00 we also gave ondansetron 4 milligrams intravenously.',
    want: [/Paracetamol 1 g orally 14:20/, /Morphine 5 mg intramuscular 14:30/, /Ondansetron 4 mg intravenous\w* 15:00/i] },
  { id: 'correct-dose', current: BASE, instruction: 'The morphine was 10 milligrams, not 5.',
    want: [/Paracetamol 1 g orally 14:20/, /Morphine 10 mg intramuscular 14:30/], forbid: [/5 mg/] },
  { id: 'remove-drug', current: BASE, instruction: 'Remove the morphine, we did not give it after all.',
    want: [/Paracetamol 1 g orally 14:20/], forbid: [/morphine/i] },
  { id: 'from-empty', current: '', instruction: 'We gave two puffs of salbutamol at 09:10.',
    want: [/Salbutamol 2 puffs .*09:10/i] },
  { id: 'keeps-what-officer-says', current: BASE, instruction: 'Also note we gave oxygen 4 litres per minute.',
    want: [/Paracetamol/, /Morphine/, /oxygen/i] },
];

(async () => {
  let fails = 0;
  for (const c of CASES) {
    for (let r = 1; r <= REPS; r++) {
      const res = await reviseField({ field: 'medicationGivenOnBoard', currentText: c.current, instruction: c.instruction });
      const t = res.revisedText;
      const bad = [...c.want.filter((re) => !re.test(t)).map((re) => `missing ${re}`), ...(c.forbid ?? []).filter((re) => re.test(t)).map((re) => `has ${re}`)];
      if (bad.length) fails++;
      console.log(`${bad.length ? 'FAIL' : ' ok '} ${c.id} #${r}  ${JSON.stringify(t)}${bad.length ? '  ← ' + bad.join(', ') : ''}`);
    }
  }
  console.log(`\n${fails} failing run(s) of ${CASES.length * REPS}`);
  process.exit(fails ? 1 : 0);
})();
