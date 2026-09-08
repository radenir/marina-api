-- Migration 021: urgency, capture rates, and readable port names
--
-- The last of the printed report's figures that a fleet office can safely have.
--
-- ---------------------------------------------------------------------------
-- A warning about fleet_mews()
--
-- src/lib/mewsCalculator.ts is the authoritative M-EWS implementation. It is
-- marked CLASS A COMPLIANT and it is what the ship app shows an officer. The
-- function below is a SECOND implementation of the same thresholds in SQL, and
-- two copies of a clinical scoring rule is a hazard: change one, and the
-- dashboard quietly disagrees with the app about how sick someone was.
--
-- It exists because the score is not stored anywhere — it is computed in
-- TypeScript at display time and thrown away — and a view cannot call into the
-- application. The alternative was to persist the score at extraction and
-- backfill 852 reports, which is the better answer and a larger change.
--
-- tests/e2e/verify-mews-parity.ts checks the two against each other across the
-- boundary of every band. If that test fails, the TypeScript is right and this
-- is wrong.
--
-- STRICTLY ADDITIVE: new functions, and a view whose existing columns keep
-- their names, types and order.

-- ---------------------------------------------------------------------------
-- Reading a number out of a free-text vital.
--
-- These fields hold whatever the extraction produced: "72", "72 bpm", "36.8".
-- Take the leading number and nothing else, so "120/80" cannot become 12080.
-- ---------------------------------------------------------------------------
-- The group is non-capturing on purpose. Postgres `substring(x from pattern)`
-- returns the FIRST CAPTURE GROUP when the pattern has one, not the whole
-- match — so '^[0-9]+(\.[0-9]+)?' turns '135' into NULL and '39.8' into '.8',
-- and every M-EWS score computed from it is silently wrong. Caught by
-- tests/e2e/verify-mews-parity.ts, which is the entire reason it exists.
CREATE OR REPLACE FUNCTION fleet_num(raw TEXT)
RETURNS NUMERIC AS $$
  SELECT NULLIF(substring(trim(coalesce(raw, '')) from '^[0-9]+(?:\.[0-9]+)?'), '')::numeric
$$ LANGUAGE SQL IMMUTABLE;

-- ---------------------------------------------------------------------------
-- fleet_mews — mirrors calculateMEWS() in src/lib/mewsCalculator.ts.
--
-- A missing vital scores 0 there, so it scores 0 here: the total is therefore
-- a floor, not an estimate, and a report with no vitals at all scores 0 rather
-- than "unknown". That is why the view also exposes has_vitals — a 0 from
-- measurements and a 0 from silence must not be read the same way.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fleet_mews(summary JSONB)
RETURNS INT AS $$
  SELECT
    -- heart rate
    CASE WHEN hr IS NULL THEN 0
         WHEN hr < 41 THEN 2 WHEN hr <= 50 THEN 1 WHEN hr <= 90 THEN 0
         WHEN hr <= 110 THEN 1 WHEN hr <= 130 THEN 2 ELSE 3 END
  + -- respiratory rate
    CASE WHEN rr IS NULL THEN 0
         WHEN rr < 9 THEN 3 WHEN rr < 12 THEN 1 WHEN rr <= 20 THEN 0
         WHEN rr <= 24 THEN 2 ELSE 3 END
  + -- temperature
    CASE WHEN tp IS NULL THEN 0
         WHEN tp < 35.0 THEN 3 WHEN tp <= 35.5 THEN 1 WHEN tp <= 38.0 THEN 0
         WHEN tp <= 39.0 THEN 1 WHEN tp <= 39.5 THEN 2 ELSE 3 END
  + -- systolic blood pressure
    CASE WHEN bp IS NULL THEN 0
         WHEN bp < 91 THEN 3 WHEN bp <= 100 THEN 2 WHEN bp <= 110 THEN 1
         WHEN bp <= 180 THEN 0 WHEN bp <= 219 THEN 2 ELSE 3 END
  + -- oxygen saturation
    CASE WHEN sp IS NULL THEN 0
         WHEN sp < 92 THEN 3 WHEN sp < 94 THEN 2 WHEN sp <= 95 THEN 1 ELSE 0 END
  + -- consciousness (AVPU): anything but Alert scores 3
    CASE WHEN av IS NULL OR av = '' THEN 0
         WHEN lower(av) = 'alert' THEN 0 ELSE 3 END
  FROM (SELECT
     fleet_num(summary->>'circulation_pulse_per_min')          AS hr,
     fleet_num(summary->>'breathing_num_breaths_per_min')      AS rr,
     fleet_num(summary->>'expose_temperature_measured_mouth')  AS tp,
     fleet_num(summary->>'circulation_systole')                AS bp,
     fleet_num(summary->>'breathing_oxygen_saturation')        AS sp,
     trim(coalesce(summary->>'avpu', ''))                      AS av
  ) v
$$ LANGUAGE SQL IMMUTABLE;

-- ---------------------------------------------------------------------------
-- normalise_port — a UN/LOCODE is not a place name to a human reader.
--
-- The data holds both: 'NLRTM' 58 times and 'Rotterdam' 29, which are the same
-- port counted twice. src/lib/portIndex.ts has the full index, but a view
-- cannot reach it, so this is a starter list covering every code the data
-- actually contains. Extend it as new codes appear; anything unknown is
-- returned tidied rather than dropped.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION normalise_port(raw TEXT)
RETURNS TEXT AS $$
  SELECT CASE upper(trim(coalesce(raw, '')))
    WHEN ''      THEN NULL
    WHEN 'NLRTM' THEN 'Rotterdam'
    WHEN 'DEHAM' THEN 'Hamburg'
    WHEN 'DKODE' THEN 'Odense'
    WHEN 'DKEBJ' THEN 'Esbjerg'
    WHEN 'DKFDH' THEN 'Frederikshavn'
    WHEN 'DKCPH' THEN 'Copenhagen'
    WHEN 'DKAAR' THEN 'Aarhus'
    WHEN 'ESBCN' THEN 'Barcelona'
    WHEN 'PLGDN' THEN 'Gdansk'
    WHEN 'THBKK' THEN 'Bangkok'
    WHEN 'USSFO' THEN 'San Francisco'
    WHEN 'INCCU' THEN 'Kolkata'
    WHEN 'NOSVG' THEN 'Stavanger'
    WHEN 'GBEDI' THEN 'Edinburgh'
    WHEN 'ISREY' THEN 'Reykjavik'
    -- Not a code: tidy the spelling and drop a trailing "Havn"/"Port", so
    -- 'Odense', 'Odense Port' and 'DKODE' are one place.
    ELSE initcap(trim(regexp_replace(trim(raw), '\s+(havn|port)$', '', 'i')))
  END
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

  -- ---- added in 021 ------------------------------------------------------

  -- Which measurements were taken. Flags, never values.
  (NULLIF(c.extracted_summary->>'circulation_pulse_per_min','') IS NOT NULL)         AS vital_pulse,
  (NULLIF(c.extracted_summary->>'circulation_systole','') IS NOT NULL)               AS vital_bp,
  (NULLIF(c.extracted_summary->>'breathing_num_breaths_per_min','') IS NOT NULL)     AS vital_resp,
  (NULLIF(c.extracted_summary->>'breathing_oxygen_saturation','') IS NOT NULL)       AS vital_spo2,
  (NULLIF(c.extracted_summary->>'expose_temperature_measured_mouth','') IS NOT NULL) AS vital_temp,

  -- Whether the interview came back with an answer at all, including an
  -- explicit "none". The rate says whether the interview is being completed;
  -- the content stays where it belongs.
  (NULLIF(c.extracted_summary->>'pastHistory','') IS NOT NULL)        AS has_past_history,
  (NULLIF(c.extracted_summary->>'allergies','') IS NOT NULL)          AS has_allergies,
  (NULLIF(c.extracted_summary->>'currentMedications','') IS NOT NULL) AS has_medications,

  -- Whether the report said where the ship was, at all. Coverage, not a place.
  (COALESCE(NULLIF(trim(c.extracted_summary->>'location'), ''),
            NULLIF(trim(c.extracted_summary->>'nearestPort'), '')) IS NOT NULL) AS has_location,

  -- The score, and the band it falls in. NULL when nothing was measured and
  -- the patient's consciousness was never recorded — a report with no
  -- observations at all has no urgency to report, and calling that "Low" would
  -- be inventing reassurance.
  CASE WHEN c.extracted_summary IS NOT NULL
        AND (NULLIF(c.extracted_summary->>'avpu','') IS NOT NULL
          OR NULLIF(c.extracted_summary->>'circulation_pulse_per_min','') IS NOT NULL
          OR NULLIF(c.extracted_summary->>'circulation_systole','') IS NOT NULL
          OR NULLIF(c.extracted_summary->>'breathing_oxygen_saturation','') IS NOT NULL
          OR NULLIF(c.extracted_summary->>'breathing_num_breaths_per_min','') IS NOT NULL
          OR NULLIF(c.extracted_summary->>'expose_temperature_measured_mouth','') IS NOT NULL)
       THEN fleet_mews(c.extracted_summary) END          AS mews_score,

  -- The four bands the printed report uses, from the red flag and the score.
  CASE
    WHEN c.extracted_summary IS NULL                                THEN NULL
    WHEN COALESCE(c.extracted_summary->>'redFlag' = 'yes', FALSE)
      OR fleet_mews(c.extracted_summary) >= 4                       THEN 'emergency'
    WHEN fleet_mews(c.extracted_summary) >= 2                       THEN 'urgent'
    WHEN fleet_mews(c.extracted_summary) = 1                        THEN 'standard'
    ELSE 'low'
  END                                    AS urgency

FROM conversations c
JOIN users u ON u.id = c.user_id
LEFT JOIN vessels uv ON uv.id = u.vessel_id
LEFT JOIN vessel_aliases a
       ON a.org_id = u.org_id
      AND a.alias  = normalise_vessel_name(u.ship_name)
LEFT JOIN vessels av ON av.id = a.vessel_id;

COMMENT ON VIEW v_fleet_activity IS
  'Non-clinical per-session activity for fleet reporting. Contains no patient identifiers, no free-text symptom, no transcript, and no vital-sign values — only whether each measurement was taken, and the derived M-EWS band.';
