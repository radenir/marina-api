-- Migration 025: keep the report's SYBRA score
--
-- The ship app scores every report live — eight judges, a percentage per
-- section, one headline — shows it to the officer, and throws it away. Nothing
-- is stored, so a fleet office cannot be told anything about how good its
-- records are.
--
-- This adds one column to hold it, and exposes it to the fleet view.
--
-- What is stored is the CLINICAL score: the mean of the eight judged sections.
-- The ship app's headline is a mean over every field on the report, so it folds
-- the call sign and the report date in with the medical content — right for an
-- officer filling a form, wrong for a fleet report, and reproducing it here
-- would mean porting report-schema.ts into this repo. A second copy of a
-- definition is exactly what put a wrong M-EWS on this dashboard earlier today.
--
-- ADDITIVE, but not free like 018-024: this is the first ALTER TABLE in the
-- series and it takes an ACCESS EXCLUSIVE lock on `conversations` until the
-- transaction commits. A nullable JSONB column with no default is a
-- catalogue-only change — no table rewrite, no row touched — so the lock is
-- held for milliseconds. lock_timeout fails fast rather than queueing behind a
-- long-running query and blocking every read and write to conversations.

SET LOCAL lock_timeout = '5s';

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS report_score JSONB;

-- Only scored rows, because most rows will never have one.
CREATE INDEX IF NOT EXISTS idx_conversations_report_score
  ON conversations((( report_score->>'clinical' )::int))
  WHERE report_score IS NOT NULL;

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
  ) END                                                                      AS sections,

  -- ---- added in 025 ------------------------------------------------------
  -- The SYBRA clinical score, 0-100: the mean of the eight judged sections.
  -- NULL when the report has not been scored — which is every report written
  -- before this migration, until the backfill runs for that fleet.
  (c.report_score->>'clinical')::int                                         AS quality_score,
  -- How many of the eight judges were unreachable when this was scored. A
  -- score built on five verdicts is not the same claim as one built on eight,
  -- and the dashboard says so.
  COALESCE(jsonb_array_length(c.report_score->'unknown'), 0)                 AS quality_unknown

FROM conversations c
JOIN users u ON u.id = c.user_id
LEFT JOIN vessels uv ON uv.id = u.vessel_id
LEFT JOIN vessel_aliases a
       ON a.org_id = u.org_id
      AND a.alias  = normalise_vessel_name(u.ship_name)
LEFT JOIN vessels av ON av.id = a.vessel_id;

COMMENT ON VIEW v_fleet_activity IS
  'Non-clinical per-session activity for fleet reporting. Demographics are counted per apparent patient (patient_key), never per report, and a report with no name and no date of birth is excluded from them entirely. patient_key is a one-way hash and is never returned by the API. No free-text symptom, no transcript, no vital-sign values.';
