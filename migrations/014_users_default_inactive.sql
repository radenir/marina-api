-- Migration 014: New users must be activated by an admin before they can use
-- the app. Flip the is_active default to FALSE so freshly registered accounts
-- start inactive and wait for manual activation.
--
-- Existing rows are left untouched, so all current users remain active. To
-- activate a pending user by hand:
--   UPDATE users SET is_active = TRUE WHERE email = 'someone@example.com';
ALTER TABLE users ALTER COLUMN is_active SET DEFAULT FALSE;
