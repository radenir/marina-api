// End-to-end verification of the v2 extract fixes: runs the REAL
// parallelExtractV2 pipeline (forked prompts + port resolution + exonyms)
// over every previously-failing case plus regression cases.
//
// Run: cd marina-api && node_modules/.bin/tsx scripts/test-extract-v2-verify.ts [reps]
import 'dotenv/config';
import { parallelExtractV2 } from '../src/lib/medicalExtractV2.js';
import { searchPorts } from '../src/lib/portIndex.js';
import { config } from '../src/config.js';

const REPS = parseInt(process.argv[2] ?? '2', 10);
const u = (content: string) => ({ role: 'user', content });
const a = (content: string) => ({ role: 'assistant', content });

interface Case {
  id: string;
  conv: Array<{ role: string; content: string }>;
  expect: Record<string, RegExp>;
  forbid?: Record<string, RegExp>;
}

const CASES: Case[] = [
  // ── previously failing: nationality ──
  { id: 'nat-filipino-ab', conv: [u('The patient is Manuel Reyes, a Filipino able seaman, 34 years old, complaining of stomach pain since this morning.')], expect: { patientNationality: /filipin|philipp/i } },
  { id: 'nat-polish-motorman', conv: [u('The patient is a Polish motorman, Tomasz Nowak, 41 years old. He is complaining of dizziness.')], expect: { patientNationality: /pol/i } },
  { id: 'nat-noun-ukrainian', conv: [u('Patient details: 34-year-old male, nationality Ukrainian, works as a fitter in the engine room. Complains of burning when urinating.')], expect: { patientNationality: /ukrain/i } },
  { id: 'nat-two-people', conv: [u('This is the second officer speaking, I am Danish. The patient is an Indian oiler named Suresh, he has had diarrhea for two days.')], expect: { patientNationality: /india/i }, forbid: { patientNationality: /danish|denmark/i } },
  // ── previously failing/risky: destination port resolution ──
  { id: 'dest-port-of-klang', conv: [u('We are heading to the Port of Klang in Malaysia, arriving Saturday. The messman has a toothache that keeps him awake.')], expect: { destination: /^MYPKG$/ } },
  { id: 'dest-piraeus', conv: [u('The closest port to us right now would be Algeciras, but we are continuing to Piraeus as planned. Patient is a motorman with back pain.')], expect: { destination: /^GRPIR$/, nearestPort: /^ESALG$/ } },
  { id: 'dest-make-port', conv: [u('We will make port in Aden the day after tomorrow. The patient is a deck cadet who twisted his ankle.')], expect: { destination: /^YEADE$/ } },
  // ── location: COORDINATES ONLY — prose/place-names must come back "" so the
  //    app keeps its current (GPS-set) value ──
  { id: 'loc-coords-spoken', conv: [u('Our position is 55 degrees 30 minutes north, 012 degrees 10 minutes east. An able seaman has a deep cut on his left hand.')], expect: { location: /55/ } },
  { id: 'loc-coords-digits', conv: [u('Position 43 12 north, 005 22 east. The patient has had a nosebleed for 40 minutes that will not stop.')], expect: { location: /43/ } },
  { id: 'loc-anchor', conv: [u('We are at anchor off Lagos. An able seaman has a deep cut on his left hand from a mooring wire.')], expect: { location: /^$/ } },
  { id: 'loc-descriptive', conv: [u('We are currently in the Bay of Biscay, about 120 nautical miles west of Brest. An able seaman fell on deck and hurt his shoulder.')], expect: { location: /^$/ } },
  { id: 'loc-sailing-to', conv: [u('We are sailing to Bangkok. The patient is a female crew member, born 10th of August 2000, she is Armenian. She has a stomach ache.')], expect: { location: /^$/, destination: /^THBKK$/, patientNationality: /armenia/i, gender: /female/i } },
  // ── previously failing: meds contamination + gender ──
  { id: 'meds-contamination', conv: [u('The patient is an oiler with a headache since this morning, 5 out of 10. He takes no regular medications and has no allergies. I gave him 1 gram of paracetamol at 09:30.')], expect: { currentMedications: /no (regular )?medication/i }, forbid: { currentMedications: /paracetamol/i } },
  { id: 'gender-pronoun', conv: [u('The patient is Rajesh Kumar, an oiler. He has had abdominal pain since yesterday. He vomited twice.')], expect: { gender: /male/i } },
  { id: 'lay-language', conv: [u('The patient had his gallbladder removed in 2019 and his appendix out as a child. No other conditions. He is complaining of stomach pain.')], expect: { pastHistory: /gallbladder/i }, forbid: { pastHistory: /cholecystectomy|appendectomy|appendicectomy/i } },
  // ── regression: Danish transcript ──
  { id: 'danish', conv: [u('Dette er overstyrmanden på MV Vestkyst. Vi sejler mod Gdynia, nærmeste havn er Skagen. Vores position er i Kattegat, cirka 20 sømil øst for Grenaa. Patienten er en filippinsk matros med stærke mavesmerter.')], expect: { destination: /^PLGDY$/, nearestPort: /^DKSKA$/, location: /^$/, patientNationality: /filipin|philipp/i } },
  // ── regression: comprehensive case across every field ──
  {
    id: 'full-report',
    conv: [
      u('Marina, this is Captain Lars Holm on MV Skagen Maersk, call sign OYGR2. We are in the North Sea, roughly 60 nautical miles west of Esbjerg. We are bound for Felixstowe. I want to report a sick crew member.'),
      a('Understood, Captain. Please describe the patient and the problem.'),
      u('The patient is Rajesh Kumar, an Indian oiler, born 12th of March 1988. He has had abdominal pain since yesterday evening, it started gradually around the belly button and has now moved to the lower right side. He rates it 8 out of 10. Walking makes it worse, lying still helps a bit. He vomited twice this morning and has no appetite. He denies diarrhea and denies any urinary problems.'),
      a('Any relevant medical history, medications, or allergies?'),
      u('He had his gallbladder removed in 2019, no other conditions. He takes no regular medications. He is allergic to penicillin, he says it gives him a severe skin rash.'),
      a('What are his vital signs and what did you find on examination?'),
      u('Temperature is 38.2, pulse 104, blood pressure 128 over 82, breathing 20 per minute, oxygen saturation 97 percent. He is alert. On examination he looks unwell and lies very still. The abdomen is tender in the right lower quadrant with guarding. I did a urine dipstick which was negative. I gave him 1 gram of paracetamol at 14:30.'),
    ],
    expect: {
      shipName: /skagen maersk/i,
      shipCallSign: /OYGR2/i,
      location: /^$/, // "North Sea, 60 nm west of Esbjerg" is prose, not coordinates
      patientFirstName: /rajesh/i,
      patientLastName: /kumar/i,
      dateOfBirth: /1988/,
      gender: /male/i,
      position: /oiler/i,
      patientNationality: /india/i,
      destination: /^GBFXT$/,
      chiefComplaint: /abdominal|stomach/i,
      chiefSymptom: /^Abdominal Pain$/,
      problemDescription: /8.*10|8\/10/i,
      associatedSymptoms: /vomit/i,
      pastHistory: /gallbladder/i,
      allergies: /penicillin/i,
      currentMedications: /no (regular )?medication/i,
      investigations: /dipstick/i,
      exam: /guarding/i,
      circulation_pulse_per_min: /104/,
      circulation_systole: /128/,
      expose_temperature_measured_mouth: /38\.2/,
      breathing_oxygen_saturation: /97/,
      avpu: /^Alert$/,
      mewsScore: /\d/,
    },
    forbid: { currentMedications: /paracetamol/i, pastHistory: /cholecystectomy/i },
  },
];

async function main() {
  console.log(`model=${config.nebius.extractV2Model} reps=${REPS}\n`);

  // deterministic resolver checks first (no LLM)
  console.log('================ PORT RESOLUTION (no LLM) ================');
  const portChecks: Array<[string, string | null]> = [
    ['Port of Klang, Malaysia', 'MYPKG'],
    ['the port of Antwerp', 'BEANR'],
    ['Piraeus', 'GRPIR'],
    ['Singapore', 'SGKEP'],
    ['Rotterdam', 'NLRTM'],
    ['Santos in Brazil', 'BRSSZ'],
    ['Gothenburg', 'SEGOT'],
    ['Jeddah', 'SAJED'],
    ['Genoa', 'ITGOA'],
  ];
  // resolvePortCode isn't exported; replicate via searchPorts the way v2 does
  const resolve = (raw: string): string | null => {
    const base = raw.trim();
    const beforeComma = base.split(',')[0].trim();
    const beforeIn = beforeComma.split(/\s+in\s+/i)[0].trim();
    const noPrefix = beforeIn.replace(/^(?:the\s+)?port\s+of\s+/i, '').trim();
    for (const c of [base, beforeComma, beforeIn, noPrefix].filter((s, i, x) => s && x.indexOf(s) === i)) {
      const hit = searchPorts(c, 1)[0];
      if (hit?.unlocode) return hit.unlocode;
    }
    return null;
  };
  let portFails = 0;
  for (const [q, want] of portChecks) {
    const got = resolve(q);
    const ok = got === want;
    if (!ok) portFails++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${JSON.stringify(q)} → ${got} (want ${want})`);
  }

  console.log('\n================ FULL PIPELINE ================');
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
          if (rx.test(v)) { pass++; }
          else { fail++; failures.push(`${c.id} rep${r + 1} FAIL ${f} = ${JSON.stringify(v)}`); }
        }
        for (const [f, rx] of Object.entries(c.forbid ?? {})) {
          const v = (full[f] ?? '').toString();
          if (rx.test(v)) { fail++; failures.push(`${c.id} rep${r + 1} FAIL(forbidden) ${f} = ${JSON.stringify(v)}`); }
        }
      }
      console.log(`done: ${c.id}`);
    }
  });
  await Promise.all(workers);

  console.log(`\n================ RESULT ================`);
  console.log(`port resolution: ${portChecks.length - portFails}/${portChecks.length}`);
  console.log(`pipeline checks: ${pass}/${pass + fail}`);
  if (failures.length) {
    console.log('\nFailures:');
    failures.sort().forEach((f) => console.log('  ' + f));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
