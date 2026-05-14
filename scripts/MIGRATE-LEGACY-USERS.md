# Porting legacy users into marina-api

One-off script that copies the user base from the legacy Next.js app
(`my-second-elevenlabs-ap`) into marina-api. Users keep their existing email
and password — no resets, no re-onboarding.

## How it works

1. Reads users from the legacy Postgres over `SOURCE_DATABASE_URL`. The source
   connection is opened in a `BEGIN READ ONLY` transaction — **the legacy DB is
   never written to**.
2. INSERTs into marina-api's `users` with `password_hash_algo = 'bcrypt'`,
   `email_verified = TRUE`, `is_active = TRUE`, role `'user'`.
3. On first login, marina-api transparently re-hashes the bcrypt password
   to argon2id (`src/routes/auth.ts` already handles this).

## Fields ported

| Legacy column | marina-api column |
|---|---|
| `id` | `id` (UUID preserved) |
| `email` | `email` (lowercased) |
| `password_hash` | `password` (kept as bcrypt) |
| `first_name + last_name` | `name` (concatenated) |
| `ship_name` | `ship_name` |
| `imo_number` | `imo_number` |
| `company` | `company` |
| `created_at` | `created_at` |
| `updated_at` | `updated_at` |

**Dropped** (marina-api doesn't read them today): `date_of_birth`, `gender`,
`nationality`, `call_sign`, `satellite_phone`, `position_title`, `mmsi_number`,
`flag_state`, `last_login_at`. They remain in the legacy DB if you ever need
them again.

## Required environment

Nothing extra to set up. The script reads:

- **Destination DB** — marina-api's own `.env` (`DATABASE_HOST/PORT/USER/PASSWORD/NAME`),
  loaded by `dotenv/config` like every other marina-api command.
- **Source DB** — the legacy app's own `.env`. By default the script looks for
  it at `../production-marina/my-second-elevenlabs-ap/.env` (relative to the
  marina-api project root). Override with `--legacy-env <path>` if the legacy
  project lives elsewhere.

The legacy `.env`'s `DATABASE_*` keys are parsed in-memory only — they're
**never** copied into `process.env`, so they can't accidentally overwrite
marina-api's destination credentials.

## Run it

**Dry-run first** — connects to both DBs, lists what would be inserted, writes nothing:

```bash
npm run migrate-legacy-users -- --dry-run
```

**Real run**:

```bash
npm run migrate-legacy-users
```

Optional flags:

```bash
npm run migrate-legacy-users -- --batch-size 100
npm run migrate-legacy-users -- --legacy-env /path/to/legacy/.env
```

The script also performs a sanity check at startup: if the parsed source
host+database match the destination, it refuses to run. That guards against
accidentally pointing both ends at the same DB.

## Output

```
[migrate-users] dry-run=false batch-size=500
[migrate-users] done — seen=842 inserted=842 skipped=0 errored=0
```

- **seen** — rows read from legacy.
- **inserted** — new rows in marina-api.
- **skipped** — rows whose email already existed in marina-api (idempotent).
- **errored** — rows that failed to insert. Each error prints a line above.

Exit code is non-zero if anything errored.

## Verifying afterwards

Spot-check a couple of migrated rows in the destination:

```sql
SELECT email, password_hash_algo, email_verified, is_active, role,
       ship_name, imo_number, company, created_at
FROM users
WHERE email IN ('alice@example.com', 'bob@example.com');
```

Expect: `password_hash_algo='bcrypt'`, `email_verified=true`, `is_active=true`,
`role='user'`.

Then test a real login through marina-api with the user's existing password.
Expect HTTP 200 plus tokens. Immediately after, the same row should show
`password_hash_algo='argon2id'` — the bcrypt → argon2id upgrade-on-login fires
once per migrated user on first successful login.

## Re-running

The script is idempotent. If a row was inserted on a previous run, the second
run reports it under `skipped`. Safe to re-run after partial failures.

## Rollback

The legacy DB is untouched — it is the rollback source. Restore marina-api's
DB from the pre-migration snapshot if you need to undo. Do not "fix" anything
on the legacy side.

## What if the legacy schema changed?

If the SELECT errors with `column users.X does not exist`, the legacy DB has
been altered since this script was written. Read the script's SELECT block
(`scripts/migrate-legacy-users.ts`) and either:

- Update the SELECT and the row type, or
- Drop the column from both — but do **not** alter the legacy DB. The cleanest
  fix is in this destination-side script.
