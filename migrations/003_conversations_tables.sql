-- Migration 003: Conversations table
-- Persistent storage for interview conversations driven by /ai/interview/chat
-- and finalised by /ai/interview/extract. Read by reports.marinahealth.eu.

CREATE TABLE IF NOT EXISTS conversations (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  title                      VARCHAR(500),
  chief_symptom              VARCHAR(200),

  messages                   JSONB NOT NULL DEFAULT '[]'::jsonb,

  reference_notifications    JSONB,
  vital_signs                JSONB,
  interview_stage            VARCHAR(50),
  examination_progress       JSONB,

  -- Structured summary written by /ai/interview/extract.
  extracted_summary          JSONB,

  patient_language           VARCHAR(10) DEFAULT 'en',
  medical_officer_language   VARCHAR(10) DEFAULT 'en',

  created_at                 TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_message_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_id
  ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at
  ON conversations(user_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at
  ON conversations(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION update_conversations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS conversations_updated_at_trigger ON conversations;
CREATE TRIGGER conversations_updated_at_trigger
BEFORE UPDATE ON conversations
FOR EACH ROW
EXECUTE FUNCTION update_conversations_updated_at();
