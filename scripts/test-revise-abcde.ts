// Voice editing of the A–E assessment: the REAL reviseAbcde against the model.
// Strict like the extract test: the fields that must change are named, and any
// other field that changes is a failure — a dictated "no convulsions" must not
// also untick the collar.
//
// Run: cd marina-api && node_modules/.bin/tsx scripts/test-revise-abcde.ts [reps]
import 'dotenv/config';
import { reviseAbcde } from '../src/lib/reviseAbcde.js';
import { abcdeFields } from '../src/lib/medicalExtractV2.js';

const REPS = parseInt(process.argv[2] ?? '3', 10);

// The partner's case as the report holds it after extraction.
const JAKOB = abcdeFields(
  { airwayClear: 'yes', oxygenLitresPerMin: '4', neckBackInjurySuspected: 'yes', neckCollarFitted: 'yes', breathingPattern: ['fast', 'shallow'] },
  { capillaryRefillSeconds: '3', skinColour: 'pale', skinFeel: 'cold and sweaty', pulseMeasuredAt: 'wrist', convulsions: 'no',
    paralysis: 'no', pupilsNormal: 'yes', topToToeDone: 'yes', topToToeFindings: 'deformed right lower leg, possible fracture',
    hypothermiaOrOverheating: 'no', temperatureMeasuredAt: 'mouth' },
  '36.4',
);

type Want = Record<string, boolean | RegExp>;
const CASES: Array<{ id: string; current: Record<string, unknown>; say: string; want: Want; unmapped?: RegExp }> = [
  {
    id: 'from-empty', current: {},
    say: 'Airway is clear, we fitted a neck collar, no convulsions, pupils are normal.',
    want: { checkbox_airway_clear_yes: true, checkbox_airway_fitted_neck_collar_yes: true, checkbox_disability_convulsions_no: true, checkbox_disability_pupils_normal_yes: true },
  },
  {
    id: 'correct-a-pair', current: JAKOB,
    say: 'Correction: no neck injury is suspected after all, and take the collar off the report.',
    want: { checkbox_airway_neck_back_injury_yes: false, checkbox_airway_neck_back_injury_no: true, checkbox_airway_fitted_neck_collar_yes: false },
  },
  {
    id: 'add-manoeuvres', current: JAKOB,
    say: 'We also did a jaw lift and used suction.',
    want: { checkbox_airway_jaw_lift: true, checkbox_airway_suction: true },
  },
  {
    id: 'not-abcde-goes-to-unmapped', current: JAKOB,
    say: 'His skin colour is normal now. Pulse is 90 and he says he feels sick.',
    want: { circulation_skin_colour: /^normal$/ },
    unmapped: /90|nause|sick/i,
  },
  {
    id: 'temperature-site', current: JAKOB,
    say: 'The temperature was actually measured in the armpit, not the mouth.',
    want: { expose_temperature_measured_place: /armpit|axilla/i },
  },
  {
    id: 'norwegian', current: {},
    say: 'Ingen lammelser. Han puster dypt.',
    want: { checkbox_disability_paralysis_no: true, checkbox_breathing_deep: true },
  },
];

(async () => {
  let fails = 0;
  for (const c of CASES) {
    for (let r = 1; r <= REPS; r++) {
      const res = await reviseAbcde(c.current, c.say);
      const bad: string[] = [];
      for (const [k, w] of Object.entries(c.want)) {
        const v = res.fields[k];
        const ok = typeof w === 'boolean' ? v === w : typeof v === 'string' && w.test(v);
        if (!ok) bad.push(`${k}=${JSON.stringify(v)}`);
      }
      for (const k of res.changed) if (!(k in c.want)) bad.push(`unexpected change ${k}=${JSON.stringify(res.fields[k])}`);
      if (c.unmapped ? !c.unmapped.test(res.unmapped ?? '') : res.unmapped) bad.push(`unmapped=${JSON.stringify(res.unmapped)}`);
      if (bad.length) fails++;
      console.log(`${bad.length ? 'FAIL' : ' ok '} ${c.id} #${r}  changed=[${res.changed.join(', ')}]${bad.length ? '  ← ' + bad.join(', ') : ''}`);
    }
  }
  console.log(`\n${fails} failing run(s) of ${CASES.length * REPS}`);
  process.exit(fails ? 1 : 0);
})();
