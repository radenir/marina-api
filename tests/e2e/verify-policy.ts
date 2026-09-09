/**
 * Prove the policy merge does what the fleet thinks it does.
 *
 * The failure this guards against is not subtle in effect: get the merge order
 * wrong and either a fleet that switched download off still has it, or a
 * medical officer with a legitimate override loses a button mid-case. Both are
 * customer-visible and neither shows up in a type check.
 *
 *   npx tsx tests/e2e/verify-policy.ts
 *
 * Reads no database and no .env — resolvePolicy is pure.
 */
import { resolvePolicy, POLICY_DEFAULTS } from '../../src/lib/policy';

let failures = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
}

const ALL_ON = { pdf_download: true, pdf_email: true };

console.log('\nPolicy resolution\n');

check('no layers at all -> defaults', resolvePolicy(), { ...POLICY_DEFAULTS });
check('the 124 accounts with no org and no policy keep everything',
  resolvePolicy(null, null), ALL_ON);
check('empty objects change nothing', resolvePolicy({}, {}), ALL_ON);

check('fleet switches download off',
  resolvePolicy({ pdf_download: false }, null),
  { pdf_download: false, pdf_email: true });

check('email survives a download ban (they are separate flags)',
  resolvePolicy({ pdf_download: false }, null).pdf_email, true);

check('account override beats the fleet',
  resolvePolicy({ pdf_download: false }, { pdf_download: true }),
  { pdf_download: true, pdf_email: true });

check('an account override of ONE key leaves the fleet setting of the other',
  resolvePolicy({ pdf_download: false, pdf_email: false }, { pdf_download: true }),
  { pdf_download: true, pdf_email: false });

check('a stale key from a removed feature is ignored, not thrown',
  resolvePolicy({ videos_enabled: false, pdf_download: false }, null),
  { pdf_download: false, pdf_email: true });

check('a non-boolean cannot switch anything off',
  resolvePolicy({ pdf_download: 'false' }, null), ALL_ON);
check('null inside a layer is not "false"',
  resolvePolicy({ pdf_download: null }, null), ALL_ON);
check('a JSON scalar where an object was expected is ignored',
  resolvePolicy('nonsense', 42), ALL_ON);
check('an array is not treated as a policy',
  resolvePolicy(['pdf_download'], null), ALL_ON);

// The order the middleware and /auth/me both use. If these two ever disagree,
// the app hides a button the API allows, or shows one the API refuses.
check('layer order is org then user, never the reverse',
  resolvePolicy({ pdf_download: true }, { pdf_download: false }).pdf_download, false);

console.log(
  failures === 0 ? `\nALL PASS` : `\n${failures} FAILURE(S)`,
);
process.exit(failures === 0 ? 0 : 1);
