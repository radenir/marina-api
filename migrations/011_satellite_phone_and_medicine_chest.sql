-- Vessel-level attributes that are static for a given user/ship. Storing them
-- on the profile lets the report form pre-fill them on every new report.
ALTER TABLE users ADD COLUMN IF NOT EXISTS satellite_phone VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS medicine_chest  VARCHAR(50);
