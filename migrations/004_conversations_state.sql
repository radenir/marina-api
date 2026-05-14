-- Migration 004: Persist full InterviewState on conversations
-- Required to resume an unfinished interview. The existing projected
-- columns (interview_stage, vital_signs, examination_progress, languages,
-- chief_symptom) are insufficient — runAgent needs the full state including
-- variables.* (historyTaking, associatedSymtpoms, ...), data.investigations,
-- turnsInStage, done, report.

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS state         JSONB,
  ADD COLUMN IF NOT EXISTS state_version SMALLINT NOT NULL DEFAULT 1;
