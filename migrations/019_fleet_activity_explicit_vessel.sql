-- Migration 019: let an explicit vessel assignment win
--
-- 018 resolved a session's ship purely by matching what the officer typed in
-- `users.ship_name` against `vessel_aliases`. That covers the common case —
-- 'MV Esvagt Aurora', 'ESVAGT Dana', the 'Crapri' typo — but it cannot cover
-- two real ones:
--
--   * An officer whose ship_name is the company ('Esvagt'). Aliasing the
--     company name to a vessel would silently misfile every future account
--     that types it.
--   * An officer with NO ship_name at all. normalise_vessel_name(NULL) is
--     NULL, and `alias = NULL` never matches, so no alias can ever reach them.
--
-- Both are answered by `users.vessel_id`, which 016 added and
-- seed-organisation.ts sets — and which 018's view then ignored entirely. That
-- was the bug: the authoritative column was written and never read.
--
-- So the order of precedence becomes:
--   1. users.vessel_id      — somebody decided, explicitly
--   2. vessel_aliases       — a confirmed spelling of a ship
--   3. normalise_vessel_name(ship_name) — best effort on free text
--
-- An explicit assignment also outranks an alias marked is_vessel = false: if a
-- person has been put on a ship, "the label they typed is not a ship" is no
-- longer the interesting fact about them.
--
-- STRICTLY ADDITIVE, and lighter than 018. CREATE OR REPLACE VIEW swaps a
-- stored query — no table is read, written, locked or altered, and the output
-- column list is unchanged in name, type and order (which is what CREATE OR
-- REPLACE requires). A view holds no data, so there is nothing to migrate and
-- nothing to roll back but the previous definition.

CREATE OR REPLACE VIEW v_fleet_activity AS
SELECT
  c.id                                   AS conversation_id,
  u.org_id,
  lower(regexp_replace(coalesce(u.company, ''), '[^a-zA-Z]', '', 'g')) AS company_key,
  lower(split_part(coalesce(u.email, ''), '@', 2))                     AS email_domain,

  CASE
    -- 1. The explicit assignment on the account.
    WHEN uv.name IS NOT NULL                  THEN normalise_vessel_name(uv.name)
    -- 2. A label a person confirmed is not a ship at all.
    WHEN a.id IS NOT NULL AND NOT a.is_vessel THEN NULL
    -- 3. A confirmed spelling of a ship.
    WHEN av.name IS NOT NULL                  THEN normalise_vessel_name(av.name)
    -- 4. Best effort on what was typed.
    ELSE normalise_vessel_name(u.ship_name)
  END                                    AS vessel_name,
  COALESCE(uv.id, av.id)                 AS vessel_id,

  date_trunc('month', c.created_at)::date AS month,
  c.created_at,
  c.mode,

  normalise_language(c.patient_language)         AS patient_language,
  normalise_language(c.medical_officer_language) AS officer_language,

  fleet_pathway(c.chief_symptom)         AS pathway,

  COALESCE(c.extracted_summary->>'redFlag' = 'yes', FALSE) AS red_flag,
  (c.extracted_summary IS NOT NULL)                        AS has_report,
  COALESCE(jsonb_array_length(c.messages) > 4, FALSE)      AS substantive

FROM conversations c
JOIN users u ON u.id = c.user_id
-- The explicit assignment.
LEFT JOIN vessels uv ON uv.id = u.vessel_id
-- The spelling map, as before.
LEFT JOIN vessel_aliases a
       ON a.org_id = u.org_id
      AND a.alias  = normalise_vessel_name(u.ship_name)
LEFT JOIN vessels av ON av.id = a.vessel_id;

COMMENT ON VIEW v_fleet_activity IS
  'Non-clinical per-session activity for fleet reporting. Vessel resolves by users.vessel_id, then vessel_aliases, then normalised ship_name. Contains no patient identifiers, no free-text symptom, no transcript and no vitals.';
