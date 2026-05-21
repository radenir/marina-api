-- Migration 013: Add 'translator' to the conversations.mode CHECK constraint.
-- Translator sessions use PTT (push-to-talk) on top of the same persistence
-- path as note-taker; tracking them as a distinct mode lets resumed sessions
-- come back with the correct mic UI.

ALTER TABLE conversations
  DROP CONSTRAINT IF EXISTS conversations_mode_check;
ALTER TABLE conversations
  ADD CONSTRAINT conversations_mode_check
  CHECK (mode IN ('marina', 'note_taker', 'translator'));
