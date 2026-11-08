/**
 * M-EWS on the report (S2, SWT-7): recalculated from the vitals on the report,
 * and none for a patient whose date of birth shows they are under 16.
 *
 * No test runner is configured; run directly:
 *     ./node_modules/.bin/tsx tests/mews.test.ts
 * Exits non-zero on any failure.
 */
import { isUnder16, mewsForSummary } from '../src/lib/mewsCalculator.js';
import { mapSummaryToSeafarerFields } from '../src/lib/seafarerMapper.js';
import { mapSummaryToNorwegianFields } from '../src/lib/norwegianMapper.js';
import { mapSummaryToRmdFields } from '../src/lib/rmdMapper.js';
import type { MedicalSummary } from '../src/lib/rmdMapper.js';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : `  — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`);
}

// The deteriorating set of SWT-7: 3+3+3+3+3+0 (pulse 135, resp 26, temp 39.8, sys 85, SpO2 90, Alert) = 15.
const SICK = {
  circulation_pulse_per_min: '135', breathing_num_breaths_per_min: '26', expose_temperature_measured_mouth: '39.8',
  circulation_systole: '85', breathing_oxygen_saturation: '90', avpu: 'Alert', date: '08/11/2026',
};

console.log('isUnder16');
check('15 years old on the report date', isUnder16('09/11/2010', '08/11/2026'), true);
check('16th birthday on the report date', isUnder16('08/11/2010', '08/11/2026'), false);
check('adult', isUnder16('12/03/1985', '08/11/2026'), false);
check('ISO date of birth', isUnder16('2012-05-01', '08/11/2026'), true);
check('no date of birth: not withheld', isUnder16('', '08/11/2026'), false);
check('unreadable date of birth: not withheld', isUnder16('around 1990', '08/11/2026'), false);

console.log('mewsForSummary');
check('adult, deteriorating set', mewsForSummary({ ...SICK, dateOfBirth: '12/03/1985' }), 15);
check('date of birth missing: still scored', mewsForSummary(SICK), 15);
check('under 16: none', mewsForSummary({ ...SICK, dateOfBirth: '09/11/2010' }), null);
check('no vitals: none', mewsForSummary({ date: '08/11/2026' }), null);

console.log('forms');
// A stale stored score must not win over the vitals on the report (SWT-7 found "0", want 14).
const stale = { ...SICK, mewsScore: '0' } as unknown as MedicalSummary;
check('Marina form recalculates', mapSummaryToSeafarerFields(stale).mews_score, '15');
const child = { ...SICK, dateOfBirth: '09/11/2010', mewsScore: '15' } as unknown as MedicalSummary;
check('Marina form: none under 16', mapSummaryToSeafarerFields(child).mews_score, '');
check('Norwegian form: no total under 16', mapSummaryToNorwegianFields(child).ews_total ?? '', '');
check('Norwegian form: no points under 16', mapSummaryToNorwegianFields(child).ews_hr_points ?? '', '');
const rmdChild = JSON.stringify(mapSummaryToRmdFields(child));
check('Norwegian form: total for an adult', mapSummaryToNorwegianFields({ ...SICK, dateOfBirth: '12/03/1985' } as unknown as MedicalSummary).ews_total !== undefined, true);
check('RMD form: no M-EWS under 16', rmdChild.includes('M-EWS'), false);
const rmdAdult = JSON.stringify(mapSummaryToRmdFields({ ...SICK, dateOfBirth: '12/03/1985' } as unknown as MedicalSummary));
check('RMD form: M-EWS for an adult', rmdAdult.includes('M-EWS: 15'), true);

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
