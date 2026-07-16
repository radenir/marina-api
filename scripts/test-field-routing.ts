// Screenshot repro: a headache consult where PMH denials, allergy/medication
// denials, associated symptoms and the officer's neuro exam all appear in one
// stream. Each item must land in ITS field — associatedSymptoms must hold
// symptoms only.
import 'dotenv/config';
import { parallelExtractV2 } from '../src/lib/medicalExtractV2.js';

const REPS = parseInt(process.argv[2] ?? '3', 10);

const CONV = [{ role: 'user', content: `okay marina the patient is our fitter he has a headache since this morning we are working through the questions so he says he also has some hearing loss on the right side and he denies double vision he denies fever no nausea I asked about his health before he denies diabetes he denies high blood pressure never had a heart attack never had severe headaches before no operations no hospital stays he has no allergies and takes no medicines now the examination his pupils are equal and react to light vision is normal he can see my fingers strength is normal in both arms and both legs his walking looks normal no problems there and he swallows fine no choking no wounds on the tongue or lips` }];

const CHECKS: Array<[string, string, RegExp, boolean]> = [
  // field, label, regex, mustMatch
  ['associatedSymptoms', 'hearing loss stays',        /hearing/i, true],
  ['associatedSymptoms', 'double-vision denial stays', /double vision/i, true],
  ['associatedSymptoms', 'fever denial stays',        /fever/i, true],
  ['associatedSymptoms', 'NO diabetes denial',        /diabetes|blood pressure|heart attack/i, false],
  ['associatedSymptoms', 'NO allergy/meds denials',   /allerg|medication|medicine/i, false],
  ['associatedSymptoms', 'NO exam findings',          /pupil|strength|gait|walking|swallow/i, false],
  ['pastHistory',        'diabetes denial here',      /diabetes/i, true],
  ['pastHistory',        'hypertension denial here',  /blood pressure|hypertension/i, true],
  ['pastHistory',        'no-surgery here',           /operation|surgery/i, true],
  ['allergies',          'no-known-allergies',        /no known allergies/i, true],
  ['currentMedications', 'no-regular-meds',           /no (regular )?medication/i, true],
  ['exam',               'pupils here',               /pupil/i, true],
  ['exam',               'strength here',             /strength/i, true],
  ['exam',               'swallow here',              /swallow/i, true],
];

async function main() {
  let pass = 0, total = 0;
  for (let r = 1; r <= REPS; r++) {
    const full = await parallelExtractV2(CONV);
    console.log(`rep${r} chiefSymptom=${JSON.stringify(full.chiefSymptom)}`);
    for (const [field, label, rx, mustMatch] of CHECKS) {
      const v = (full[field] ?? '').toString();
      const ok = rx.test(v) === mustMatch;
      total++; if (ok) pass++;
      if (!ok) console.log(`  FAIL [${field}] ${label} → ${JSON.stringify(v.slice(0, 200))}`);
    }
    console.log(`  associatedSymptoms=${JSON.stringify((full.associatedSymptoms ?? '').toString())}`);
  }
  console.log(`\nRESULT: ${pass}/${total}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
