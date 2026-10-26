-- Migration 027: examination photos analysed by /ai/exam-media
--
-- One row per photo the officer takes for an examination. It holds what the
-- vision model answered (ai_answers) and, once the officer has checked them,
-- what was confirmed (confirmed_answers). Only confirmed answers ever reach a
-- report: /v2/ai/extract reads confirmed rows and writes them into "exam".
--
-- Keeping the AI answer next to the officer's final answer, with
-- officer_edited, is deliberate: it is the accuracy record for the vision
-- model, and the clinical evidence the MDR change will need.
--
-- The photo itself is NOT stored yet — only its SHA-256, so a row can be tied
-- to the image the client still holds. Photo storage (EU object storage,
-- encrypted, with a retention period) is a separate step.
--
-- conversation_id is nullable because a note-taker photo can be taken before
-- the conversation row exists; /v2/ai/extract links it when it persists one.
--
-- ADDITIVE. A new, empty table; no existing table is altered. The foreign keys
-- take a brief lock on users and conversations, so lock_timeout for the same
-- reason as 025: fail fast rather than queue behind a long read and block
-- every login.

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS exam_media (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id    UUID REFERENCES conversations(id) ON DELETE SET NULL,

  examination_id     INTEGER NOT NULL,
  shot_id            VARCHAR(50) NOT NULL,

  mime_type          VARCHAR(50) NOT NULL,
  byte_size          INTEGER NOT NULL,
  sha256             CHAR(64) NOT NULL,

  model              VARCHAR(100) NOT NULL,
  quality_ok         BOOLEAN NOT NULL,
  quality_reason     TEXT,
  ai_answers         JSONB NOT NULL DEFAULT '[]'::jsonb,

  confirmed_answers  JSONB,
  officer_edited     BOOLEAN,
  confirmed_at       TIMESTAMP WITH TIME ZONE,

  created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exam_media_user_id
  ON exam_media(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exam_media_conversation_id
  ON exam_media(conversation_id)
  WHERE conversation_id IS NOT NULL;
