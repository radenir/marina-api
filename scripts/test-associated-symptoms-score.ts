import 'dotenv/config';
import { scoreAssociatedSymptoms } from '../src/lib/associatedSymptomsScore.js';

// Abdominal Pain associated symptoms: nausea/vomiting, diarrhea/constipation,
// fever/chills, hematemesis/melena, dysuria, vaginal bleeding [if female].
const CASES: { label: string; associatedSymptoms: string; chiefComplaint?: string; pathway?: string }[] = [
  { label: 'empty', associatedSymptoms: '', pathway: 'Abdominal Pain' },
  { label: 'not assessed', associatedSymptoms: 'Not assessed', pathway: 'Abdominal Pain' },
  { label: 'positives only', associatedSymptoms: 'Reports nausea and vomiting.', pathway: 'Abdominal Pain' },
  { label: 'positives + negatives (male)', associatedSymptoms: 'Reports nausea and vomiting. Denies fever, diarrhea, blood in stool and painful urination. Male patient.', pathway: 'Abdominal Pain' },
  { label: 'full (female)', associatedSymptoms: 'Reports nausea, vomiting and fever with chills. Denies diarrhea and constipation, no blood in vomit or stool, no painful urination, no vaginal bleeding.', pathway: 'Abdominal Pain' },
];

async function main() {
  for (const c of CASES) {
    const r = await scoreAssociatedSymptoms(c);
    console.log(`\n=== ${c.label} ===`);
    console.log(`scorable=${r.scorable}  score=${r.score}  pathway=${r.pathway ?? '-'}`);
    if (r.facets) for (const f of r.facets) console.log(`   [${f.status.padEnd(14)}] ${f.axis}`);
    if (r.suggestion) console.log(`   → suggestion: ${r.suggestion}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
