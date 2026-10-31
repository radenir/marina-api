// avpu: "awake but confused" is Voice, not Alert (ACVPU — new confusion scores
// as V; decided with Peter Biesenbach, 2026-10-31). Runs the REAL
// parallelExtractV2 pipeline, so it also checks the M-EWS it produces.
//
// Run: cd marina-api && node_modules/.bin/tsx scripts/test-extract-v2-avpu.ts [reps]
import 'dotenv/config';
import { parallelExtractV2 } from '../src/lib/medicalExtractV2.js';

const REPS = parseInt(process.argv[2] ?? '3', 10);
const u = (content: string) => ({ role: 'user', content });

const CASES: Array<{ id: string; text: string; avpu: string; mews?: string }> = [
  // The partner's dictation; M-EWS 6 → 9 with V.
  { id: 'jakob-dictation', avpu: 'Voice', mews: '9', text: `Medical officer Kari Test on MV Testvessel, IMO 9123456, call sign LATEST. The patient, Ola Testmann, fell from a ladder 30 minutes ago. Airway: the airways are clear, he talks normally. We gave oxygen 4 litres per minute. We suspect a neck injury and fitted a neck collar. Breathing is fast and shallow, 24 breaths per minute, oxygen saturation 94 percent. Circulation: skin is pale, cold and sweaty. Capillary refill 3 seconds. Pulse 110 measured at the wrist. Blood pressure 100 over 60. We put in a venous cannula. Disability: he is awake but confused, responds to questions. No convulsions, no paralysis. Pupils equal and reacting normally. Expose: top to toe done, there is a deformed right lower leg, possibly a fracture. No hypothermia. Temperature 36.4 in the mouth. At 14:20 we gave paracetamol 1 gram orally, and at 14:30 morphine 5 milligrams intramuscular.` },
  { id: 'disoriented', avpu: 'Voice', text: 'The motorman is awake but disoriented, he does not know where he is. Pulse 96.' },
  { id: 'not-making-sense', avpu: 'Voice', text: 'She opens her eyes and answers, but what she says does not make sense. She hit her head an hour ago.' },
  { id: 'norwegian-forvirret', avpu: 'Voice', text: 'Pasienten er våken, men forvirret. Han svarer på spørsmål. Puls 100.' },
  { id: 'awake-alert-orientated', avpu: 'Alert', text: 'He is awake, alert and well orientated. Pulse 80, blood pressure 130 over 85.' },
  { id: 'awake-talking', avpu: 'Alert', text: 'The patient is awake and talking normally. He cut his hand on a wire.' },
  { id: 'only-awake', avpu: 'Alert', text: 'Patient is awake. Complains of chest pain since 30 minutes.' },
  { id: 'responds-to-voice-only', avpu: 'Voice', text: 'He is drowsy, eyes closed, but opens his eyes when we speak to him.' },
  { id: 'responds-to-pain', avpu: 'Pain', text: 'He does not respond to questions, only moves when we pinch his shoulder.' },
  { id: 'not-mentioned', avpu: '', text: 'The oiler has a toothache since yesterday, 6 out of 10.' },
];

(async () => {
  let fails = 0;
  for (const c of CASES) {
    for (let r = 1; r <= REPS; r++) {
      const s = await parallelExtractV2([u(c.text)]);
      const bad: string[] = [];
      if ((s.avpu ?? '') !== c.avpu) bad.push(`avpu want ${JSON.stringify(c.avpu)}`);
      if (c.mews && s.mewsScore !== c.mews) bad.push(`mews want ${c.mews}`);
      if (bad.length) fails++;
      console.log(`${bad.length ? 'FAIL' : ' ok '} ${c.id} #${r}  avpu=${JSON.stringify(s.avpu)} mews=${JSON.stringify(s.mewsScore)}${bad.length ? '  ← ' + bad.join(', ') : ''}`);
    }
  }
  console.log(`\n${fails} failing run(s) of ${CASES.length * REPS}`);
  process.exit(fails ? 1 : 0);
})();
