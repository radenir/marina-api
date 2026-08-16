# The Case File — state of play

**Last updated: 16 August 2026.** Written as a handover: what exists, what is
deployed, why things are the way they are, and what bites if you forget it.

> Two older documents in `docs/` — `PLAN.md` and `WHAT_IS_IMPLEMENTED.md` —
> describe only the April auth layer and predate the entire AI, interview and
> Case File surface. Treat them as history, not as a description of the system.

---

## 1. What this is

A **case** outlives a session. Before this work, opening the Note Taker,
speaking for forty minutes and closing it was the whole record — which is why
nobody could say how half of these episodes finished. Now `conversations`
rows are *encounters* inside a `cases` row that carries the patient label, the
status, when the next check is due, and finally how it ended.

Three audiences read the same case, and the difference between them is what
each is allowed to see:

| Who | Sees | Status |
|---|---|---|
| **Ship** (officer) | everything — patient, transcript, vitals, advice | API live; screens written, not deployed |
| **Office** (management) | urgency, status, what it waits for, cost — never clinical content | API live; app built locally, not deployed |
| **Doctor ashore** | the full clinical record, but only for cases referred to them | **not built** |

Design documents (Claude artifacts, private):

- Product direction — <https://claude.ai/code/artifact/9ecb0306-9739-43e1-9453-81d372da1bfa>
- API build plan — <https://claude.ai/code/artifact/f1d5b56d-913d-44d6-8667-4455ffd74363>
- The three readers — <https://claude.ai/code/artifact/d048803c-8afa-48ce-9324-b4e54ab1110d>
- Two shore frontends — <https://claude.ai/code/artifact/baa9c494-b053-4db2-b5bf-4d88387908ab>

---

## 2. Where the code lives

| Repo | Branch | State |
|---|---|---|
| `marina-api` | `main` @ `71af0c3` | **deployed to production** |
| `eu.marinahealth.eu` | `cases` (off `parity`) | pushed, **not merged, not deployed** |
| `fleet.marinahealth.eu` | local git only | **no GitHub remote yet** |

`eu.marinahealth.eu`'s active branch is **`parity`**, 27 commits ahead of
`main`. The merge path for the case screens is `cases` → `parity` → `main`.

There is **one API**. `/fleet` is a namespace inside the same Express app, not
a separate service. The branch was called `fleet-api`, which caused confusion;
it has been merged and deleted.

---

## 3. What is deployed, precisely

**Live on `api.marinahealth.eu`:** `/auth`, `/ai`, `/v2/ai`, `/conversations`,
`/cases`, `/fleet`, `/maritime`.

**Live in the database:** migrations `015_cases.sql` and `016_organizations.sql`.

**Not deployed anywhere:**

- the three ship screens (keep-as-a-case, the case list, close-the-case)
- the Fleet Dashboard frontend
- anything for the doctor

**Consequence worth internalising:** a Note Taker session in production today
*does* create a case, automatically. It sits in `recording` — invisible by
design — because no client calls `PATCH /cases/:id` to promote it. Production
had **0 promoted cases** at the time of writing.

---

## 4. The design decisions, and why

Re-litigating these wastes a day, so here they are with their reasons.

**Created is not open.** A case appears the instant the first word is captured,
private to the ship. It becomes *open* only on a deliberate act. Most Note
Taker uses are not cases — test runs, translations, curiosity — and if every
session reached the office board it would be noise on day one and they would
stop trusting it.

**Promotion requires a patient name.** A row the officer cannot recognise is a
row they will not tap, and the list is the entire reminder mechanism.

**Closing requires an outcome.** "Nobody writes down how it ended" is
unfixable if the API permits it.

**The list is the reminder.** No push, no scheduler, no worker. On a ship
offline half the day, the screen they open is the only channel that reliably
works.

**The officer picks the case for encounter two.** There is no crew roster and
no patient identity to match on. Attaching is reversible, because someone will
tap the wrong row.

**The office view is a SQL view, not a filter.** `v_fleet_cases` does not
contain `patient_ref`, `outcome_note`, or any join to conversation content. A
forgotten `SELECT *` cannot leak a diagnosis. "The office cannot query the
symptoms" survives a lawyer; "we filter them out" does not.

**There is no write endpoint in `/fleet` at all.** The absence is the
guarantee.

**A doctor's access comes from a referral, not a role.** Radio Medical will be
*one* provider account serving every Danish ship, so a provider organisation
sits beside the companies rather than inside one. Companies nominate a
provider in settings — that grants nothing. The per-case referral is the
access grant: timestamped, revocable, and it makes the audit answer one row.

**The doctor's queue is first-in-first-out.** M-EWS is displayed, never sorted
on. Ordering a clinical queue by a computed score is arguably triage, which is
regulated; FIFO performs no ranking, so the Doctor's View stays outside the
approval perimeter.

**The crew records the evacuation decision**, so the office stays read-only
with no exceptions. Cost therefore comes from a per-fleet constant, not an
invoice — the crew knows a helicopter came, not what it billed.

**`caseTrend.ts` reports numbers and nothing else.** No "deteriorating" flag,
no threshold. Charting a score is unregulated; interpreting it belongs to the
Advisor and needs approval. A test asserts the response has exactly six keys
so a verdict field cannot be added quietly.

---

## 5. Things that will bite you

**`marina-api/.env` points at the production OVH database.** Anything you run
locally — `npm run dev`, a script, a test — hits production unless you stop
it. Every test here is launched with `env -i` and an explicit
`DATABASE_HOST=localhost`, and deliberately does not load dotenv.

**Migrations run from your laptop, not the server.** `api.marinahealth.eu` has
no `node`, `npm` or `psql` at all; the production image ships only compiled
`dist/` and no `.sql` files. The OVH database is externally reachable, so
`npm run migrate` on your Mac is the intended path and always was.

**`deployment/rebuild.sh` does not run migrations.** It is `down`, `build
--no-cache`, `up`, health check. Migrations are a separate, deliberate step.

**`migrations/run.ts` wraps each file in one transaction.** So `SET LOCAL
lock_timeout` works, and `CREATE INDEX CONCURRENTLY` is impossible. Locks are
held until the file commits.

**`users.role` is not in the JWT.** `signAccessToken(user.id)` is called with
no roles argument, so `req.user.role` is always `'user'`. `requireRole` reads
the role from the database. Trusting the token would let every account
through.

**`ui-i18n.ts` has 32 complete dictionaries** and a typed interface — adding
one key means translating into 32 languages before anything compiles. Feature
strings follow `auth-i18n.ts` instead: `Partial<>` overlays with English
fallback. `lib/cases-i18n.ts` does this (English and Danish complete).

**Port 3000 is taken** by the ship app's dev server. The Fleet Dashboard uses
3200.

**`case_events` must be ordered by `seq`, never `created_at`.** Several events
are written in one transaction and `NOW()` returns the transaction start time,
so timestamps tie and the timeline sorts at random. `created_at` defaults to
`clock_timestamp()` for the same reason.

**Same-named vessels are normal.** Marina Health has *MV Pacific Star* twice
under different call signs. **Call sign is the identifier; name is a
fallback.** A naive join duplicates board rows — `/fleet/board` uses
`LEFT JOIN LATERAL … LIMIT 1` because of this.

**`users.company` is unusable as a fleet key.** Free text: Esvagt appears as
`Esvagt A/S`, `Esvagt`, `Esvagt AS`, and `Esvagt ` with a trailing space. 79 of
133 users have none. `ship_name` contains `"Opel Insignia"` and a person's
name. This is why `vessels` and `partners.org_id` exist.

**Mobile never calls `/ai/note-taker/save`.** iOS and Android record locally,
then make a single `/v2/ai/extract` call with no `conversationId`. A Marina
*interview* on mobile therefore creates **two** conversations and two cases —
one from chat turn 1, one from the extract. Pre-existing, and visible in the
data: 153 `marina` rows but only 33 with a summary. The fix is one line in each
app: pass `state.conversationId` to extract.

**Both mobile apps tolerate unknown JSON fields** — Android sets
`ignoreUnknownKeys = true`, iOS uses a plain `JSONDecoder`. Checked, because
kotlinx.serialization throws by default.

---

## 6. Testing

```bash
./tests/e2e/run.sh              # all seven suites — 209 assertions
./tests/e2e/run.sh fleet        # one by name: cases phase2 phase3 fleet additive
```

Each suite boots the real Express app against a throwaway local Postgres and
drives it over HTTP.

The **`additive`** runs matter most: they execute the current code against
*older* schemas (`pre015`, `pre016`) — the state production would be in if code
shipped ahead of a migration — and assert the existing endpoints behave
identically. Run these before any deploy. They have already caught one real
regression: stamping `cases.org_id` inside the case INSERT meant case creation
silently *stopped* on a pre-016 database.

Frontend: `npm run typecheck && npx vitest run` in `eu.marinahealth.eu`
(234 tests) and `fleet.marinahealth.eu`.

---

## 7. Running the Fleet Dashboard locally

```bash
cd ~/Documents/fleet.marinahealth.eu
./dev-stack.sh          # local API :4000 + demo database, six cases to look at
./dev-stack.sh prod     # the deployed API and the real database
./dev-stack.sh stop
```

- local mode → `http://localhost:3200`, sign in `office@marinahealth.test` / `demo1234`
- prod mode → same URL, sign in `fleet@marinahealth.eu`

`marina_fleet_demo` is a local Postgres database with invented Marina Health
data. It exists so the machinery has something to chew on; none of it is real.

---

## 8. What was written to production

Only ever **inserts**; no existing row has been modified.

| | |
|---|---|
| migration 015 | `cases`, `case_events`, `conversations.case_id` + `encounter_seq` |
| migration 016 | organisations, vessels, roles, referrals, decisions, `v_fleet_cases` |
| 1 × `partners` | Marina Health (`marina-health`) |
| 4 × `vessels` | SS Marina, MV Pacific Star ×2, MV Marina |
| 1 × `users` | `fleet@marinahealth.eu` — management |
| 1 × `users` | `officer.ssmarina@marinahealth.eu` — officer, SS Marina |

Both migrations were verified non-destructive by MD5-fingerprinting `users`
and `conversations` before and after. 133 users and 748 conversations, both
unchanged.

**Passwords for those two accounts were generated in a chat transcript and
should be rotated.** So should the `ubuntu@api.marinahealth.eu` SSH password,
which was also pasted into one.

**Also to tidy:** four test organisations (`evaltest`, `glmtest`, `localtest`,
`test-sandbox`) and MMG all defaulted to `kind = 'owner'` in migration 016.
MMG is an integrator:

```sql
UPDATE partners SET kind = 'integrator' WHERE slug = 'mmg';
```

A leftover Docker image called `marina-migrator` exists on the VPS from an
abandoned approach and can be deleted.

---

## 9. What is next

**Immediately blocking everything:** merge and deploy `cases` in
`eu.marinahealth.eu`. Until an officer can promote a case, both shore views are
views over nothing.

Then, in order:

1. **Encounter two** — tap a case to start a follow-up; case detail with the
   M-EWS trend. Frontend only, no backend work.
2. **Seeding production** — real organisations and vessels, and attaching the
   existing officer accounts. *Needs Adrian's list*; `users.company` cannot be
   trusted. Then run `npm run backfill-cases` (dry run first) so the 748
   conversations become closed cases with no outcome — which is what makes
   "how did this end?" askable for the Esvagt and DFDS pilots.
3. **Deploy `fleet.marinahealth.eu`** — needs a GitHub repo, DNS, an nginx
   server block *as a new file*, and certbot. The `deployment/` directory was
   copied verbatim from the ship app and still needs its ports and server name
   changed.
4. **Referrals** — the ship's send-to-doctor button and the `/shore` endpoints.
5. **doctor.marinahealth.eu** — queue, case, ask-back.

**Not code, but on the critical path:** ask Radio Medical what their queue
needs, before building it. It costs nothing, Peter has the door, and it is the
only thing that tells you whether the referral model survives contact with how
they actually work.

---

## 10. Still open

- **Does the fleet board show the patient label?** Currently hidden. A safety
  manager will ask; on a twelve-person crew it discloses a named person's
  health status to their employer. Decide deliberately.
- **Severity scale** — 1 routine · 2 watch · 3 urgent, doctor now · 4
  emergency. No database constraint, so it can change; the ship screens
  hardcode the labels.
- **What happens when a licence lapses?** Read-only for the company, or closed?
  It matters for a seafarer's right of access to their own record, which
  outlives the commercial relationship.
- **Does one shared Radio Medical login satisfy the audit question?** It
  answers *which organisation* saw a case, not *which doctor*.
- **`marina-reports-viewer`** still reads the database directly and expects
  `users` columns that do not exist. It will drift further now. Point it at
  the API or retire it.
