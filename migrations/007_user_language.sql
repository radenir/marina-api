-- Migration 007: User UI language preference
-- Adds a nullable ISO 639-1 language code (e.g. 'en', 'pl') so each user can
-- pick the language they want the app rendered in. NULL means "no preference"
-- and the frontend falls back to English.

ALTER TABLE users ADD COLUMN IF NOT EXISTS language VARCHAR(8);
