-- Migration 026: per-fleet and per-account feature policy
--
-- Esvagt want the report download turned off for their accounts. There is no
-- settings column anywhere in this schema today, and the existing scope
-- mechanism cannot express it: requireScope short-circuits on
-- `principal.type === 'user'` (middleware/requireScope.ts:16), so scopes gate
-- partner API clients only and a logged-in crew user always passes.
--
-- WHY JSONB AND NOT A BOOLEAN
-- The second flag is already known — DFDS asked, in the pilot review on
-- 8 September, for a way to stop the instructional videos loading over a
-- metered satellite link. A `pdf_download BOOLEAN` column would need a second
-- migration a fortnight later. One JSONB column holds both and the next one.
--
-- WHY TWO COLUMNS
-- partners.policy is the fleet default; users.policy is a per-account override.
-- The ask is fleet-wide, but "all of Esvagt except the two superintendents" is
-- the shape these requests take once a customer has the switch, and a NULL
-- override column costs nothing until used.
--
-- Resolution is DEFAULTS <- org <- user, most specific wins. See lib/policy.ts,
-- which owns the defaults; deliberately NOT duplicated in SQL, because a second
-- copy of a definition is what put a wrong M-EWS on the fleet dashboard.
--
-- ADDITIVE AND INERT. partners.policy takes a DEFAULT, which in PostgreSQL 11+
-- is stored in the catalogue rather than rewritten into every row, so this is a
-- metadata-only change on both tables. NOT NULL on partners because a fleet
-- always has a policy even when it is empty; nullable on users because NULL is
-- the meaningful value there — "inherit", as distinct from "{} , override with
-- nothing". Existing rows resolve to the defaults, so behaviour is unchanged
-- until someone sets a flag.
--
-- lock_timeout for the same reason as 025: fail fast rather than queue behind a
-- long read and block every login.

SET LOCAL lock_timeout = '5s';

ALTER TABLE partners
  ADD COLUMN IF NOT EXISTS policy JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS policy JSONB;

COMMENT ON COLUMN partners.policy IS
  'Fleet-wide feature policy. Keys are defined in src/lib/policy.ts; an absent key means "use the default". Never contains clinical data.';

COMMENT ON COLUMN users.policy IS
  'Per-account override of the fleet policy. NULL means inherit from partners.policy. Only keys present here override; the rest still come from the fleet.';
