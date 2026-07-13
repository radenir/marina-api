import 'dotenv/config';
import { scoreInvestigations } from '../src/lib/investigationScore.js';

// Abdominal Pain investigations (all conditional):
//  CRP if temp≥38 · Urine if kidney pain · Pregnancy if female 12–55 ·
//  Malaria if fever+travel · Blood sugar if diabetic
const CASES: { label: string; input: Parameters<typeof scoreInvestigations>[0] }[] = [
  {
    label: 'febrile female, only CRP done',
    input: {
      pathway: 'Abdominal Pain',
      documentation: 'CRP raised at 45.',
      temperatureCelsius: '38.5', gender: 'female', age: 30,
      caseSummary: 'Abdominal pain, no recent travel, not diabetic, no kidney-area pain.',
    },
  },
  {
    label: 'afebrile male → nothing indicated',
    input: {
      pathway: 'Abdominal Pain',
      documentation: '',
      temperatureCelsius: '37', gender: 'male', age: 40,
      caseSummary: 'Abdominal pain, no travel, not diabetic.',
    },
  },
  {
    label: 'febrile female + travel, all done',
    input: {
      pathway: 'Abdominal Pain',
      documentation: 'CRP raised. Pregnancy test negative. Malaria test negative.',
      temperatureCelsius: '39', gender: 'female', age: 30,
      caseSummary: 'Abdominal pain with fever, travelled to Nigeria two weeks ago.',
    },
  },
  {
    label: 'unknown symptom',
    input: { documentation: 'Some notes with no clear complaint.' },
  },
];

async function main() {
  for (const c of CASES) {
    const r = await scoreInvestigations(c.input);
    console.log(`\n=== ${c.label} ===`);
    console.log(`scorable=${r.scorable}  score=${r.score}  pathway=${r.pathway ?? '-'}  required=${r.required}`);
    if (r.facets) for (const f of r.facets) console.log(`   ${f.applicable ? '[' + f.status.padEnd(9) + ']' : '[   n/a   ]'} ${f.investigation}`);
    if (r.suggestion) console.log(`   → suggestion: ${r.suggestion}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
