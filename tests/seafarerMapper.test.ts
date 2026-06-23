/**
 * Regression test for mapSummaryToSeafarerFields (src/lib/seafarerMapper.ts).
 *
 * Guards the fix where the Marina seafarer mapper read a `vitals` string the
 * /ai/extract endpoint never produces, leaving the report's vital boxes empty.
 * The mapper must read the discrete extract fields (circulation_, breathing_,
 * expose_ prefixes) and select the Sex/AVPU radios.
 *
 * No test runner is configured; run directly:
 *     ./node_modules/.bin/tsx tests/seafarerMapper.test.ts
 * Exits non-zero on any failure.
 */
import { mapSummaryToSeafarerFields } from '../src/lib/seafarerMapper.js';

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.log(`  ✗ ${name}${detail ? `  — ${detail}` : ''}`);
  }
}

// A representative /ai/extract summary: discrete vital fields, no `vitals` string.
const extractSummary: Record<string, string> = {
  chiefComplaint: 'central chest pain',
  history: 'Central chest pressure since this morning, 6/10, non-radiating.',
  pastHistory: 'No cardiac history.',
  currentMedications: 'None.',
  allergies: 'None known.',
  gender: 'male',
  avpu: 'Alert',
  circulation_systole: '140',
  circulation_diastole: '90',
  circulation_pulse_per_min: '98',
  breathing_num_breaths_per_min: '18',
  breathing_oxygen_saturation: '96',
  expose_temperature_measured_mouth: '36.8',
};

console.log('extract-shaped summary -> seafarer fields:');
const f = mapSummaryToSeafarerFields(extractSummary);

check('heart_rate from circulation_pulse_per_min', f.heart_rate === '98', `got ${JSON.stringify(f.heart_rate)}`);
check('blood_pressure from systole/diastole', f.blood_pressure === '140/90', `got ${JSON.stringify(f.blood_pressure)}`);
check('temperature from expose_temperature_measured_mouth', f.temperature === '36.8', `got ${JSON.stringify(f.temperature)}`);
check('resp_rate from breathing_num_breaths_per_min', f.resp_rate === '18', `got ${JSON.stringify(f.resp_rate)}`);
check('spo2 from breathing_oxygen_saturation', f.spo2 === '96', `got ${JSON.stringify(f.spo2)}`);
check('sex radio selects male', JSON.stringify(f.sex) === JSON.stringify({ value: true, onValue: 'male' }), `got ${JSON.stringify(f.sex)}`);
check('consciousness radio selects alert', JSON.stringify(f.consciousness) === JSON.stringify({ value: true, onValue: 'alert' }), `got ${JSON.stringify(f.consciousness)}`);
check('narrative passthrough (allergies)', f.allergies === 'None known.', `got ${JSON.stringify(f.allergies)}`);

// Backward compatibility: a legacy `vitals` string must still populate the boxes.
console.log('\nlegacy vitals-string summary -> seafarer fields:');
const legacy = mapSummaryToSeafarerFields({ vitals: 'BP 120/80, HR 70', gender: 'female', avpu: 'Voice' });
check('blood_pressure parsed from vitals string', legacy.blood_pressure === '120/80', `got ${JSON.stringify(legacy.blood_pressure)}`);
check('heart_rate parsed from vitals string', legacy.heart_rate === '70', `got ${JSON.stringify(legacy.heart_rate)}`);
check('sex radio selects female', JSON.stringify(legacy.sex) === JSON.stringify({ value: true, onValue: 'female' }), `got ${JSON.stringify(legacy.sex)}`);
check('consciousness radio selects voice', JSON.stringify(legacy.consciousness) === JSON.stringify({ value: true, onValue: 'voice' }), `got ${JSON.stringify(legacy.consciousness)}`);

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'}: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
