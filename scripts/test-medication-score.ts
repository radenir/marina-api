import 'dotenv/config';
import { scoreMedications } from '../src/lib/medicationScore.js';

const CASES: { label: string; medications: string }[] = [
  { label: 'empty', medications: '' },
  { label: 'not assessed', medications: 'Not assessed' },
  { label: 'none', medications: 'Patient states no current medications.' },
  { label: 'vague present', medications: 'Takes something for blood pressure.' },
  { label: 'partial', medications: 'Metformin twice a day. Also takes ibuprofen for the headache.' },
  { label: 'complete', medications: 'Metformin 500 mg twice daily for type 2 diabetes. Amlodipine 5 mg once daily for hypertension. Paracetamol 1 g as needed, taken for the current headache.' },
];

async function main() {
  for (const c of CASES) {
    const r = await scoreMedications(c.medications);
    console.log(`\n=== ${c.label} ===`);
    console.log(`scorable=${r.scorable}  score=${r.score}  status=${r.status}`);
    if (r.facets) for (const f of r.facets) console.log(`   [${f.status.padEnd(14)}] ${f.axis}`);
    if (r.suggestion) console.log(`   → suggestion: ${r.suggestion}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
