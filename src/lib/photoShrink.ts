import sharp from 'sharp';

/**
 * Re-encode a photo to the size the report needs, and nothing more.
 *
 * Every photo is shrunk on arrival, whatever the app already did: the stored
 * copy is what goes into the PDF, so the server decides its size. 1200 px on
 * the long side is enough to fill half an A4 page; JPEG because pdf-lib copies
 * a JPEG into the PDF unchanged, where a PNG photo would be several times
 * larger once embedded.
 *
 * Metadata is dropped — sharp writes none unless asked — which matters most for
 * GPS: a phone photo records where it was taken. `rotate()` applies the EXIF
 * orientation first, or a portrait photo would come out on its side once the
 * tag that said so is gone.
 */
export const STORED_LONG_EDGE = 1200;
export const STORED_QUALITY = 70;

export async function shrinkPhoto(
  input: Buffer,
  longEdge = STORED_LONG_EDGE,
  quality = STORED_QUALITY,
): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .resize({ width: longEdge, height: longEdge, fit: 'inside', withoutEnlargement: true })
    // A transparent PNG would otherwise turn black where it was see-through.
    .flatten({ background: '#ffffff' })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();
}
