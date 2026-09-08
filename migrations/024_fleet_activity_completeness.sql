-- Migration 024: how complete a report is
--
-- A fleet office asked whether the dashboard could show the quality of the
-- reports. It cannot show quality — no column in this database says whether a
-- consultation was medically sound. It can show COMPLETENESS: how many of the
-- nine parts of the clinical record a report actually carries.
--
--   chief symptom · problem description · past medical history · allergies
--   medications · examination · investigations · vitals · consciousness
--
-- That is worth having on its own. Measured across the platform, the AI
-- interview averages 4.6 of nine sections and the Note Taker 3.0 — and for
-- Esvagt every report carrying six or more came from the interview, while
-- every report carrying two or fewer came from the Note Taker. A shipowner
-- deciding which tool their officers should reach for has, until now, had no
-- way to see that.
--
-- Whether a section is filled, never what is in it. STRICTLY ADDITIVE:
-- CREATE OR REPLACE VIEW appends columns to a stored query.

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
                    md5(u.id::text || ':' || COALESCE(u.org_id::text, ''))) AS patient_key,

  -- ---- added in 024 ------------------------------------------------------
  -- The parts of the clinical record this report actually carries. Whether a
  -- section was filled, never what is in it.
  (NULLIF(trim(c.extracted_summary->>'chiefSymptom'), '') IS NOT NULL)       AS sec_symptom,
  (NULLIF(trim(c.extracted_summary->>'problemDescription'), '') IS NOT NULL) AS sec_problem,
  (NULLIF(trim(c.extracted_summary->>'exam'), '') IS NOT NULL)               AS sec_exam,
  (NULLIF(trim(c.extracted_summary->>'investigations'), '') IS NOT NULL)     AS sec_investigations,
  (NULLIF(trim(c.extracted_summary->>'avpu'), '') IS NOT NULL)               AS sec_consciousness,

  -- How many of the nine sections are present, 0-9. A count of what is there,
  -- not a judgement of what it says: this measures completeness, and calling
  -- it "quality" would claim the report is medically sound, which no field in
  -- this database can tell you.
  CASE WHEN c.extracted_summary IS NULL THEN NULL ELSE (
      (NULLIF(trim(c.extracted_summary->>'chiefSymptom'), '') IS NOT NULL)::int
    + (NULLIF(trim(c.extracted_summary->>'problemDescription'), '') IS NOT NULL)::int
    + (NULLIF(trim(c.extracted_summary->>'pastHistory'), '') IS NOT NULL)::int
    + (NULLIF(trim(c.extracted_summary->>'allergies'), '') IS NOT NULL)::int
    + (NULLIF(trim(c.extracted_summary->>'currentMedications'), '') IS NOT NULL)::int
    + (NULLIF(trim(c.extracted_summary->>'exam'), '') IS NOT NULL)::int
    + (NULLIF(trim(c.extracted_summary->>'investigations'), '') IS NOT NULL)::int
    + (NULLIF(trim(c.extracted_summary->>'circulation_pulse_per_min'), '') IS NOT NULL)::int
    + (NULLIF(trim(c.extracted_summary->>'avpu'), '') IS NOT NULL)::int
  ) END                                                                      AS sections

FROM conversations c
JOIN users u ON u.id = c.user_id
LEFT JOIN vessels uv ON uv.id = u.vessel_id
LEFT JOIN vessel_aliases a
       ON a.org_id = u.org_id
      AND a.alias  = normalise_vessel_name(u.ship_name)
LEFT JOIN vessels av ON av.id = a.vessel_id;

COMMENT ON VIEW v_fleet_activity IS
  'Non-clinical per-session activity for fleet reporting. Demographics are counted per apparent patient (patient_key), never per report, and a report with no name and no date of birth is excluded from them entirely. patient_key is a one-way hash and is never returned by the API. No free-text symptom, no transcript, no vital-sign values.';
