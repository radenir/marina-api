// ---------------------------------------------------------------------------
// activate-user.ts — mark a user account active (and email-verified) so it can
// pass the verification + activation gates. Uses the app's own db pool/config.
//
//   npx tsx scripts/activate-user.ts <email>
//
// New accounts are created is_active=FALSE, email_verified=FALSE. This flips
// both to TRUE for the given email and prints before/after state.
// ---------------------------------------------------------------------------
import { query, pool } from '../src/lib/db';

async function main() {
  const email = (process.argv[2] ?? '').trim().toLowerCase();
  if (!email) {
    console.error('Usage: npx tsx scripts/activate-user.ts <email>');
    process.exit(1);
  }

  const before = await query<{
    id: string; email: string; is_active: boolean; email_verified: boolean;
  }>(
    'SELECT id, email, is_active, email_verified FROM users WHERE email = $1',
    [email],
  );

  if (before.rows.length === 0) {
    console.error(`No user found with email ${email}`);
    process.exit(1);
  }

  console.log('Before:', before.rows[0]);

  const after = await query<{
    id: string; email: string; is_active: boolean; email_verified: boolean;
  }>(
    `UPDATE users
        SET is_active = TRUE, email_verified = TRUE, updated_at = NOW()
      WHERE email = $1
      RETURNING id, email, is_active, email_verified`,
    [email],
  );

  console.log('After: ', after.rows[0]);
  console.log('✓ Account activated.');
}

main()
  .catch((err) => {
    console.error('Error:', (err as Error).message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
