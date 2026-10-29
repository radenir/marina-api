-- Migration 028: photos the officer attaches to the report PDF
--
-- One row per photo. The image is stored already shrunk (about 1200 px on the
-- long side, JPEG, no metadata — see lib/photoShrink.ts), so a report with
-- eight photos adds 1–2 MB to the PDF, and the PDF and email requests carry
-- only photo ids rather than re-uploading images over a satellite link.
--
-- Separate from exam_media on purpose. exam_media is the accuracy record of
-- the vision model and the clinical evidence for the MDR change; a plain photo
-- with no analysis does not belong in it. A photo that WAS analysed points back
-- to its exam_media row through exam_media_id, which also gives the PDF its
-- caption (the examination it was taken for).
--
-- These are identifiable patient health data. Deleting a photo deletes the row
-- outright (DELETE /ai/exam-media/photos/:id); there is no soft delete.
--
-- ADDITIVE. A new, empty table; no existing table is altered. The foreign keys
-- take a brief lock on users, conversations and exam_media, so lock_timeout for
-- the same reason as 025 and 027: fail fast rather than queue behind a long
-- read and block every login.

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS report_photos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id  UUID REFERENCES conversations(id) ON DELETE SET NULL,
  exam_media_id    UUID REFERENCES exam_media(id) ON DELETE SET NULL,

  image            BYTEA NOT NULL,
  sha256           CHAR(64) NOT NULL,
  byte_size        INTEGER NOT NULL,

  created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_photos_user_id
  ON report_photos(user_id, created_at DESC);
