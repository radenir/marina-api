/**
 * Tests for report photos that run without a network or DB:
 * - shrinkPhoto stores a small JPEG, upright, with no metadata (no GPS)
 * - appendPhotoPages adds photo pages to all four templates, two per page
 * - without photos the PDF is returned untouched
 * - eight large photos are brought under the photo budget
 *
 * No test runner is configured; run directly:
 *     ./node_modules/.bin/tsx tests/reportPhotos.test.ts
 * Exits non-zero on any failure. Needs pdftk on PATH for the RMD and German forms.
 */
import sharp from 'sharp';
import { createHash, randomBytes } from 'crypto';
import { PDFDocument } from 'pdf-lib';
import { shrinkPhoto } from '../src/lib/photoShrink.js';
import { appendPhotoPages, photoCaption, PHOTO_BUDGET_BYTES, type PdfPhoto } from '../src/lib/photoPages.js';
import { fillSeafarerForm, fillNorwegianForm } from '../src/lib/seafarerPdf.js';
import { fillRmdFormPdftk, fillGermanFormPdftk } from '../src/lib/pdftk.js';
import { mapSummaryToSeafarerFields } from '../src/lib/seafarerMapper.js';
import { mapSummaryToNorwegianFields } from '../src/lib/norwegianMapper.js';
import { mapSummaryToGermanFields } from '../src/lib/germanMapper.js';
import { mapSummaryToRmdFields, extractMedicationFields } from '../src/lib/rmdMapper.js';

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown): void {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}`, detail ?? '');
  }
}

/** A phone-like photo: 4000x3000, rotated by EXIF, with GPS in it. */
async function phonePhoto(): Promise<Buffer> {
  return sharp({ create: { width: 4000, height: 3000, channels: 3, background: { r: 180, g: 90, b: 60 } } })
    .jpeg({ quality: 95 })
    .withMetadata({ orientation: 6 })
    .withExif({
      IFD0: { Make: 'Apple', Model: 'iPhone' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '55/1 40/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '12/1 34/1 0/1' },
    })
    .toBuffer();
}

/** Random noise compresses badly: the worst case for the size budget. */
async function noisyPhoto(w = 1200, h = 900): Promise<Buffer> {
  return sharp(randomBytes(w * h * 3), { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 70 }).toBuffer();
}

const asPdfPhoto = (image: Buffer, caption = 'Eye examination · 28 Oct 2026, 14:32 UTC'): PdfPhoto => ({
  image,
  sha256: createHash('sha256').update(image).digest('hex'),
  caption,
});

const pageCount = async (pdf: Buffer) => (await PDFDocument.load(pdf)).getPageCount();

async function main() {
  console.log('shrinkPhoto');
  {
    const input = await phonePhoto();
    const inMeta = await sharp(input).metadata();
    check('fixture really has EXIF and GPS', !!inMeta.exif && inMeta.orientation === 6, inMeta);

    const out = await shrinkPhoto(input);
    const meta = await sharp(out).metadata();
    check('output is JPEG', meta.format === 'jpeg', meta.format);
    check('no EXIF left (so no GPS)', meta.exif === undefined, meta.exif?.length);
    check('no orientation tag left', meta.orientation === undefined, meta.orientation);
    check('rotated upright: portrait 900x1200', meta.width === 900 && meta.height === 1200, [meta.width, meta.height]);
    check('much smaller than the input', out.length < input.length / 3, [input.length, out.length]);

    const small = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#888' } }).jpeg().toBuffer();
    const smallMeta = await sharp(await shrinkPhoto(small)).metadata();
    check('never enlarged', smallMeta.width === 400 && smallMeta.height === 300, [smallMeta.width, smallMeta.height]);

    const png = await sharp({ create: { width: 800, height: 600, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const pngOut = await shrinkPhoto(png);
    const { data } = await sharp(pngOut).raw().toBuffer({ resolveWithObject: true });
    check('transparent PNG becomes white JPEG, not black', (await sharp(pngOut).metadata()).format === 'jpeg' && data[0] > 240, data[0]);

    let threw = false;
    try { await shrinkPhoto(Buffer.from('not an image')); } catch { threw = true; }
    check('unreadable bytes throw (route answers 400)', threw);
  }

  console.log('photoCaption');
  {
    const at = new Date(Date.UTC(2026, 9, 28, 14, 32));
    check('examination photo', photoCaption(2, at) === 'Eye examination · 28 Oct 2026, 14:32 UTC', photoCaption(2, at));
    check('plain photo', photoCaption(null, at) === 'Photo taken 28 Oct 2026, 14:32 UTC', photoCaption(null, at));
    check('unknown examination falls back to plain', photoCaption(99999, at) === 'Photo taken 28 Oct 2026, 14:32 UTC', photoCaption(99999, at));
  }

  console.log('appendPhotoPages');
  {
    const summary = { patientFirstName: 'Jane', patientLastName: 'Doe', shipName: 'MV Northern Star', chiefComplaint: 'Red eye' };
    const forms: Array<[string, () => Promise<Buffer>]> = [
      ['marina', () => fillSeafarerForm(mapSummaryToSeafarerFields(summary), '/tmp/marina_test_photos_marina.pdf')],
      ['norwegian', () => fillNorwegianForm(mapSummaryToNorwegianFields(summary), '/tmp/marina_test_photos_no.pdf')],
      ['german', () => fillGermanFormPdftk(mapSummaryToGermanFields(summary), '/tmp/marina_test_photos_de.pdf')],
      ['rmd', () => fillRmdFormPdftk(
        mapSummaryToRmdFields({ ...summary, ...extractMedicationFields(undefined) }), '/tmp/marina_test_photos_rmd.pdf')],
    ];

    const photos = [asPdfPhoto(await shrinkPhoto(await phonePhoto())), asPdfPhoto(await noisyPhoto(), 'Photo taken 28 Oct 2026, 14:40 UTC'), asPdfPhoto(await noisyPhoto(900, 1200))];

    for (const [name, fill] of forms) {
      const base = await fill();
      const untouched = await appendPhotoPages(base, []);
      check(`${name}: no photos → the same buffer, untouched`, untouched === base);

      const withPhotos = await appendPhotoPages(base, photos);
      const [before, after] = [await pageCount(base), await pageCount(withPhotos)];
      check(`${name}: 3 photos → 2 extra pages`, after === before + 2, [before, after]);
      const photoBytes = photos.reduce((n, p) => n + p.image.length, 0);
      check(`${name}: PDF grows by about the JPEG sizes (embedded as-is)`,
        withPhotos.length - base.length < photoBytes * 1.1 + 50_000, [base.length, withPhotos.length, photoBytes]);
    }

    const base = await forms[0][1]();
    const twice = await appendPhotoPages(base, [photos[0], photos[0]]);
    check('same photo twice → embedded once (one page)', (await pageCount(twice)) === (await pageCount(base)) + 1);

    const caption = await appendPhotoPages(base, [asPdfPhoto(photos[0].image, 'Øye → høyre ✓')]);
    check('caption outside WinAnsi does not throw', (await pageCount(caption)) === (await pageCount(base)) + 1);

    const eight = await Promise.all(Array.from({ length: 8 }, () => noisyPhoto(1200, 1200)));
    const rawTotal = eight.reduce((n, b) => n + b.length, 0);
    check('fixture: eight noisy photos exceed the budget', rawTotal > PHOTO_BUDGET_BYTES, rawTotal);
    const big = await appendPhotoPages(base, eight.map((b) => asPdfPhoto(b)));
    const added = big.length - base.length;
    check('eight large photos: photo pages come in under the budget', added <= PHOTO_BUDGET_BYTES + 100_000, [rawTotal, added]);
    check('eight photos → 4 extra pages', (await pageCount(big)) === (await pageCount(base)) + 4);
  }

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
