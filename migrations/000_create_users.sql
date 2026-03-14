-- Migration 000: Base users table
CREATE TABLE IF NOT EXISTS users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email             VARCHAR(255) NOT NULL UNIQUE,
  password_hash     TEXT NOT NULL,
  full_name         VARCHAR(255),
  role              VARCHAR(50) NOT NULL DEFAULT 'user',
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
