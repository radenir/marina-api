import 'dotenv/config';
import { scoreProblemDescription } from '../src/lib/problemScore.js';

const CASES: { label: string; chiefComplaint?: string; problemDescription: string }[] = [
  { label: 'empty', problemDescription: '' },
  { label: 'vague / low', chiefComplaint: 'Stomach pain', problemDescription: 'Patient reports abdominal pain.' },
  {
    label: 'rich abdominal pain',
    chiefComplaint: 'Abdominal pain',
    problemDescription:
      'Male ~40. Sharp, colicky right-upper-quadrant abdominal pain radiating to the back, sudden onset about 2 hours ago after a fatty meal. Rated 8/10, coming in waves lasting ~10 min, worse on movement and better sitting still. No previous similar episodes. No recent travel. Ate reheated fish last night.',
  },
  {
    label: 'chest pain (different rubric)',
    chiefComplaint: 'Chest pain',
    problemDescription:
      'Crushing central chest pain radiating to the left arm, started 40 minutes ago while climbing stairs, 7/10, associated with sweating. Eases slightly at rest.',
  },
];

async function main() {
  for (const c of CASES) {
    const r = await scoreProblemDescription({ chiefComplaint: c.chiefComplaint, problemDescription: c.problemDescription });
    console.log(`\n=== ${c.label} ===`);
    console.log(`scorable=${r.scorable}  score=${r.score}  pathway=${r.pathway ?? '-'}`);
    if (r.facets) {
      for (const f of r.facets) console.log(`   [${f.status.padEnd(14)}] ${f.axis}`);
    }
    if (r.suggestion) console.log(`   → suggestion: ${r.suggestion}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
