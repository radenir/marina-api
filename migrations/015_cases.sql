-- Migration 015: Cases — the Case File
--
-- A case outlives a session. `conversations` becomes an *encounter* inside a
-- case; the case carries the patient label, the status, when the next check is
-- due and, finally, how it ended.
--
-- STRICTLY ADDITIVE. Two new tables, two nullable columns on conversations,
-- new indexes. Nothing existing is dropped, renamed, re-typed, defaulted or
-- newly constrained, so the currently-running API keeps serving correctly
-- against this schema without redeploying.
--
-- Ownership mirrors conversations exactly (user OR partner) so partner-owned
-- rows from the MMG integration keep working under the same rules.
--
-- Lock note: migrations/run.ts wraps each file in BEGIN/COMMIT, so
-- CREATE INDEX CONCURRENTLY is not available here. The plain CREATE INDEX on
-- conversations takes a SHARE lock that blocks writes for the duration of the
-- build — negligible at the current row count, worth revisiting if
-- conversations ever grows past a few hundred thousand rows.

-- ---------------------------------------------------------------------------
-- cases
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cases (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id            UUID REFERENCES users(id)    ON DELETE CASCADE,
  partner_id         UUID REFERENCES partners(id) ON DELETE SET NULL,
  partner_user_ref   VARCHAR(200),

  -- Frozen at creation, not read live off the profile. users.ship_name and
  -- users.call_sign are editable via PUT /auth/me; a closed case must not
  -- re-attribute itself to a different vessel when someone fixes a typo.
  ship_name          VARCHAR(200),
  call_sign          VARCHAR(50),

  -- The officer's own words: "Ramil", "2nd engineer". Deliberately not a
  -- foreign key — there is no crew roster, and building one would turn this
  -- into a health register keyed to named individuals.
  patient_ref        VARCHAR(120),

  status             VARCHAR(20) NOT NULL DEFAULT 'recording',

  -- Officer-set. Never computed from vitals: that judgement is the Advisor's,
  -- and the Advisor is the part that needs medical device approval.
  severity           SMALLINT,

  outcome            VARCHAR(30),
  outcome_note       TEXT,

  next_check_due_at  TIMESTAMP WITH TIME ZONE,
  opened_at          TIMESTAMP WITH TIME ZONE,
  closed_at          TIMESTAMP WITH TIME ZONE,
  created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT cases_owner_chk
    CHECK (user_id IS NOT NULL OR partner_id IS NOT NULL),

  -- recording  — created by a session, private to the ship, not on any list
  -- open       — promoted deliberately: named, counted, owes an outcome
  -- awaiting_doctor / monitoring — the case running
  -- closed     — finished, outcome recorded
  -- discarded  — never promoted, swept
  CONSTRAINT cases_status_chk CHECK (status IN
    ('recording', 'open', 'awaiting_doctor', 'monitoring', 'closed', 'discarded')),

  CONSTRAINT cases_outcome_chk CHECK (outcome IS NULL OR outcome IN
    ('resolved_aboard', 'advised_remotely', 'diverted',
     'evacuated', 'repatriated', 'unknown'))
);

-- The case list query. Partial index: only rows that can appear on it.
CREATE INDEX IF NOT EXISTS idx_cases_user_active
  ON cases(user_id, next_check_due_at NULLS LAST)
  WHERE status IN ('open', 'awaiting_doctor', 'monitoring');

CREATE INDEX IF NOT EXISTS idx_cases_user_created
  ON cases(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cases_partner_created
  ON cases(partner_id, created_at DESC)
  WHERE partner_id IS NOT NULL;

CREATE OR REPLACE FUNCTION update_cases_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cases_updated_at_trigger ON cases;
CREATE TRIGGER cases_updated_at_trigger
BEFORE UPDATE ON cases
FOR EACH ROW
EXECUTE FUNCTION update_cases_updated_at();

-- ---------------------------------------------------------------------------
-- case_events — append-only timeline
--
-- One table serving three jobs: the chronology the doctor ashore reads, the
-- feed the Fleet Dashboard will consume, and the "who did what, when" record
-- the compliance argument rests on.
--
-- event_type is deliberately unconstrained. This is an append-only audit
-- surface; a CHECK here would eventually reject a write, and losing the record
-- is worse than storing a value we did not anticipate.
--
-- Vocabulary in use:
--   case_created · case_opened · encounter_recorded · encounter_moved
--   check_scheduled · observation_logged · report_sent
--   doctor_advice_recorded · medicine_given · case_closed · case_discarded
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS case_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ordering key, and the reason created_at is not one. Several events are
  -- written inside a single transaction (a case is created and its first
  -- encounter attached), and NOW() returns the *transaction* start time, so
  -- those rows would share a timestamp and sort at random. An audit trail
  -- that reorders itself between reads is not an audit trail.
  seq              BIGSERIAL NOT NULL,

  case_id          UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  event_type       VARCHAR(40) NOT NULL,

  actor_user_id    UUID REFERENCES users(id)         ON DELETE SET NULL,
  actor_partner_id UUID REFERENCES partners(id)      ON DELETE SET NULL,
  conversation_id  UUID REFERENCES conversations(id) ON DELETE SET NULL,

  payload          JSONB,

  -- clock_timestamp(), not NOW(): the real insertion moment, so the recorded
  -- time of two events in one transaction is honest rather than identical.
  created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_case_events_case
  ON case_events(case_id, seq);

-- ---------------------------------------------------------------------------
-- conversations becomes an encounter
--
-- Both columns are nullable with no default, so this is a catalogue-only
-- change: no table rewrite, and every existing row stays valid.
--
-- ON DELETE SET NULL rather than CASCADE: deleting a case must never take the
-- clinical record of what was actually said with it.
-- ---------------------------------------------------------------------------
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS case_id       UUID REFERENCES cases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS encounter_seq SMALLINT;

CREATE INDEX IF NOT EXISTS idx_conversations_case
  ON conversations(case_id, created_at)
  WHERE case_id IS NOT NULL;
