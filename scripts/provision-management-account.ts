/**
 * Create the office account for a fleet — the login that opens the Fleet
 * Dashboard for one organisation.
 *
 * There is no sign-up page for management, by design: an office account is
 * provisioned against a licence, never self-created. This is that act.
 *
 * The password is typed at the terminal with echo off. Deliberately NOT an
 * argument: argv lands in your shell history, and is visible in `ps` to
 * anything else on the machine. It is never printed, never logged, and never
 * reaches a chat transcript — CASE_FILE.md already records two accounts whose
 * passwords were generated in one and now need rotating. Once is enough.
 *
 * Writes exactly one row to `users`. It refuses if the address already exists,
 * so it can never silently reset a live account's password.
 *
 * Usage:
 *   npm run provision-management -- --org esvagt --email fleet@esvagt.com
 *   npm run provision-management -- --org esvagt --email fleet@esvagt.com --apply
 */

import 'dotenv/config';
import { Pool } from 'pg';
import { createInterface } from 'readline';
import { hashPassword } from '../src/lib/password';

const pool = new Pool({
  host: process.env.DATABASE_HOST,
  port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  // TLS is on by default for the OVH managed database. DATABASE_SSL=disable is
  // for a local throwaway Postgres, which has no TLS — it is what lets
  // tests/e2e/verify-seed-organisation.sh exercise this exact write path
  // before it is ever pointed at production. Production never sets it.
  ssl: process.env.DATABASE_SSL === 'disable' ? false : { rejectUnauthorized: false },
  options: '--search_path=public',
});

/** Read a line from the terminal without echoing it. */
function askHidden(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    if (!input.isTTY) {
      reject(new Error('a terminal is required to type a password'));
      return;
    }
    const rl = createInterface({ input, output: process.stdout, terminal: true });

    // readline echoes as it goes; muting the output stream is what hides it.
    let muted = false;
    const out = process.stdout as NodeJS.WriteStream & { _origWrite?: typeof process.stdout.write };
    if (!out._origWrite) out._origWrite = out.write.bind(out);
    out.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
      if (muted) return true;
      // @ts-expect-error — variadic passthrough to the real write
      return out._origWrite!(chunk, ...rest);
    }) as typeof out.write;

    rl.question(prompt, (answer) => {
      muted = false;
      out.write = out._origWrite!;
      process.stdout.write('\n');
      rl.close();
      resolve(answer);
    });
    muted = true;
  });
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]?.trim() : undefined;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const orgSlug = arg('org');
  const email = arg('email')?.toLowerCase();

  if (!orgSlug || !email) {
    console.error('usage: --org <slug> --email <address> [--apply]');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    const { rows: orgRows } = await client.query<{ id: string; name: string }>(
      `SELECT id, name FROM partners WHERE slug = $1`,
      [orgSlug],
    );
    if (!orgRows.length) {
      console.error(
        `[provision] no organisation with slug "${orgSlug}".` +
          ` Run seed-organisation first.`,
      );
      process.exit(1);
    }
    const org = orgRows[0];

    const { rows: existing } = await client.query<{ email: string; role: string }>(
      `SELECT email, role FROM users WHERE lower(email) = $1`,
      [email],
    );
    if (existing.length) {
      console.error(
        `\n[provision] ${email} already exists (role: ${existing[0].role}).` +
          `\n[provision] Refusing — this script never touches an existing account's password.` +
          `\n[provision] To give an existing account the office view, use:` +
          `\n[provision]   seed-organisation --management ${email}`,
      );
      process.exit(1);
    }

    console.log(`\n[provision] organisation: ${org.name} (${orgSlug})`);
    console.log(`[provision] new account:  ${email}`);
    console.log(`[provision] role:         management`);
    console.log(`[provision] active + email_verified: yes (provisioned, not self-registered)`);
    console.log(
      `\n[provision] This account will see fleet-wide activity for ${org.name}:` +
        `\n[provision] every vessel, every session count, languages and complaint` +
        `\n[provision] categories. It cannot reach a patient, a symptom, a` +
        `\n[provision] transcript or a vital sign.`,
    );

    if (!apply) {
      console.log(`\n[provision] DRY RUN — nothing written. Re-run with --apply.`);
      return;
    }

    const pw = await askHidden('\n[provision] password: ');
    if (pw.length < 12) {
      console.error('[provision] refusing: use at least 12 characters.');
      process.exit(1);
    }
    const again = await askHidden('[provision] again:    ');
    if (pw !== again) {
      console.error('[provision] refusing: the two entries differ.');
      process.exit(1);
    }

    const hash = await hashPassword(pw);

    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO users (email, password, role, is_active, email_verified,
                          org_id, company, first_name, last_name,
                          language, password_hash_algo)
       VALUES ($1, $2, 'management', TRUE, TRUE, $3, $4, 'Fleet', 'Office', 'en', 'argon2id')
       RETURNING id`,
      [email, hash, org.id, org.name],
    );

    console.log(`\n[provision] created ${email} (${rows[0].id})`);
    console.log(`[provision] the password was not printed and is not recoverable —`);
    console.log(`[provision] store it now, or re-provision to change it.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[provision] fatal:', (err as Error).message);
  process.exit(1);
});
