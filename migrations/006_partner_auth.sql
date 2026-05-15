-- Migration 006: Partner authentication (API keys)
--
-- Adds first-class partner identity so B2B integrations (e.g. MMG x Marina)
-- can authenticate with an API key instead of a user account. Partner-owned
-- conversations and audit rows are tagged via partner_id / api_client_id;
-- there is no phantom "service user" row.
--
-- Authorization model:
--   - users authenticate with JWT  → conversations.user_id set
--   - partners authenticate with key → conversations.partner_id set
--   - the check constraint guarantees every row has at least one owner

-- ---------------------------------------------------------------------------
-- partners — the organization that holds one or more API clients
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS partners (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(200) NOT NULL,
  slug        VARCHAR(80)  NOT NULL UNIQUE,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- partner_api_clients — individual credentials issued to a partner
--
-- key_hash:    sha256(plaintext) — plaintext is never stored. Random 32-byte
--              keys have enough entropy that sha256 (no salt) is safe.
-- key_prefix:  first 16 chars of plaintext, displayed in admin tools / audit
--              so a leaked-key incident can pinpoint which credential to
--              revoke. Not enough to authenticate with.
-- scopes:      restricts which endpoints this key can call. Enforced by
--              the requireScope middleware.
-- allowed_ips: CIDR allowlist. NULL = no restriction (only used in dev).
--              In production every partner key MUST have allowed_ips set.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS partner_api_clients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id      UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  name            VARCHAR(80)  NOT NULL,
  key_hash        CHAR(64)     NOT NULL UNIQUE,
  key_prefix      VARCHAR(16)  NOT NULL,
  scopes          TEXT[]       NOT NULL DEFAULT '{}',
  allowed_ips     INET[],
  last_used_at    TIMESTAMP WITH TIME ZONE,
  revoked_at      TIMESTAMP WITH TIME ZONE,
  expires_at      TIMESTAMP WITH TIME ZONE,
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Active-keys lookup is the hot path. Partial index keeps it tight.
CREATE INDEX IF NOT EXISTS idx_partner_api_clients_active_key_hash
  ON partner_api_clients(key_hash)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_partner_api_clients_partner_id
  ON partner_api_clients(partner_id);

-- ---------------------------------------------------------------------------
-- conversations: allow partner ownership
--
-- user_id becomes nullable. A check constraint ensures every row still has
-- at least one owner (user_id or partner_id). partner_user_ref is an opaque
-- string the partner sends (X-Partner-User-Ref header) so they can correlate
-- our rows to their internal clinicians — we don't model their users.
-- ---------------------------------------------------------------------------
ALTER TABLE conversations
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS partner_id       UUID REFERENCES partners(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS partner_user_ref VARCHAR(200);

ALTER TABLE conversations
  DROP CONSTRAINT IF EXISTS conversations_owner_chk;
ALTER TABLE conversations
  ADD CONSTRAINT conversations_owner_chk
  CHECK ((user_id IS NOT NULL) OR (partner_id IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_conversations_partner_id
  ON conversations(partner_id, last_message_at DESC)
  WHERE partner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_partner_user_ref
  ON conversations(partner_id, partner_user_ref)
  WHERE partner_user_ref IS NOT NULL;

-- ---------------------------------------------------------------------------
-- audit_logs: partner attribution
--
-- user_id was already nullable. Add partner_id + api_client_id so every
-- partner-attributable event can be traced back to a specific credential.
-- ---------------------------------------------------------------------------
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS partner_id    UUID REFERENCES partners(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS api_client_id UUID REFERENCES partner_api_clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_partner_id
  ON audit_logs(partner_id)
  WHERE partner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_api_client_id
  ON audit_logs(api_client_id)
  WHERE api_client_id IS NOT NULL;
