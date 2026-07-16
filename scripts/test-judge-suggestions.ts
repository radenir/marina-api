// Do the exam/investigations judges now suggest a simple, specific QUESTION
// (concrete answer, ends with "?") instead of "Perform a complete …"?
//
// Run: cd marina-api && node_modules/.bin/tsx scripts/test-judge-suggestions.ts [reps]
import 'dotenv/config';
import { scorePhysicalExamination } from '../src/lib/physicalExaminationScore.js';
import { scoreInvestigations } from '../src/lib/investigationScore.js';

const REPS = parseInt(process.argv[2] ?? '3', 10);

// An instruction-style suggestion is exactly what we're stamping out.
// ("Do you/Does..." is a question auxiliary, not an imperative — only flag
// imperative "Do a/an/the ...".)
const INSTRUCTION = /^\s*(perform|assess|check|examine|order|conduct|carry out|complete|obtain|measure|test|do\s+(a|an|the)\b)/i;

const CASES = [
  {
    id: 'headache-nothing-done',   // the screenshot case: advanced neuro, empty exam
    exam: { documentation: '', pathway: 'Headache', gender: 'male', caseSummary: 'Severe headache since this morning, 7 out of 10, right side.' },
    inv: { documentation: '', pathway: 'Headache', gender: 'male', caseSummary: 'Severe headache since this morning, 7 out of 10, right side.' },
  },
  {
    id: 'abdo-partial',
    exam: { documentation: 'Abdomen soft, tender right lower side.', pathway: 'Abdominal Pain', gender: 'male', caseSummary: 'Stomach pain since yesterday, lower right side, 8/10, vomited twice.' },
    inv: { documentation: 'Blood sugar normal.', pathway: 'Abdominal Pain', gender: 'male', temperatureCelsius: '38.4', caseSummary: 'Stomach pain since yesterday, lower right side, 8/10, vomited twice. Recent travel to West Africa.' },
  },
  {
    id: 'fever-no-temp',
    exam: { documentation: '', pathway: 'Fever', gender: 'female', caseSummary: 'Feeling hot and shivery for two days.' },
    inv: { documentation: '', pathway: 'Fever', gender: 'female', caseSummary: 'Feeling hot and shivery for two days.' },
  },
];

function judgeSuggestion(kind: string, id: string, rep: number, s: string | null): boolean {
  if (!s) { console.log(`${id} ${kind} rep${rep} FAIL suggestion empty`); return false; }
  const isQuestion = s.trim().endsWith('?');
  const isInstruction = INSTRUCTION.test(s);
  const ok = isQuestion && !isInstruction;
  console.log(`${id} ${kind} rep${rep} ${ok ? 'PASS' : 'FAIL'} ${JSON.stringify(s)}`);
  return ok;
}

async function main() {
  let pass = 0, total = 0;
  for (const c of CASES) {
    for (let r = 1; r <= REPS; r++) {
      const [e, i] = await Promise.all([
        scorePhysicalExamination(c.exam as any),
        scoreInvestigations(c.inv as any),
      ]);
      total += 2;
      if (judgeSuggestion('EXAM', c.id, r, e.suggestion)) pass++;
      if (judgeSuggestion('INV ', c.id, r, i.suggestion)) pass++;
    }
    console.log('');
  }
  console.log(`RESULT: ${pass}/${total}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
