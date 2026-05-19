-- Rename imo_number -> call_sign (the data in this column was almost always
-- a call sign anyway; the label was wrong). Add first_name / last_name so the
-- medical officer's name can be split for use in the report.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'imo_number'
  ) THEN
    ALTER TABLE users RENAME COLUMN imo_number TO call_sign;
  END IF;
END $$;

ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name  VARCHAR(100);

-- Best-effort backfill for existing rows: split `name` on the first space.
UPDATE users
SET    first_name = split_part(name, ' ', 1),
       last_name  = NULLIF(substring(name FROM position(' ' IN name) + 1), '')
WHERE  name IS NOT NULL
  AND  first_name IS NULL
  AND  position(' ' IN name) > 0;

-- Where the name is a single token, treat it as first_name only.
UPDATE users
SET    first_name = name
WHERE  name IS NOT NULL
  AND  first_name IS NULL;
