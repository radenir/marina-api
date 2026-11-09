// /v2/ai/revise-field: new dictation that contradicts the current text must
// replace it, not sit next to it ("No known allergies. Allergic to latex.").
// Additions that do NOT contradict must still keep every old word.
// Runs the REAL reviseField against the model.
//
// Run: cd marina-api && node_modules/.bin/tsx scripts/test-revise-contradiction.ts [reps]
import 'dotenv/config';
import { reviseField, type RevisableField } from '../src/lib/reviseField.js';

const REPS = parseInt(process.argv[2] ?? '3', 10);

const CASES: Array<{
  id: string; field: RevisableField; current: string; instruction: string; want: RegExp[]; forbid?: RegExp[];
}> = [
  // Contradictions — the old statement must go.
  { id: 'nka-then-latex', field: 'allergies', current: 'No known allergies.',
    instruction: 'He is also allergic to latex, it gives a rash.',
    want: [/latex/i, /rash/i], forbid: [/no known allergies/i] },
  { id: 'no-meds-then-drug', field: 'currentMedications', current: 'No medications.',
    instruction: 'Actually he takes metformin 500 milligrams twice a day.',
    want: [/metformin\s500\smg/i], forbid: [/no medications/i] },
  { id: 'denied-then-present', field: 'associatedSymptoms', current: 'Nausea; no vomiting; no fever.',
    instruction: 'He vomited twice this morning.',
    want: [/nausea/i, /vomit/i, /twice/i, /no fever/i], forbid: [/no vomiting/i] },
  { id: 'nka-norwegian', field: 'allergies', current: 'No known allergies.',
    instruction: 'Han er allergisk mot penicillin, får utslett.',
    want: [/penicillin/i, /rash/i], forbid: [/no known allergies/i] },
  // Non-contradicting additions — everything old survives.
  { id: 'allergy-plus-allergy', field: 'allergies', current: 'Penicillin (rash).',
    instruction: 'He is also allergic to latex.',
    want: [/Penicillin \(rash\)/, /latex/i] },
  { id: 'symptom-plus-symptom', field: 'associatedSymptoms', current: 'Nausea; no vomiting; no fever.',
    instruction: 'He also has a headache.',
    want: [/nausea/i, /no vomiting/i, /no fever/i, /headache/i] },
  { id: 'hedge-kept', field: 'allergies', current: 'No known allergies.',
    instruction: 'Not sure, but he thinks he might react to latex.',
    want: [/latex/i, /(possibl|might|may|uncertain|not sure|unsure|thinks)/i], forbid: [/no known allergies/i] },
];

(async () => {
  let fails = 0;
  for (const c of CASES) {
    for (let r = 1; r <= REPS; r++) {
      const res = await reviseField({ field: c.field, currentText: c.current, instruction: c.instruction });
      const t = res.revisedText;
      const bad = [
        ...c.want.filter((re) => !re.test(t)).map((re) => `missing ${re}`),
        ...(c.forbid ?? []).filter((re) => re.test(t)).map((re) => `has ${re}`),
      ];
      if (bad.length) fails++;
      console.log(`${bad.length ? 'FAIL' : ' ok '} ${c.id} #${r}  ${JSON.stringify(t)}${bad.length ? '  ← ' + bad.join(', ') : ''}`);
    }
  }
  console.log(`\n${fails} failing run(s) of ${CASES.length * REPS}`);
  process.exit(fails ? 1 : 0);
})();
