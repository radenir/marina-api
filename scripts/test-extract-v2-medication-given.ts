// medicationGivenOnBoard: the medicines given on board for this illness, one
// per line — and nothing else. Runs the REAL parallelExtractV2 pipeline, so it
// also checks that currentMedications is not disturbed by the new batch.
//
// Run: cd marina-api && node_modules/.bin/tsx scripts/test-extract-v2-medication-given.ts [reps]
import 'dotenv/config';
import { parallelExtractV2 } from '../src/lib/medicalExtractV2.js';

const REPS = parseInt(process.argv[2] ?? '3', 10);
const u = (content: string) => ({ role: 'user', content });
const a = (content: string) => ({ role: 'assistant', content });

interface Case {
  id: string;
  conv: Array<{ role: string; content: string }>;
  expect: Record<string, RegExp>;
  forbid?: Record<string, RegExp>;
}

// The dictation from the partner's report (Norwegian template), verbatim.
const JAKOB = `Medical officer Kari Test on MV Testvessel, IMO 9123456, call sign LATEST. The patient, Ola Testmann, fell from a ladder 30 minutes ago. Airway: the airways are clear, he talks normally. We gave oxygen 4 litres per minute. We suspect a neck injury and fitted a neck collar. Breathing is fast and shallow, 24 breaths per minute, oxygen saturation 94 percent. Circulation: skin is pale, cold and sweaty. Capillary refill 3 seconds. Pulse 110 measured at the wrist. Blood pressure 100 over 60. We put in a venous cannula. Disability: he is awake but confused, responds to questions. No convulsions, no paralysis. Pupils equal and reacting normally. Expose: top to toe done, there is a deformed right lower leg, possibly a fracture. No hypothermia. Temperature 36.4 in the mouth. At 14:20 we gave paracetamol 1 gram orally, and at 14:30 morphine 5 milligrams intramuscular.`;

const CASES: Case[] = [
  {
    id: 'jakob-dictation',
    conv: [u(JAKOB)],
    expect: { medicationGivenOnBoard: /^Paracetamol 1 g orally 14:20\nMorphine 5 mg intramuscular 14:30$/ },
    forbid: { medicationGivenOnBoard: /oxygen|cannula|collar/i, currentMedications: /paracetamol|morphine/i },
  },
  {
    id: 'given-plus-own-meds',
    conv: [u('The oiler has a headache since this morning, 6 out of 10. He takes amlodipine 5 mg daily for blood pressure. I gave him 1 gram of paracetamol at 09:30.')],
    expect: { medicationGivenOnBoard: /^Paracetamol 1 g\w* .*09:30$/i, currentMedications: /amlodipine/i },
    forbid: { medicationGivenOnBoard: /amlodipine/i, currentMedications: /paracetamol/i },
  },
  {
    id: 'patient-took-himself',
    conv: [a('Have you taken anything for the pain?'), u('Yes, two ibuprofen tablets about an hour ago.')],
    expect: { medicationGivenOnBoard: /ibuprofen/i },
  },
  {
    id: 'own-meds-nothing-given',
    conv: [a('What is the problem?'), u('I have a headache since this morning.'), a('Do you take any regular medicines?'), u('Yes, amlodipine 5 mg once a day for blood pressure.')],
    expect: { medicationGivenOnBoard: /^$/, currentMedications: /amlodipine/i },
  },
  {
    id: 'never-discussed',
    conv: [a('What is the problem?'), u('I cut my finger on a rope an hour ago, it is bleeding a bit.')],
    expect: { medicationGivenOnBoard: /^$/ },
  },
  {
    id: 'considered-not-given',
    conv: [u('The patient has severe back pain after lifting. We considered giving morphine but decided to wait for the doctor. He takes no regular medicines.')],
    expect: { medicationGivenOnBoard: /^$/ },
  },
  {
    id: 'oxygen-and-procedures-only',
    conv: [u('Crew member collapsed in the engine room. We gave oxygen 15 litres per minute with a mask, put in an IV cannula and started a saline drip. Pulse 120.')],
    expect: { medicationGivenOnBoard: /^$|saline/i },
    forbid: { medicationGivenOnBoard: /oxygen|cannula/i },
  },
  {
    id: 'norwegian-dictation',
    conv: [u('Pasienten falt i trappen og har sterke smerter i venstre håndledd. Klokken 10:15 ga vi ham 1 gram paracetamol og 400 milligram ibuprofen gjennom munnen.')],
    expect: { medicationGivenOnBoard: /^Paracetamol 1 g orally 10:15\nIbuprofen 400 mg orally 10:15$/ },
  },
];

(async () => {
  let fails = 0;
  for (const c of CASES) {
    for (let r = 1; r <= REPS; r++) {
      const s = await parallelExtractV2(c.conv);
      const bad: string[] = [];
      for (const [k, re] of Object.entries(c.expect)) if (!re.test(String(s[k] ?? ''))) bad.push(`${k} missing`);
      for (const [k, re] of Object.entries(c.forbid ?? {})) if (re.test(String(s[k] ?? ''))) bad.push(`${k} forbidden`);
      if ('medicationGiven' in s) bad.push('raw medicationGiven leaked');
      if (bad.length) fails++;
      console.log(`${bad.length ? 'FAIL' : ' ok '} ${c.id} #${r}  given=${JSON.stringify(s.medicationGivenOnBoard)}  current=${JSON.stringify(s.currentMedications)}${bad.length ? '  ← ' + bad.join(', ') : ''}`);
    }
  }
  console.log(`\n${fails} failing run(s) of ${CASES.length * REPS}`);
  process.exit(fails ? 1 : 0);
})();
