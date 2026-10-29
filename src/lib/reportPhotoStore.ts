import { createHash } from 'crypto';
import { query } from './db.js';
import { photoCaption, type PdfPhoto } from './photoPages.js';

/** Most photos one report PDF takes. Two per page, so four extra pages at most. */
export const MAX_REPORT_PHOTOS = 8;

/** Store an already-shrunk photo (lib/photoShrink.ts). Returns its id. */
export async function insertReportPhoto(row: {
  userId: string;
  conversationId: string | null;
  examMediaId: string | null;
  image: Buffer;
}): Promise<string> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO report_photos (user_id, conversation_id, exam_media_id, image, sha256, byte_size)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      row.userId, row.conversationId, row.examMediaId, row.image,
      createHash('sha256').update(row.image).digest('hex'), row.image.length,
    ],
  );
  return rows[0].id;
}

/** The stored JPEG, if `id` belongs to `userId`. */
export async function getReportPhotoImage(id: string, userId: string): Promise<Buffer | null> {
  const { rows } = await query<{ image: Buffer }>(
    'SELECT image FROM report_photos WHERE id = $1 AND user_id = $2',
    [id, userId],
  );
  return rows[0]?.image ?? null;
}

/** Deletes the row outright. False when there was no such photo of this user's. */
export async function deleteReportPhoto(id: string, userId: string): Promise<boolean> {
  const { rowCount } = await query('DELETE FROM report_photos WHERE id = $1 AND user_id = $2', [id, userId]);
  return (rowCount ?? 0) > 0;
}

/**
 * The photos to append to a report PDF, in the order the officer listed them.
 * Ids that are not this user's, or no longer exist, are skipped — the same rule
 * as examMediaIds on /v2/ai/extract.
 *
 * Throws when the table is missing (code deployed ahead of migration 028), so a
 * report the officer believes has photos never goes out silently without them.
 */
export async function getPhotosForPdf(ids: string[], userId: string): Promise<PdfPhoto[]> {
  if (!ids.length) return [];
  const { rows } = await query<{
    image: Buffer;
    sha256: string;
    created_at: Date;
    examination_id: number | null;
  }>(
    `SELECT p.image, p.sha256, p.created_at, m.examination_id
       FROM report_photos p
       LEFT JOIN exam_media m ON m.id = p.exam_media_id
      WHERE p.id = ANY($1::uuid[]) AND p.user_id = $2
      ORDER BY array_position($1::uuid[], p.id)`,
    [ids, userId],
  );
  return rows.map((r) => ({
    image: r.image,
    sha256: r.sha256,
    caption: photoCaption(r.examination_id, r.created_at),
  }));
}
