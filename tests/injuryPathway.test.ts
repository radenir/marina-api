/**
 * Trauma pathway from the injury mechanism (clinical decision: Peter Biesenbach,
 * 2026-11-18): a head strike, more than one injured body region, or a fall > about
 * 1 m, down ≥ 5 steps, from a ladder, or a crush / heavy blow → "Trauma", over a
 * symptom pathway or the single-limb one.
 *
 * Run: ./node_modules/.bin/tsx --env-file=.env tests/injuryPathway.test.ts
 */
import { pathwayAfterInjury, traumaByMechanism } from '../src/lib/medicalExtractV2.js';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : `  — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`);
}

const script01 = { injured: 'yes', headHit: 'yes', bodyRegions: 3, fallMetres: '2', stepsFallen: '', fromLadder: 'yes', crushOrHeavyBlow: 'no' };
const stairs = { injured: 'yes', headHit: 'no', bodyRegions: 1, fallMetres: '', stepsFallen: '8', fromLadder: 'no', crushOrHeavyBlow: 'no' };
const ankle = { injured: 'yes', headHit: 'no', bodyRegions: 1, fallMetres: '', stepsFallen: '', fromLadder: 'no', crushOrHeavyBlow: 'no' };
const noInjury = { injured: 'no', headHit: '', bodyRegions: 0, fallMetres: '', stepsFallen: '', fromLadder: 'no', crushOrHeavyBlow: 'no' };

console.log('traumaByMechanism');
check('script 01: 2 m fall from a ladder, head hit, three regions', traumaByMechanism(script01), true);
check('down 8 steps, one limb, no head strike', traumaByMechanism(stairs), true);
check('down 3 steps, one limb', traumaByMechanism({ ...stairs, stepsFallen: '3' }), false);
check('fall of 1.5 m', traumaByMechanism({ ...ankle, fallMetres: '1,5' }), true);
check('fall of 1 m is not above 1 m', traumaByMechanism({ ...ankle, fallMetres: '1' }), false);
check('crushed', traumaByMechanism({ ...ankle, crushOrHeavyBlow: 'yes' }), true);
check('two regions', traumaByMechanism({ ...ankle, bodyRegions: 2 }), true);
check('twisted ankle', traumaByMechanism(ankle), false);
check('no injury, even with a head word', traumaByMechanism({ ...noInjury, headHit: 'yes' }), false);
check('nothing returned', traumaByMechanism(undefined), false);

console.log('pathwayAfterInjury');
check('Headache → Trauma (script 01, gpt-oss)', pathwayAfterInjury('Headache', script01), 'Trauma');
check('Dizziness/Vertigo → Trauma', pathwayAfterInjury('Dizziness/Vertigo', script01), 'Trauma');
check('Musculoskeletal injuries → Trauma after 8 steps', pathwayAfterInjury('Musculoskeletal injuries', stairs), 'Trauma');
check('no pathway → Trauma', pathwayAfterInjury(null, script01), 'Trauma');
check('twisted ankle stays Musculoskeletal injuries', pathwayAfterInjury('Musculoskeletal injuries', ankle), 'Musculoskeletal injuries');
check('a burn stays a burn', pathwayAfterInjury('Burns and Chemical Injuries', script01), 'Burns and Chemical Injuries');
check('chest pain stays chest pain', pathwayAfterInjury('Chest pain', script01), 'Chest pain');
check('fainting that caused the fall stays Syncope', pathwayAfterInjury('Syncope or Presyncope', script01), 'Syncope or Presyncope');
check('headache without injury stays Headache', pathwayAfterInjury('Headache', noInjury), 'Headache');

if (failures) {
  console.log(`\n${failures} FAILURE(S)`);
  process.exit(1);
}
console.log('\nALL PASS');
