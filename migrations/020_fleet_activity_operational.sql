-- Migration 020: the operational columns the printed report has and the
-- dashboard did not
--
-- Marina Health's Onboard Incident Summary (9 Aug 2026) carries a dozen figures
-- the live dashboard could not produce. Most of them it should never produce —
-- patient age, sex, rank, nationality, the wording of a red flag, vital-sign
-- values. Those are the columns v_fleet_activity exists to make unreachable,
-- and they stay unreachable.
--
-- The rest are operational rather than clinical, and there is no reason a fleet
-- office should not have them:
--
--   duration_minutes  how long a guided consultation ran
--   has_vitals        THAT a measurement was taken — never which, never what
--   is_injury         injury or illness, from the pathway that is already here
--   nearest_port      where the ship was
--   destination       where it was heading
--   account_ref       an opaque per-organisation pseudonym, so a scenario
--                     demonstrated forty times on one account can be counted
--                     once
--
-- STRICTLY ADDITIVE, and the lightest kind: CREATE OR REPLACE VIEW appends
-- columns to a stored query. No table is read, written, locked or altered, and
-- a view holds no data. The existing columns keep their names, types and order,
-- which is what CREATE OR REPLACE requires.

CREATE OR REPLACE VIEW v_fleet_activity AS
SELECT
  c.id                                   AS conversation_id,
  u.org_id,
  lower(regexp_replace(coalesce(u.company, ''), '[^a-zA-Z]', '', 'g')) AS company_key,
  lower(split_part(coalesce(u.email, ''), '@', 2))                     AS email_domain,

  CASE
    WHEN uv.name IS NOT NULL                  THEN normalise_vessel_name(uv.name)
    WHEN a.id IS NOT NULL AND NOT a.is_vessel THEN NULL
    WHEN av.name IS NOT NULL                  THEN normalise_vessel_name(av.name)
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
  COALESCE(jsonb_array_length(c.messages) > 4, FALSE)      AS substantive,

  -- ---- added in 020 ------------------------------------------------------

  -- How long the consultation ran. NULL for a single-write note, which has no
  -- span at all — averaging those in would halve every duration and describe
  -- nothing. Capped at four hours: a session left open on a bridge overnight
  -- is a forgotten tab, not a four-hour consultation.
  CASE
    WHEN c.last_message_at > c.created_at
     AND c.last_message_at < c.created_at + INTERVAL '4 hours'
    THEN ROUND(EXTRACT(EPOCH FROM (c.last_message_at - c.created_at)) / 60.0, 1)
  END                                    AS duration_minutes,

  -- THAT a measurement was taken, never which and never what. A capture rate
  -- says whether the kit is being used; a value is a clinical finding about a
  -- named crew member on a named ship.
  (COALESCE(NULLIF(c.extracted_summary->>'circulation_pulse_per_min',''),
            NULLIF(c.extracted_summary->>'circulation_systole',''),
            NULLIF(c.extracted_summary->>'breathing_oxygen_saturation',''),
            NULLIF(c.extracted_summary->>'breathing_num_breaths_per_min',''),
            NULLIF(c.extracted_summary->>'expose_temperature_measured_mouth','')
   ) IS NOT NULL)                        AS has_vitals,

  -- Injury or illness, derived from the pathway that is already here — so it
  -- discloses nothing the complaint mix does not. NULL when unclassified,
  -- rather than quietly counted as illness.
  CASE
    WHEN fleet_pathway(c.chief_symptom) = 'Unclassified' THEN NULL
    WHEN fleet_pathway(c.chief_symptom) IN (
      'Laceration or Open Wounds', 'Burns and Chemical Injuries',
      'Musculoskeletal injuries', 'Trauma', 'Eye Foreign Body',
      'Drowning or Near Drowning', 'Cold Exposure/Hypothermia',
      'Heat Stroke/Heat Exhaustion')                      THEN TRUE
    ELSE FALSE
  END                                    AS is_injury,

  -- Where the ship was and where it was heading. Operational, not clinical —
  -- a port is a fact about a vessel, and the office already knows it.
  NULLIF(trim(c.extracted_summary->>'nearestPort'), '')  AS nearest_port,
  NULLIF(trim(c.extracted_summary->>'destination'), '')  AS destination,

  -- An opaque, per-organisation pseudonym for the account.
  --
  -- It exists for one job: the printed report collapses "each distinct
  -- presentation once per account", because a scenario demonstrated forty
  -- times on one login would otherwise drown out every real case. Counting
  -- that needs to know two sessions came from the same account, and nothing
  -- more.
  --
  -- Salted with org_id so the same officer in two organisations does not
  -- correlate, and one-way, so a reader of this view cannot get back to a
  -- user id or an email. It is deliberately not u.id.
  md5(u.id::text || ':' || COALESCE(u.org_id::text, '')) AS account_ref

FROM conversations c
JOIN users u ON u.id = c.user_id
LEFT JOIN vessels uv ON uv.id = u.vessel_id
LEFT JOIN vessel_aliases a
       ON a.org_id = u.org_id
      AND a.alias  = normalise_vessel_name(u.ship_name)
LEFT JOIN vessels av ON av.id = a.vessel_id;

COMMENT ON VIEW v_fleet_activity IS
  'Non-clinical per-session activity for fleet reporting. Vessel resolves by users.vessel_id, then vessel_aliases, then normalised ship_name. Contains no patient identifiers, no free-text symptom, no transcript, and no vital-sign values — only whether a measurement was taken.';
