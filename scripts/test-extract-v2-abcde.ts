// The A–E assessment from /v2/ai/extract: the two ABCDE batches through the
// REAL parallelExtractV2 pipeline. Strict on purpose: each case names the A–E
// fields it must produce and the ones it may, and any other A–E field is a
// failure — a box ticked without being said is the error that matters most.
//
// Run: cd marina-api && node_modules/.bin/tsx scripts/test-extract-v2-abcde.ts [reps]
import 'dotenv/config';
import { parallelExtractV2 } from '../src/lib/medicalExtractV2.js';

const REPS = parseInt(process.argv[2] ?? '3', 10);
const u = (content: string) => ({ role: 'user', content });

// The vitals batch owns these; everything else under these prefixes is A–E.
const VITALS = new Set(['circulation_pulse_per_min', 'circulation_systole', 'circulation_diastole',
  'breathing_num_breaths_per_min', 'breathing_oxygen_saturation', 'expose_temperature_measured_mouth']);
const isAbcde = (k: string) => !VITALS.has(k) && /^(checkbox_|airway_|breathing_|circulation_|disability_|expose_)/.test(k);

type Want = Record<string, true | RegExp>;
const CASES: Array<{ id: string; text: string; want: Want; may?: string[] }> = [
  {
    id: 'jakob-dictation',
    text: `Medical officer Kari Test on MV Testvessel, IMO 9123456, call sign LATEST. The patient, Ola Testmann, fell from a ladder 30 minutes ago. Airway: the airways are clear, he talks normally. We gave oxygen 4 litres per minute. We suspect a neck injury and fitted a neck collar. Breathing is fast and shallow, 24 breaths per minute, oxygen saturation 94 percent. Circulation: skin is pale, cold and sweaty. Capillary refill 3 seconds. Pulse 110 measured at the wrist. Blood pressure 100 over 60. We put in a venous cannula. Disability: he is awake but confused, responds to questions. No convulsions, no paralysis. Pupils equal and reacting normally. Expose: top to toe done, there is a deformed right lower leg, possibly a fracture. No hypothermia. Temperature 36.4 in the mouth. At 14:20 we gave paracetamol 1 gram orally, and at 14:30 morphine 5 milligrams intramuscular.`,
    want: {
      checkbox_airway_clear_yes: true, airway_admin_oxygen_liters_per_min: /^4$/,
      checkbox_airway_neck_back_injury_yes: true, checkbox_airway_fitted_neck_collar_yes: true,
      checkbox_breathing_fast: true, checkbox_breathing_shallow: true,
      circulation_capillary_response: /^3$/, circulation_skin_colour: /^pale$/, circulation_skin_temp_and_humidity: /cold/i,
      checkbox_circulation_temp_wrist: true,
      checkbox_disability_convulsions_no: true, checkbox_disability_paralysis_no: true, checkbox_disability_pupils_normal_yes: true,
      expose_top_to_toe_examination_performed_yes: true, expose_top_to_toe_examination_description: /leg/i,
      expose_hypothermia_overheating_performed_no: true,
      expose_temperature_performed_yes: true, expose_temperature_measured_place: /mouth/i,
    },
  },
  {
    id: 'no-abcde-at-all',
    text: 'The oiler has had a toothache since yesterday, 6 out of 10, worse with cold drinks.',
    want: {},
  },
  {
    id: 'numbers-are-not-words',
    text: 'Respiratory rate 24, pulse 112, blood pressure 95 over 60, saturation 91 percent.',
    want: {},
  },
  {
    id: 'denials-only',
    text: 'He slipped on deck. No neck or back injury suspected, so no collar. No convulsions. No paralysis.',
    want: {
      checkbox_airway_neck_back_injury_no: true, checkbox_airway_fitted_neck_collar_no: true,
      checkbox_disability_convulsions_no: true, checkbox_disability_paralysis_no: true,
    },
  },
  {
    id: 'cpr-and-airway',
    text: 'He collapsed and was not breathing. CPR was started at 10:42. We used a jaw lift, then suction, and put in a Guedel airway. Oxygen 15 litres per minute.',
    want: {
      airway_cpr_start: /^10:42$/, checkbox_airway_jaw_lift: true, checkbox_airway_suction: true, checkbox_airway_guedal: true,
      airway_admin_oxygen_liters_per_min: /^15$/,
    },
    may: ['checkbox_airway_clear_no', 'breathing_description'],
  },
  {
    id: 'abnormal-pupils',
    text: 'He hit his head. The left pupil is larger than the right and reacts slowly to light. He has a weak right arm.',
    want: { checkbox_disability_pupils_normal_no: true, disability_pupil_reaction_description: /left/i },
    may: ['checkbox_disability_paralysis_yes'],
  },
  {
    id: 'hypothermia',
    text: 'He fell into the sea and was in the water 20 minutes. He is shivering, skin cold and bluish. Temperature 34.5 measured in the ear. Clear signs of hypothermia.',
    want: {
      checkbox_skin_never_used_placeholder: true, // replaced below
    },
  },
  {
    id: 'norwegian',
    text: 'Luftveiene er frie. Han puster raskt og overfladisk. Ingen kramper og ingen lammelser. Pupillene er normale.',
    want: {
      checkbox_airway_clear_yes: true, checkbox_breathing_fast: true, checkbox_breathing_shallow: true,
      checkbox_disability_convulsions_no: true, checkbox_disability_paralysis_no: true, checkbox_disability_pupils_normal_yes: true,
    },
  },
];
CASES.find((c) => c.id === 'hypothermia')!.want = {
  circulation_skin_colour: /^bluish$/, circulation_skin_temp_and_humidity: /cold/i,
  expose_hypothermia_overheating_performed_yes: true, expose_hypothermia_overheating_description: /shiver/i,
  expose_temperature_performed_yes: true, expose_temperature_measured_place: /ear/i,
};

(async () => {
  let fails = 0;
  for (const c of CASES) {
    for (let r = 1; r <= REPS; r++) {
      const s = await parallelExtractV2([u(c.text)]);
      const bad: string[] = [];
      for (const [k, w] of Object.entries(c.want)) {
        const v = s[k];
        if (w === true ? v !== true : !(typeof v === 'string' && w.test(v))) bad.push(`missing ${k}${v !== undefined ? `=${JSON.stringify(v)}` : ''}`);
      }
      for (const k of Object.keys(s).filter(isAbcde)) {
        if (!(k in c.want) && !(c.may ?? []).includes(k)) bad.push(`extra ${k}=${JSON.stringify(s[k])}`);
      }
      if ('ab' in s || 'cde' in s) bad.push('raw ab/cde leaked');
      if (bad.length) fails++;
      console.log(`${bad.length ? 'FAIL' : ' ok '} ${c.id} #${r}${bad.length ? '  ← ' + bad.join(', ') : ''}`);
    }
  }
  console.log(`\n${fails} failing run(s) of ${CASES.length * REPS}`);
  process.exit(fails ? 1 : 0);
})();
