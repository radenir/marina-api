import 'dotenv/config';
import { scoreAllergies } from '../src/lib/allergyScore.js';

const CASES: { label: string; allergies: string }[] = [
  { label: 'empty', allergies: '' },
  { label: 'not assessed', allergies: 'Not assessed' },
  { label: 'NKDA', allergies: 'No known allergies' },
  { label: 'vague present', allergies: 'Allergic to some antibiotics.' },
  { label: 'partial', allergies: 'Penicillin — causes a rash. Also allergic to shellfish.' },
  { label: 'complete', allergies: 'Penicillin (medication) — severe anaphylaxis requiring adrenaline, has happened twice. Peanuts (food) — mild hives, recurs each exposure.' },
];

async function main() {
  for (const c of CASES) {
    const r = await scoreAllergies(c.allergies);
    console.log(`\n=== ${c.label} ===`);
    console.log(`scorable=${r.scorable}  score=${r.score}  status=${r.status}`);
    if (r.facets) for (const f of r.facets) console.log(`   [${f.status.padEnd(14)}] ${f.axis}`);
    if (r.suggestion) console.log(`   → suggestion: ${r.suggestion}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
