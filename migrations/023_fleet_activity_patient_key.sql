-- Migration 023: count patients, not reports, and only where a patient is
-- actually identifiable
--
-- ---------------------------------------------------------------------------
-- What this is fixing
--
-- Esvagt's 55 reports record sex on 45 of them: 31 female, 14 male. Printed as
-- counts, that says more than two-thirds of their patients are women.
--
-- All 31 female reports are one person. Maria Schjerbeck, born 24.07.1993, on
-- the `aurora` account — and every one was created on 26 August between 19:35
-- and 19:48. Thirty-one reports in thirteen minutes: one patient entered
-- repeatedly in a single sitting, not thirty-one encounters.
--
-- Counting reports is therefore not a safe way to describe who the patients
-- were, and neither was the previous attempt at counting accounts, which
-- counted logins and labelled them people.
--
-- ---------------------------------------------------------------------------
-- The rule
--
-- Decide report by report whether it identifies a patient, from what is
-- actually written down:
--
--   same name and date of birth on the same account  -> one patient
--   a name or date of birth seen once                -> one patient
--   neither a name nor a date of birth               -> NOT COUNTED
--
-- The third case is the important one. Twelve of Esvagt's male reports carry
-- no identifying detail at all, and there is no way to tell twelve men from
-- one man twelve times. A report that cannot identify a patient does not get
-- to describe one.
--
-- Applied to Esvagt this leaves three identifiable patients out of 55 reports,
-- which is below any threshold worth printing — so the card does not render,
-- which is the correct answer.
--
-- ---------------------------------------------------------------------------
-- patient_key is a one-way hash and is never returned by the API
--
-- It is built from the patient's name and date of birth, which are exactly the
-- fields this view exists to keep away from a fleet office. They go in, a hash
-- comes out, and only COUNT(DISTINCT) is ever done with it. Salted with the
-- organisation so the same name in two fleets does not correlate.
--
-- STRICTLY ADDITIVE: two functions and a view whose existing columns keep
-- their names, types and order.

-- Digits only, so '24.07.19.93' and '24.07.1993' — the same person, typed
-- twice — collapse to one key instead of looking like two patients.
CREATE OR REPLACE FUNCTION fleet_dob_key(raw TEXT)
RETURNS TEXT AS $$
  SELECT NULLIF(regexp_replace(coalesce(raw, ''), '[^0-9]', '', 'g'), '')
$$ LANGUAGE SQL IMMUTABLE;

CREATE OR REPLACE FUNCTION fleet_patient_key(summary JSONB, org UUID, account TEXT)
RETURNS TEXT AS $$
  SELECT CASE
    -- No name and no date of birth: this report cannot identify anybody, so it
    -- is not allowed to contribute to a description of who the patients were.
    WHEN nm = '' AND dob IS NULL THEN NULL
    ELSE md5(coalesce(org::text, '') || ':' || account || ':' || nm || ':' || coalesce(dob, ''))
  END
  FROM (
    SELECT lower(trim(coalesce(summary->>'patientFirstName', '') || ' ' ||
                      coalesce(summary->>'patientLastName', ''))) AS nm,
           fleet_dob_key(summary->>'dateOfBirth')                 AS dob
  ) v
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

  fleet_age_band(fleet_age(c.extracted_summary->>'dateOfBirth', c.created_at)) AS age_band,
  fleet_sex(c.extracted_summary->>'gender')                    AS sex,
  fleet_rank(c.extracted_summary->>'position')                 AS rank_group,
  fleet_nationality(c.extracted_summary->>'patientNationality') AS nationality,

  fleet_abnormal(fleet_num(c.extracted_summary->>'circulation_pulse_per_min'), 51, 90)        AS abnormal_pulse,
  fleet_abnormal(fleet_num(c.extracted_summary->>'circulation_systole'), 111, 180)            AS abnormal_bp,
  fleet_abnormal(fleet_num(c.extracted_summary->>'breathing_num_breaths_per_min'), 12, 20)    AS abnormal_resp,
  fleet_abnormal(fleet_num(c.extracted_summary->>'breathing_oxygen_saturation'), 96, 100)     AS abnormal_spo2,
  fleet_abnormal(fleet_num(c.extracted_summary->>'expose_temperature_measured_mouth'), 35.6, 38.0) AS abnormal_temp,

  -- ---- added in 023 ------------------------------------------------------
  -- One value per apparent patient. NULL when the report names nobody and
  -- gives no date of birth, because such a report cannot describe a person.
  -- Never returned by the API — used only in COUNT(DISTINCT).
  fleet_patient_key(c.extracted_summary, u.org_id,
                    md5(u.id::text || ':' || COALESCE(u.org_id::text, ''))) AS patient_key

FROM conversations c
JOIN users u ON u.id = c.user_id
LEFT JOIN vessels uv ON uv.id = u.vessel_id
LEFT JOIN vessel_aliases a
       ON a.org_id = u.org_id
      AND a.alias  = normalise_vessel_name(u.ship_name)
LEFT JOIN vessels av ON av.id = a.vessel_id;

COMMENT ON VIEW v_fleet_activity IS
  'Non-clinical per-session activity for fleet reporting. Demographics are counted per apparent patient (patient_key), never per report, and a report with no name and no date of birth is excluded from them entirely. patient_key is a one-way hash and is never returned by the API. No free-text symptom, no transcript, no vital-sign values.';
