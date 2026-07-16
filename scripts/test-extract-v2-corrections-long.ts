// Corrections in a REALISTIC long dictation: the wrong value is stated early
// (and referenced again), the correction comes much later — like an officer
// noticing a mistake near the end of the consult ("Update report" sends the
// whole accumulated transcript as one message).
//
// Run: cd marina-api && node_modules/.bin/tsx scripts/test-extract-v2-corrections-long.ts [reps]
import 'dotenv/config';
import { parallelExtractV2 } from '../src/lib/medicalExtractV2.js';
import { config } from '../src/config.js';

const REPS = parseInt(process.argv[2] ?? '3', 10);

// One long accumulated dictation, as the app sends it (single user message).
const LONG = `Marina, this is the chief officer on MV Nordkap, call sign OWNM2. We are in the Skagerrak, about 30 nautical miles north of Hirtshals, heading for Gothenburg. I want to report a sick crew member.

The patient is Piotr Kowalczyk, a Polish able seaman, 38 years old, born 2nd of February 1987. He has had chest pain since about 10 o'clock this morning. It came on gradually while he was working on deck. It is a pressing pain in the middle of the chest, he rates it 7 out of 10. It does not spread anywhere. Resting makes it a bit better, climbing stairs makes it worse. He has never had anything like this before.

He also feels slightly nauseous but has not vomited. He denies shortness of breath. He denies palpitations.

For his history — he has high blood pressure and takes amlodipine 5 milligrams once daily. No other conditions, no operations. He smokes about 10 cigarettes a day. He has no allergies.

Vital signs: blood pressure 120 over 76, pulse 88, breathing 18 per minute, temperature 36.8, oxygen saturation 96 percent. He is alert.

On examination he looks pale and a bit sweaty. Chest is clear when I listen. The chest wall is not tender to press on. Heart sounds regular.

I did an electrocardiogram with the telemedicine unit and sent it ashore. I gave him 300 milligrams of aspirin to chew at 11:15.

One more thing — I need to correct the blood pressure I said earlier. It was 122 over 76, not 120. And actually his pain is now down to 5 out of 10 after resting.`;

const CASES = [
  { field: 'circulation_systole', expect: /^122$/, forbid: /^120$/ },
  { field: 'problemDescription', expect: /./, forbid: /never-match-placeholder/ }, // inspect manually
  { field: 'circulation_pulse_per_min', expect: /^88$/, forbid: /^$/ },
  { field: 'breathing_oxygen_saturation', expect: /^96$/, forbid: /^$/ },
];

async function main() {
  console.log(`model=${config.nebius.extractV2Model} reps=${REPS}\n`);
  for (let r = 0; r < REPS; r++) {
    const full = await parallelExtractV2([{ role: 'user', content: LONG }]);
    for (const c of CASES) {
      const v = (full[c.field] ?? '').toString();
      const ok = c.expect.test(v) && !c.forbid.test(v);
      console.log(`rep${r + 1} ${ok ? 'PASS' : 'FAIL'} ${c.field} = ${JSON.stringify(v)}`);
    }
    console.log(`rep${r + 1} (severity in problemDescription): ${JSON.stringify(((full.problemDescription ?? '') as string).match(/\d+\s*(?:out of|\/)\s*10[^.]*/gi))}`);
    console.log('');
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
