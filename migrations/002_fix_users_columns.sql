-- Migration 002: Fix column names to match application expectations
ALTER TABLE users RENAME COLUMN password_hash TO password;
ALTER TABLE users RENAME COLUMN full_name TO name;
