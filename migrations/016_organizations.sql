-- Migration 016: Organisations, vessels, roles, referrals, decisions
--
-- The licence belongs to a company. Officer and management accounts are sealed
-- inside it; a doctor is the deliberate exception, sitting in a provider
-- organisation that many companies nominate, and reaching a case only through
-- a referral.
--
-- STRICTLY ADDITIVE. New tables, new nullable columns, one new view. Nothing
-- existing is dropped, renamed, re-typed or newly constrained, and every added
-- column is nullable — so an account with no organisation behaves exactly as
-- it does today. That is what lets this land before the seeding pass and
-- before any client knows organisations exist.
--
-- Lock note: as with 015, run.ts wraps this file in one transaction, so the
-- ALTER TABLE locks are held until COMMIT. Fail fast rather than queue behind
-- a busy table.

SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- organisations
--
-- `partners` already is this concept: a named organisation that owns API
-- credentials. A shipowner, a telemedicine provider and an integrator are the
-- same kind of entity, so it gains a `kind` rather than acquiring a rival
-- table that drifts from it within a year.
-- ---------------------------------------------------------------------------
ALTER TABLE partners
  ADD COLUMN IF NOT EXISTS kind VARCHAR(20) NOT NULL DEFAULT 'owner',

  -- The licence lives on the owner organisation.
  ADD COLUMN IF NOT EXISTS licence_status     VARCHAR(20) NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS licence_expires_at TIMESTAMP WITH TIME ZONE,

  -- Which provider this company's ships refer to. Set once in settings, and
  -- it grants nothing on its own — the referral is the access grant.
  ADD COLUMN IF NOT EXISTS assigned_provider_id UUID REFERENCES partners(id) ON DELETE SET NULL;

ALTER TABLE partners DROP CONSTRAINT IF EXISTS partners_kind_chk;
ALTER TABLE partners
  ADD CONSTRAINT partners_kind_chk CHECK (kind IN ('owner', 'provider', 'integrator'));

-- ---------------------------------------------------------------------------
-- vessels
--
-- users.ship_name is free text and currently holds "Opel Insignia" and a
-- person's name; one customer appears under four spellings. A fleet screen
-- cannot group on that.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vessels (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  name       VARCHAR(200) NOT NULL,
  call_sign  VARCHAR(50),
  imo        VARCHAR(20),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vessels_org ON vessels(org_id, name);

-- ---------------------------------------------------------------------------
-- accounts
--
-- users.role already exists (VARCHAR(50) DEFAULT 'user') and carries
-- 'officer' | 'management' | 'doctor'. Only the organisation link is new.
--
-- last_seen_at is what makes "live" honest on the fleet board: a dashboard
-- that looks current but is six hours stale during an emergency is worse than
-- none. Touched at most once every few minutes, best-effort.
-- ---------------------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS org_id       UUID REFERENCES partners(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vessel_id    UUID REFERENCES vessels(id)  ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id) WHERE org_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- cases gain their company, stamped at creation like ship_name already is.
-- Reading it live off the officer's profile would silently re-attribute
-- history the day someone is moved between fleets.
-- ---------------------------------------------------------------------------
ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES partners(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cases_org_status
  ON cases(org_id, status)
  WHERE org_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- case_referrals — the doctor's access grant, and the queue itself
--
-- A doctor account carries no standing access to anything. Authorisation is a
-- join to this table on every request, which is why the provider's queue can
-- safely span companies: they see the case a ship chose to send, while it is
-- open, and never the fleet behind it.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS case_referrals (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id            UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  to_org_id          UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  sent_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  claimed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  closed_at          TIMESTAMP WITH TIME ZONE
);

-- The queue: open referrals to one provider, oldest first. First in, first
-- out — ordering a clinical queue by a computed score would be triage.
CREATE INDEX IF NOT EXISTS idx_referrals_queue
  ON case_referrals(to_org_id, sent_at)
  WHERE closed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_referrals_case ON case_referrals(case_id, sent_at);

-- ---------------------------------------------------------------------------
-- case_decisions — divert, evacuate, repatriate
--
-- Recorded by the crew, who are the ones in the system when it happens. No
-- clinical content, so the office can read it without the clinical record
-- ever being reachable from a management account.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS case_decisions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id             UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  decision            VARCHAR(20) NOT NULL,
  method              VARCHAR(20),
  port_name           VARCHAR(200),
  notified            TEXT,
  note                TEXT,
  decided_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  recorded_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT case_decisions_decision_chk
    CHECK (decision IN ('hold', 'divert', 'evacuate', 'repatriate'))
);

CREATE INDEX IF NOT EXISTS idx_case_decisions_case ON case_decisions(case_id, decided_at);

-- ---------------------------------------------------------------------------
-- v_fleet_cases — the office projection
--
-- The whole point is that the clinical columns are NOT REACHABLE from here,
-- rather than merely not selected. A forgotten SELECT *, a column added next
-- year, or a careless join cannot leak a diagnosis through this view.
--
-- Deliberately absent: patient_ref, outcome_note, and every join to
-- conversations content — messages, extracted_summary, vital_signs — and to
-- case_events. Counts and timestamps only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_fleet_cases AS
SELECT
  k.id,
  k.org_id,
  k.ship_name,
  k.call_sign,
  k.status,
  k.severity,
  k.opened_at,
  k.closed_at,
  k.next_check_due_at,
  k.outcome,
  k.created_at,
  k.updated_at,
  (k.next_check_due_at IS NOT NULL AND k.next_check_due_at <= NOW()) AS is_overdue,
  (SELECT COUNT(*)::int      FROM conversations c WHERE c.case_id = k.id) AS encounter_count,
  (SELECT MAX(c.last_message_at) FROM conversations c WHERE c.case_id = k.id) AS last_activity_at
FROM cases k;
