-- Migration 005: Distinguish Marina interview rows from note-taker rows
-- Note-taker conversations are minted at extract time (no state, no chat
-- round-trip). Marina conversations are minted on the first interview turn
-- and round-trip state on every chat call.

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS mode VARCHAR(20) NOT NULL DEFAULT 'marina';

ALTER TABLE conversations
  DROP CONSTRAINT IF EXISTS conversations_mode_check;
ALTER TABLE conversations
  ADD CONSTRAINT conversations_mode_check
  CHECK (mode IN ('marina', 'note_taker'));
