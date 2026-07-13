import 'dotenv/config';
import { scorePastMedicalHistory } from '../src/lib/pastMedicalHistoryScore.js';

// Abdominal Pain PMH: prior abdominal surgeries; known GI/renal/gyn/urologic/
// vascular conditions; pregnancy status (previous pregnancies, current birth control).
const CASES: { label: string; pastMedicalHistory: string; pathway?: string }[] = [
  { label: 'empty', pastMedicalHistory: '', pathway: 'Abdominal Pain' },
  { label: 'not assessed', pastMedicalHistory: 'Not assessed', pathway: 'Abdominal Pain' },
  { label: 'vague', pastMedicalHistory: 'Some stomach problems in the past.', pathway: 'Abdominal Pain' },
  { label: 'positives + negatives (male)', pastMedicalHistory: 'Prior appendectomy in 2015. Denies any kidney, liver or vascular disease. Male patient.', pathway: 'Abdominal Pain' },
  { label: 'full (female)', pastMedicalHistory: 'No previous abdominal surgery. Denies GI, renal, gynaecological, urological or vascular conditions. Two prior pregnancies, currently on oral contraception.', pathway: 'Abdominal Pain' },
];

async function main() {
  for (const c of CASES) {
    const r = await scorePastMedicalHistory(c);
    console.log(`\n=== ${c.label} ===`);
    console.log(`scorable=${r.scorable}  score=${r.score}  pathway=${r.pathway ?? '-'}`);
    if (r.facets) for (const f of r.facets) console.log(`   [${f.status.padEnd(14)}] ${f.axis}`);
    if (r.suggestion) console.log(`   → suggestion: ${r.suggestion}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
