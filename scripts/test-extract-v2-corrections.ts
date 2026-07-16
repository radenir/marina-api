// Does /v2/ai/extract honor spoken corrections? The officer states a value,
// then corrects it ("sorry, I meant...", "correction...", or just restates).
// The report must carry the FINAL value, never the superseded one.
//
// Run: cd marina-api && node_modules/.bin/tsx scripts/test-extract-v2-corrections.ts [reps]
import 'dotenv/config';
import { parallelExtractV2 } from '../src/lib/medicalExtractV2.js';
import { config } from '../src/config.js';

const REPS = parseInt(process.argv[2] ?? '3', 10);
const u = (content: string) => ({ role: 'user', content });

interface Case {
  id: string;
  conv: Array<{ role: string; content: string }>;
  expect: Record<string, RegExp>;
  forbid: Record<string, RegExp>;
}

const CASES: Case[] = [
  {
    id: 'bp-correction',
    conv: [u('The patient is an oiler with a headache. Blood pressure is 120 over 76. Pulse is 84. Correction on the blood pressure — it is 122 over 76, not 120.')],
    expect: { circulation_systole: /^122$/ },
    forbid: { circulation_systole: /^120$/ },
  },
  {
    id: 'bp-sorry-i-meant',
    conv: [u('Vital signs: temperature 37.1, blood pressure 135 over 90 — sorry, I meant 125 over 90. Pulse 78, breathing 16, saturation 98 percent.')],
    expect: { circulation_systole: /^125$/ },
    forbid: { circulation_systole: /^135$/ },
  },
  {
    id: 'temp-restated',
    conv: [u('His temperature is 38.9. He also feels nauseous. Let me check that again... the temperature is 37.9, I misread the thermometer before.')],
    expect: { expose_temperature_measured_mouth: /^37\.9$/ },
    forbid: { expose_temperature_measured_mouth: /^38\.9$/ },
  },
  {
    id: 'pulse-no-marker',
    conv: [u('Pulse is 92 beats per minute. Blood pressure 118 over 74. And the pulse — 96 beats per minute now when I count a full minute.')],
    expect: { circulation_pulse_per_min: /^96$/ },
    forbid: { circulation_pulse_per_min: /^92$/ },
  },
  {
    id: 'severity-correction',
    conv: [u('The patient has back pain, he rates it 8 out of 10. Actually no — he says now it is more like 6 out of 10 since the pain killer.')],
    expect: { problemDescription: /6\s*(out of|\/)\s*10/i },
    forbid: {},
  },
  {
    id: 'destination-correction',
    conv: [u('We are heading for Rotterdam. The patient is a fitter with a swollen knee. Wait, correction — our destination is Amsterdam, not Rotterdam.')],
    expect: { destination: /^NLAMS$/ },
    forbid: { destination: /^NLRTM$/ },
  },
  {
    id: 'name-correction',
    conv: [u('The patient is called Jon Larsen — sorry, that is spelled Jan, not Jon. Jan Larsen. He has a fever of 38.5.')],
    expect: { patientFirstName: /^Jan$/ },
    forbid: { patientFirstName: /^Jon$/ },
  },
  {
    id: 'dob-correction',
    conv: [u('Patient date of birth is 14th of May 1990. Hold on, I read the wrong line — his date of birth is 4th of May 1990.')],
    expect: { dateOfBirth: /(^|\D)0?4[./\-\s]/ },
    forbid: { dateOfBirth: /14/ },
  },
  {
    id: 'allergy-correction',
    conv: [u('The patient says he is allergic to penicillin. Sorry — I misheard him, he said he is NOT allergic to anything, no known allergies.')],
    expect: { allergies: /no known allergies/i },
    forbid: { allergies: /allergic to penicillin|penicillin \(/i },
  },
  {
    id: 'medication-dose-correction',
    conv: [u('He takes metformin 850 milligrams twice daily. Correction: metformin 500 milligrams twice daily, I checked the box.')],
    expect: { currentMedications: /500/ },
    forbid: { currentMedications: /850/ },
  },
];

async function main() {
  console.log(`model=${config.nebius.extractV2Model} reps=${REPS}\n`);
  let pass = 0, fail = 0;
  const failures: string[] = [];
  const queue = [...CASES];
  const workers = Array.from({ length: 2 }, async () => {
    while (queue.length) {
      const c = queue.shift()!;
      for (let r = 0; r < REPS; r++) {
        const full = await parallelExtractV2(c.conv);
        for (const [f, rx] of Object.entries(c.expect)) {
          const v = (full[f] ?? '').toString();
          if (rx.test(v)) pass++;
          else { fail++; failures.push(`${c.id} rep${r + 1} FAIL ${f} = ${JSON.stringify(v)} (want ${rx})`); }
        }
        for (const [f, rx] of Object.entries(c.forbid)) {
          const v = (full[f] ?? '').toString();
          if (rx.test(v)) { fail++; failures.push(`${c.id} rep${r + 1} STALE ${f} = ${JSON.stringify(v)}`); }
        }
      }
      console.log(`done: ${c.id}`);
    }
  });
  await Promise.all(workers);
  console.log(`\ncorrection checks: ${pass}/${pass + fail}`);
  if (failures.length) { console.log('\nFailures:'); failures.sort().forEach((f) => console.log('  ' + f)); }
}
main().catch((e) => { console.error(e); process.exit(1); });
