-- Migration 022: who the patients were, and how often a reading was abnormal
--
-- Adrian's call, 2026-09-08: the fleet office should see age, sex, rank and
-- nationality, plus how often a measured vital fell outside the normal range.
-- Red-flag reasons stay out — those are a clinical finding in prose about one
-- person, and no aggregation makes them safe.
--
-- ---------------------------------------------------------------------------
-- These four are different from everything else in this view
--
-- Session counts, languages and pathways describe a fleet. Age, sex, rank and
-- nationality describe a *person*, and they only stop describing a person
-- because there are enough of them. On an eighteen-berth standby vessel,
-- "one female, 25–34, Filipino, in August" is a name.
--
-- So two rules, and the second is enforced in the API rather than here:
--
--   1. Fleet-wide only. These are never grouped with vessel_name — the same
--      rule the complaint mix already follows.
--   2. Minimum cell size. A category with fewer than FLEET_MIN_CELL reports
--      is not shown at all; the count of suppressed reports is shown instead,
--      so the page is honest about hiding something rather than silently
--      short.
--
-- The derangement figures are different again, and safer: a rate over the
-- reports that carried a measurement, never a value, never a person. "Most
-- readings your officers take are abnormal" is a fact about measurement
-- discipline, not about a patient.
--
-- STRICTLY ADDITIVE: new functions, and a view whose existing columns keep
-- their names, types and order.

-- ---------------------------------------------------------------------------
-- fleet_age — dateOfBirth is free text and holds at least six shapes
--
--   '34'             already an age
--   '59 years'       an age with a unit
--   '1985-05-04'     ISO
--   '04 June 1989'   spoken, day first
--   'June 4 1989'    spoken, month first
--   '1981'           a bare year
--   '24.07.19.93'    unparseable, and there is no honest guess
--
-- Any four-digit year is enough for a band, so the strategy is: take a bare
-- number as an age, otherwise find a standalone year and subtract.
--
-- Ages outside 16–90 are dropped. '2019-08-10' appears in the data and yields
-- an age of 7 — that is the date of the visit typed into the wrong box, not a
-- seven-year-old crew member, and banding it as "Under 25" would be worse than
-- saying nothing.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fleet_age(raw TEXT, at_time TIMESTAMPTZ)
RETURNS INT AS $$
  SELECT CASE
    WHEN age_val BETWEEN 16 AND 90 THEN age_val
  END
  FROM (
    SELECT CASE
      -- '34', '59 years' — a plausible age on its own
      WHEN trim(coalesce(raw,'')) ~ '^[0-9]{1,3}( *years?)?$'
        THEN substring(trim(raw) from '^[0-9]{1,3}')::int
      -- anything containing a standalone 19xx / 20xx
      WHEN raw ~ '\y(19|20)[0-9]{2}\y'
        THEN EXTRACT(YEAR FROM at_time)::int
             - substring(raw from '\y((?:19|20)[0-9]{2})\y')::int
    END AS age_val
  ) v
$$ LANGUAGE SQL IMMUTABLE;

CREATE OR REPLACE FUNCTION fleet_age_band(age INT)
RETURNS TEXT AS $$
  SELECT CASE
    WHEN age IS NULL   THEN NULL
    WHEN age < 25      THEN 'Under 25'
    WHEN age <= 34     THEN '25-34'
    WHEN age <= 44     THEN '35-44'
    WHEN age <= 54     THEN '45-54'
    ELSE '55 and over'
  END
$$ LANGUAGE SQL IMMUTABLE;

CREATE OR REPLACE FUNCTION fleet_sex(raw TEXT)
RETURNS TEXT AS $$
  SELECT CASE lower(trim(coalesce(raw,'')))
    WHEN ''       THEN NULL
    WHEN 'male'   THEN 'Male'
    WHEN 'm'      THEN 'Male'
    WHEN 'female' THEN 'Female'
    WHEN 'f'      THEN 'Female'
    ELSE NULL   -- anything else is an extraction artefact, not a third value
  END
$$ LANGUAGE SQL IMMUTABLE;

-- ---------------------------------------------------------------------------
-- fleet_rank — a job title, grouped the way the printed report groups it
--
-- Three buckets, because the useful question is "is it the officers or the
-- deck crew getting hurt", not "which of the twelve job titles". Grouping also
-- does the privacy work: 'welder' appears once in the entire database.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fleet_rank(raw TEXT)
RETURNS TEXT AS $$
  SELECT CASE
    WHEN trim(coalesce(raw,'')) = '' THEN NULL
    WHEN lower(raw) ~ '(tourist|guest|passenger)'                        THEN 'Passenger or guest'
    WHEN lower(raw) ~ '(officer|engineer|captain|master|mate|chief|cook)' THEN 'Officer'
    ELSE 'Crew'
  END
$$ LANGUAGE SQL IMMUTABLE;

-- Nationalities arrive as a mix of the country and the demonym: 'China' beside
-- 'Chinese'. Only the ones the data actually contains are folded.
CREATE OR REPLACE FUNCTION fleet_nationality(raw TEXT)
RETURNS TEXT AS $$
  SELECT CASE initcap(trim(coalesce(raw,'')))
    WHEN ''            THEN NULL
    WHEN 'China'       THEN 'Chinese'
    WHEN 'Poland'      THEN 'Polish'
    WHEN 'Denmark'     THEN 'Danish'
    WHEN 'Norway'      THEN 'Norwegian'
    WHEN 'Germany'     THEN 'German'
    WHEN 'Philippines' THEN 'Filipino'
    ELSE initcap(trim(raw))
  END
$$ LANGUAGE SQL IMMUTABLE;

-- Was a captured reading outside the reference range? NULL when not captured,
-- so "not measured" and "measured and normal" never collapse together. The
-- ranges are the ones the printed report states.
CREATE OR REPLACE FUNCTION fleet_abnormal(v NUMERIC, lo NUMERIC, hi NUMERIC)
RETURNS BOOLEAN AS $$
  SELECT CASE WHEN v IS NULL THEN NULL ELSE (v < lo OR v > hi) END
$$ LANGUAGE SQL IMMUTABLE;

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

  CASE
    WHEN c.last_message_at > c.created_at
     AND c.last_message_at < c.created_at + INTERVAL '4 hours'
    THEN ROUND(EXTRACT(EPOCH FROM (c.last_message_at - c.created_at)) / 60.0, 1)
  END                                    AS duration_minutes,

  (COALESCE(NULLIF(c.extracted_summary->>'circulation_pulse_per_min',''),
            NULLIF(c.extracted_summary->>'circulation_systole',''),
            NULLIF(c.extracted_summary->>'breathing_oxygen_saturation',''),
            NULLIF(c.extracted_summary->>'breathing_num_breaths_per_min',''),
            NULLIF(c.extracted_summary->>'expose_temperature_measured_mouth','')
   ) IS NOT NULL)                        AS has_vitals,

  CASE
    WHEN fleet_pathway(c.chief_symptom) = 'Unclassified' THEN NULL
    WHEN fleet_pathway(c.chief_symptom) IN (
      'Laceration or Open Wounds', 'Burns and Chemical Injuries',
      'Musculoskeletal injuries', 'Trauma', 'Eye Foreign Body',
      'Drowning or Near Drowning', 'Cold Exposure/Hypothermia',
      'Heat Stroke/Heat Exhaustion')                      THEN TRUE
    ELSE FALSE
  END                                    AS is_injury,

  normalise_port(c.extracted_summary->>'nearestPort')    AS nearest_port,
  normalise_port(c.extracted_summary->>'destination')    AS destination,

  md5(u.id::text || ':' || COALESCE(u.org_id::text, '')) AS account_ref,

  (NULLIF(c.extracted_summary->>'circulation_pulse_per_min','') IS NOT NULL)         AS vital_pulse,
  (NULLIF(c.extracted_summary->>'circulation_systole','') IS NOT NULL)               AS vital_bp,
  (NULLIF(c.extracted_summary->>'breathing_num_breaths_per_min','') IS NOT NULL)     AS vital_resp,
  (NULLIF(c.extracted_summary->>'breathing_oxygen_saturation','') IS NOT NULL)       AS vital_spo2,
  (NULLIF(c.extracted_summary->>'expose_temperature_measured_mouth','') IS NOT NULL) AS vital_temp,

  (NULLIF(c.extracted_summary->>'pastHistory','') IS NOT NULL)        AS has_past_history,
  (NULLIF(c.extracted_summary->>'allergies','') IS NOT NULL)          AS has_allergies,
  (NULLIF(c.extracted_summary->>'currentMedications','') IS NOT NULL) AS has_medications,

  (COALESCE(NULLIF(trim(c.extracted_summary->>'location'), ''),
            NULLIF(trim(c.extracted_summary->>'nearestPort'), '')) IS NOT NULL) AS has_location,

  CASE WHEN c.extracted_summary IS NOT NULL
        AND (NULLIF(c.extracted_summary->>'avpu','') IS NOT NULL
          OR NULLIF(c.extracted_summary->>'circulation_pulse_per_min','') IS NOT NULL
          OR NULLIF(c.extracted_summary->>'circulation_systole','') IS NOT NULL
          OR NULLIF(c.extracted_summary->>'breathing_oxygen_saturation','') IS NOT NULL
          OR NULLIF(c.extracted_summary->>'breathing_num_breaths_per_min','') IS NOT NULL
          OR NULLIF(c.extracted_summary->>'expose_temperature_measured_mouth','') IS NOT NULL)
       THEN fleet_mews(c.extracted_summary) END          AS mews_score,

  CASE
    WHEN c.extracted_summary IS NULL                                THEN NULL
    WHEN COALESCE(c.extracted_summary->>'redFlag' = 'yes', FALSE)
      OR fleet_mews(c.extracted_summary) >= 4                       THEN 'emergency'
    WHEN fleet_mews(c.extracted_summary) >= 2                       THEN 'urgent'
    WHEN fleet_mews(c.extracted_summary) = 1                        THEN 'standard'
    ELSE 'low'
  END                                    AS urgency,

  -- ---- added in 022 ------------------------------------------------------
  -- Fleet-wide only, and the API refuses to show any category with fewer than
  -- its minimum cell size. Never grouped with vessel_name.
  fleet_age_band(fleet_age(c.extracted_summary->>'dateOfBirth', c.created_at)) AS age_band,
  fleet_sex(c.extracted_summary->>'gender')                    AS sex,
  fleet_rank(c.extracted_summary->>'position')                 AS rank_group,
  fleet_nationality(c.extracted_summary->>'patientNationality') AS nationality,

  -- Was a captured reading outside the normal range. NULL when not captured.
  fleet_abnormal(fleet_num(c.extracted_summary->>'circulation_pulse_per_min'), 51, 90)        AS abnormal_pulse,
  fleet_abnormal(fleet_num(c.extracted_summary->>'circulation_systole'), 111, 180)            AS abnormal_bp,
  fleet_abnormal(fleet_num(c.extracted_summary->>'breathing_num_breaths_per_min'), 12, 20)    AS abnormal_resp,
  fleet_abnormal(fleet_num(c.extracted_summary->>'breathing_oxygen_saturation'), 96, 100)     AS abnormal_spo2,
  fleet_abnormal(fleet_num(c.extracted_summary->>'expose_temperature_measured_mouth'), 35.6, 38.0) AS abnormal_temp

FROM conversations c
JOIN users u ON u.id = c.user_id
LEFT JOIN vessels uv ON uv.id = u.vessel_id
LEFT JOIN vessel_aliases a
       ON a.org_id = u.org_id
      AND a.alias  = normalise_vessel_name(u.ship_name)
LEFT JOIN vessels av ON av.id = a.vessel_id;

COMMENT ON VIEW v_fleet_activity IS
  'Non-clinical per-session activity for fleet reporting. Demographics (age band, sex, rank, nationality) are fleet-wide only and subject to minimum-cell suppression in the API; they are never grouped with vessel_name. No patient identifier, no free-text symptom, no transcript, and no vital-sign values — only whether each measurement was taken and whether it was outside the normal range.';
