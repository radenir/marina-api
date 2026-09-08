-- Migration 018: Fleet activity — what the office can actually be told today
--
-- The Fleet Dashboard was built on `cases`: open, overdue, closed, outcome.
-- Production contains 264 cases and every one of them is still `recording`,
-- because no client has ever called PATCH /cases/:id. Zero rows in
-- case_decisions. So every number on that board is a number about a workflow
-- nobody performs.
--
-- What *is* populated is a thousand sessions: which ship, which month, which
-- language, which complaint, whether a red flag was raised. That is a real
-- fleet report, and it needs no new behaviour from any officer. This migration
-- makes it queryable.
--
-- STRICTLY ADDITIVE. One new table, two functions, one view. No existing table
-- is altered, no column dropped or re-typed, no row modified. Safe to apply
-- while the API is serving.

SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- normalise_vessel_name — the mechanical half of vessel identity
--
-- users.ship_name is free text and it shows: 'ESVAGT Dana', 'Esvagt Dana ',
-- 'Svagt Dana' and 'MV Esvagt Aurora' are four spellings of two ships. This
-- collapses the differences a machine can be sure about — surrounding space,
-- case, the 'MV'/'MS'/'SS' prefix, and a leading company name.
--
-- It deliberately does NOT guess at typos. 'Esvagt Crapri' is almost certainly
-- 'Capri', but almost certainly is not good enough to merge two ships' medical
-- activity: that needs a human, which is what vessel_aliases is for.
--
-- KNOWN LIMITATION, and the reason vessel_aliases outranks this function:
-- stripping the type prefix merges 'SS Marina' and 'MV Marina' into one ship.
-- Real fleets need the stripping far more often than they hit the collision —
-- the same officer writes 'Esvagt Aurora' one week and 'MV Esvagt Aurora' the
-- next — so the default is to strip, and seed-organisation.ts reports every
-- collision it would cause so a person can resolve it with an alias.
--
-- IMMUTABLE so it can be used in an index later if these tables grow.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION normalise_vessel_name(raw TEXT)
RETURNS TEXT AS $$
  SELECT NULLIF(
           initcap(
             trim(
               regexp_replace(
                 regexp_replace(
                   -- collapse runs of whitespace
                   regexp_replace(coalesce(raw, ''), '\s+', ' ', 'g'),
                   -- drop a leading vessel-type prefix
                   '^\s*(M/?V|M/?S|S/?S|MT)\s+', '', 'i'),
                 -- drop a leading owner name; the fleet is the scope already
                 '^\s*(ESVAGT|DFDS|MAERSK|TORM)\s+', '', 'i')
             )
           ),
           '')
$$ LANGUAGE SQL IMMUTABLE;

-- ---------------------------------------------------------------------------
-- vessel_aliases — the human half
--
-- One row per spelling a person has confirmed belongs to a vessel. This is the
-- place for 'Crapri' -> Capri, and equally for the entries that are not ships
-- at all: 'ESVAGT OFFICE' and 'Esvagt A/S' both appear in ship_name, and
-- counting them as vessels would invent two ships that do not exist.
--
-- is_vessel = false is how a label is excluded without deleting the sessions:
-- the activity is real and still counts fleet-wide, it simply has no ship.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vessel_aliases (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,

  -- The normalised form of what someone typed, so one row covers every
  -- casing and spacing variant of the same mistake.
  alias      TEXT NOT NULL,

  -- What it should be called. NULL together with is_vessel = false means
  -- "this was never a ship".
  vessel_id  UUID REFERENCES vessels(id) ON DELETE SET NULL,
  is_vessel  BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT vessel_aliases_unique UNIQUE (org_id, alias)
);

CREATE INDEX IF NOT EXISTS idx_vessel_aliases_org ON vessel_aliases(org_id, alias);

-- ---------------------------------------------------------------------------
-- fleet_pathway — the only clinical vocabulary the office ever sees
--
-- conversations.chief_symptom is whatever the transcriber heard first. 46% of
-- it is not a symptom at all: '[silence]', 'Hi', 'Dooby, dooby, dooby', and
-- — eight times — 'Jeg er Marina, din medicinske stemme', which is Marina's
-- own greeting captured as the patient's complaint.
--
-- So the office is shown a value ONLY when it matches one of the 44 named
-- pathways in src/lib/symptomGuidelines.ts. Everything else becomes
-- 'Unclassified' and is counted as such on the page, which is the honest
-- answer and also the safe one: a free-text symptom is the patient's own
-- words, and those must never reach their employer.
--
-- Keeping the list here rather than in TypeScript means the redaction happens
-- in the database, so a careless query cannot route around it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fleet_pathway(raw TEXT)
RETURNS TEXT AS $$
  SELECT COALESCE(
    (SELECT p FROM unnest(ARRAY[
      'Abdominal Pain','Fever','Chest pain','Headache','Nausea and Vomiting',
      'Back Pain','Cough/Respiratory Symptoms','Dizziness/Vertigo',
      'Skin Infections/Rash','Dental Pain','Laceration or Open Wounds',
      'Burns and Chemical Injuries','Eye Pain','Ear Pain or Hearing Problems',
      'Urinary Symptoms','Shortness of Breath','Joint Pain or Swelling',
      'Fatigue or Exhaustion','Diarrhea','Psychological Stress or Anxiety',
      'Unspecific Symptoms','Anaphylaxis and Allergic Reactions',
      'Palpitations or Irregular Heartbeat','Altered Consciousness or Confusion',
      'Mental Health Crisis','Syncope or Presyncope','Trauma',
      'Cold Exposure/Hypothermia','Heat Stroke/Heat Exhaustion','Tropical Disease',
      'Poisoning/Overdose','Musculoskeletal injuries','Eye Foreign Body','Nosebleed',
      'Sexually Transmitted Diseases','Female Health','Diabetic complications',
      'Drowning or Near Drowning','Throat Pain and Sore Throat',
      'Red Eye and Discharge','Neurological symptoms','Obstipation','Sea Sickness',
      'Sleeplessness / Insomnia'
    ]) AS p
     WHERE lower(p) = lower(trim(coalesce(raw, '')))
     LIMIT 1),
    'Unclassified')
$$ LANGUAGE SQL IMMUTABLE;

-- ---------------------------------------------------------------------------
-- normalise_language — 'en' and 'English' are one language
--
-- The client has sent both an ISO code and an English name at different points
-- in its life, so every language chart double-counts without this.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION normalise_language(raw TEXT)
RETURNS TEXT AS $$
  SELECT CASE lower(trim(coalesce(raw, '')))
    WHEN ''          THEN NULL
    WHEN 'en'        THEN 'English'
    WHEN 'english'   THEN 'English'
    WHEN 'da'        THEN 'Danish'
    WHEN 'danish'    THEN 'Danish'
    WHEN 'pl'        THEN 'Polish'
    WHEN 'polish'    THEN 'Polish'
    WHEN 'de'        THEN 'German'
    WHEN 'german'    THEN 'German'
    WHEN 'es'        THEN 'Spanish'
    WHEN 'spanish'   THEN 'Spanish'
    WHEN 'ru'        THEN 'Russian'
    WHEN 'russian'   THEN 'Russian'
    WHEN 'zh'        THEN 'Chinese'
    WHEN 'chinese'   THEN 'Chinese'
    WHEN 'tl'        THEN 'Tagalog'
    WHEN 'tagalog'   THEN 'Tagalog'
    WHEN 'te'        THEN 'Telugu'
    WHEN 'ta'        THEN 'Tamil'
    WHEN 'tamil'     THEN 'Tamil'
    WHEN 'bg'        THEN 'Bulgarian'
    WHEN 'ar'        THEN 'Arabic'
    WHEN 'arabic'    THEN 'Arabic'
    WHEN 'my'        THEN 'Burmese'
    WHEN 'fr'        THEN 'French'
    WHEN 'pt'        THEN 'Portuguese'
    WHEN 'uk'        THEN 'Ukrainian'
    WHEN 'ro'        THEN 'Romanian'
    WHEN 'hi'        THEN 'Hindi'
    ELSE initcap(trim(raw))
  END
$$ LANGUAGE SQL IMMUTABLE;

-- ---------------------------------------------------------------------------
-- v_fleet_activity — one row per session, and nothing the office may not see
--
-- Same guarantee as v_fleet_cases: the clinical columns are not reachable from
-- here, rather than merely not selected. Deliberately absent — patient names,
-- date of birth, nationality, the raw chief_symptom, the extracted report, the
-- message transcript, vital signs.
--
-- Present, and all of it non-identifying: which fleet, which ship, which
-- month, which mode, which languages, which pathway, and whether the session
-- raised a red flag or produced a finished report.
--
-- Organisation is resolved by org_id when it has been seeded, and otherwise
-- falls back to the free text in users.company. The fallback is what lets a
-- fleet be reported on before anyone has been attached to an organisation —
-- and it disappears on its own, correctly, once they have been.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_fleet_activity AS
SELECT
  c.id                                   AS conversation_id,
  u.org_id,
  -- Two transitional matching keys, used only when org_id is null and never
  -- shown to anyone. They exist so a fleet can be reported on before anyone
  -- has been attached to an organisation, and they stop being consulted the
  -- moment seed-organisation.ts has run.
  --
  -- The company key alone is not enough: Esvagt's own people typed 'Esvagt',
  -- 'Esvagt A/S', 'ESVAGT A/S', 'Esvagt AS' and 'Esvagt ' — and two of them
  -- left it blank. The email domain is the stable half.
  lower(regexp_replace(coalesce(u.company, ''), '[^a-zA-Z]', '', 'g')) AS company_key,
  lower(split_part(coalesce(u.email, ''), '@', 2))                     AS email_domain,

  -- Vessel: the alias table wins, the mechanical normalisation is the
  -- fallback, and an alias marked is_vessel = false erases the label without
  -- losing the session.
  --
  -- Both branches are normalised, so a ship resolved through the alias table
  -- is labelled the same way as one resolved mechanically. Without this, a
  -- fleet reads 'Dana', 'Dee', 'Esvagt Capri' — and the odd one out looks like
  -- a different ship rather than the same ship spelled once by a human.
  --
  -- Dropping the owner prefix is right here specifically because the screen is
  -- always scoped to one company: repeating 'Esvagt' down eleven rows is noise
  -- to the only people who will ever read it.
  CASE
    WHEN a.id IS NOT NULL AND NOT a.is_vessel THEN NULL
    WHEN v.name IS NOT NULL                   THEN normalise_vessel_name(v.name)
    ELSE normalise_vessel_name(u.ship_name)
  END                                    AS vessel_name,
  v.id                                   AS vessel_id,

  date_trunc('month', c.created_at)::date AS month,
  c.created_at,
  c.mode,

  normalise_language(c.patient_language)         AS patient_language,
  normalise_language(c.medical_officer_language) AS officer_language,

  fleet_pathway(c.chief_symptom)         AS pathway,

  -- A red flag is the Advisor's own judgement, already recorded. It is a count
  -- of how often something serious came up, never what it was.
  -- COALESCE, not a bare comparison: a session with no report has not raised a
  -- red flag, and NULL here would drop it out of every count that sums this.
  COALESCE(c.extracted_summary->>'redFlag' = 'yes', FALSE) AS red_flag,
  (c.extracted_summary IS NOT NULL)                        AS has_report,

  -- A session with a couple of turns is someone opening the app. The threshold
  -- keeps "how much is this being used" from being flattered by taps.
  COALESCE(jsonb_array_length(c.messages) > 4, FALSE)      AS substantive

FROM conversations c
JOIN users u ON u.id = c.user_id
LEFT JOIN vessel_aliases a
       ON a.org_id = u.org_id
      AND a.alias  = normalise_vessel_name(u.ship_name)
LEFT JOIN vessels v ON v.id = a.vessel_id;

COMMENT ON VIEW v_fleet_activity IS
  'Non-clinical per-session activity for fleet reporting. Contains no patient identifiers, no free-text symptom, no transcript and no vitals.';
