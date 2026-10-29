import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { shrinkPhoto } from './photoShrink.js';
import { getProtocol } from './examMediaProtocols.js';

/**
 * Photo pages appended after a filled report form — any of the four templates,
 * since it works on the finished PDF: the pdf-lib forms directly, the pdftk
 * forms (RMD, German) by reopening pdftk's output.
 *
 * Two photos per A4 page, each with its caption underneath. The form pages are
 * not touched.
 */

export interface PdfPhoto {
  /** Stored JPEG (lib/photoShrink.ts). */
  image: Buffer;
  sha256: string;
  caption: string;
}

/**
 * The photos together stay under this. Over it, every photo is re-encoded one
 * step smaller until they fit, or the last step is reached. With photos stored
 * at 1200 px this rarely triggers; it is there so eight unusually detailed
 * photos cannot push the emailed PDF past what a TMAS mailbox accepts.
 */
export const PHOTO_BUDGET_BYTES = 3 * 1024 * 1024;
const SMALLER_STEPS: Array<[longEdge: number, quality: number]> = [[1000, 62], [800, 55], [640, 50]];

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 40;
const HEADING = 'Photographs';
const HEADING_SIZE = 13;
const CAPTION_SIZE = 9;
const CAPTION_GAP = 6;
const SLOT_GAP = 24;

/** "Eye examination · 28 Oct 2026, 14:32 UTC", or just the time for a plain photo. UTC because ships change time zone. */
export function photoCaption(examinationId: number | null, takenAt: Date): string {
  const d = takenAt;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const pad = (n: number) => String(n).padStart(2, '0');
  const when = `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
  const exam = examinationId !== null ? getProtocol(examinationId)?.name : undefined;
  return exam ? `${exam} · ${when}` : `Photo taken ${when}`;
}

/** Helvetica is WinAnsi: anything outside it would throw, so it becomes "?". */
function winAnsi(s: string): string {
  return s.replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
}

/** Same image twice (the officer attached it twice) goes in once. Order kept. */
function unique(photos: PdfPhoto[]): PdfPhoto[] {
  const seen = new Set<string>();
  return photos.filter((p) => !seen.has(p.sha256) && seen.add(p.sha256));
}

async function withinBudget(photos: PdfPhoto[]): Promise<Buffer[]> {
  let images = photos.map((p) => p.image);
  const total = () => images.reduce((n, b) => n + b.length, 0);
  for (const [longEdge, quality] of SMALLER_STEPS) {
    if (total() <= PHOTO_BUDGET_BYTES) break;
    images = await Promise.all(photos.map((p) => shrinkPhoto(p.image, longEdge, quality)));
  }
  return images;
}

export async function appendPhotoPages(pdf: Buffer, photos: PdfPhoto[]): Promise<Buffer> {
  if (!photos.length) return pdf;

  const list = unique(photos);
  const images = await withinBudget(list);

  const doc = await PDFDocument.load(pdf);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const [pageW, pageH] = A4;
  const top = pageH - MARGIN - HEADING_SIZE - 12;
  const slotH = (top - MARGIN - SLOT_GAP) / 2;
  const maxImgW = pageW - 2 * MARGIN;
  const maxImgH = slotH - CAPTION_SIZE - CAPTION_GAP;

  for (let i = 0; i < list.length; i += 2) {
    const page = doc.addPage(A4);
    page.drawText(HEADING, { x: MARGIN, y: pageH - MARGIN - HEADING_SIZE, size: HEADING_SIZE, font: bold });

    for (let slot = 0; slot < 2 && i + slot < list.length; slot++) {
      const img = await doc.embedJpg(images[i + slot]);
      const scale = Math.min(maxImgW / img.width, maxImgH / img.height, 1);
      const w = img.width * scale;
      const h = img.height * scale;
      const slotTop = top - slot * (slotH + SLOT_GAP);
      const imgY = slotTop - h;

      page.drawImage(img, { x: MARGIN + (maxImgW - w) / 2, y: imgY, width: w, height: h });
      page.drawText(winAnsi(list[i + slot].caption), {
        x: MARGIN + (maxImgW - w) / 2,
        y: imgY - CAPTION_GAP - CAPTION_SIZE,
        size: CAPTION_SIZE,
        font,
        color: rgb(0.25, 0.25, 0.25),
      });
    }
  }

  return Buffer.from(await doc.save());
}
