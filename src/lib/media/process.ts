import 'server-only';

import sharp from 'sharp';

import { buildDerivativeKey, buildOriginalKey, sha256, storage } from '@/lib/storage';

/**
 * Image processing.
 *
 * The original upload is stored untouched and every rendered size is a
 * derivative. That is what makes cropping, focal points and format changes
 * non-destructive: the owner can re-crop a photograph a year later without
 * having lost the pixels the first crop discarded.
 *
 * Derivative widths and formats are versioned as a recipe, so bumping
 * RECIPE.version is the whole reprocessing trigger — a background job selects
 * `WHERE recipe_version < CURRENT` and regenerates.
 */
export const RECIPE = {
  version: 1,
  widths: [320, 640, 960, 1280, 1920, 2560],
  formats: ['avif', 'webp'] as const,
} as const;

export const ACCEPTED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/tiff',
]);

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export type ProcessedUpload = {
  storageKey: string;
  checksum: string;
  mimeType: string;
  width: number;
  height: number;
  bytes: number;
  lqip: string;
  derivatives: Array<{ width: number; format: string; storageKey: string; bytes: number }>;
};

/**
 * Validate, store and derive an uploaded image.
 *
 * The MIME type is taken from sharp's inspection of the bytes, never from the
 * client-supplied `Content-Type` — a browser will happily label anything, and
 * this value ends up in a response header.
 */
export async function processUpload(input: Buffer): Promise<ProcessedUpload> {
  if (input.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error('file_too_large');
  }

  const image = sharp(input, { failOn: 'error' });
  const metadata = await image.metadata();

  const detected = metadata.format ? `image/${metadata.format}` : null;
  if (!detected || !ACCEPTED_MIME.has(detected)) {
    throw new Error('unsupported_format');
  }
  if (!metadata.width || !metadata.height) {
    throw new Error('unreadable_image');
  }

  const checksum = sha256(input);
  const extension = metadata.format === 'jpeg' ? 'jpg' : metadata.format;
  const storageKey = buildOriginalKey(checksum, extension);

  const store = storage();
  await store.put(storageKey, input, { contentType: detected });

  // A ~20px blur, inlined as a data URL for next/image's blurDataURL. Kept
  // tiny on purpose: it sits in the HTML of every page that shows the image.
  const lqipBuffer = await sharp(input)
    .resize(20, 20, { fit: 'inside' })
    .webp({ quality: 40 })
    .toBuffer();
  const lqip = `data:image/webp;base64,${lqipBuffer.toString('base64')}`;

  const derivatives: ProcessedUpload['derivatives'] = [];
  // Never upscale: a 900px original gains nothing from a 2560px derivative
  // except storage and a softer image.
  const widths: number[] = RECIPE.widths.filter((width) => width <= metadata.width!);
  // An image smaller than the narrowest step still needs one derivative.
  if (widths.length === 0) widths.push(metadata.width);

  for (const width of widths) {
    for (const format of RECIPE.formats) {
      const resized = sharp(input).resize(width, undefined, { withoutEnlargement: true });
      const buffer =
        format === 'avif'
          ? await resized.avif({ quality: 55 }).toBuffer()
          : await resized.webp({ quality: 80 }).toBuffer();

      const key = buildDerivativeKey(checksum, RECIPE.version, width, format);
      await store.put(key, buffer, { contentType: `image/${format}` });
      derivatives.push({ width, format, storageKey: key, bytes: buffer.byteLength });
    }
  }

  return {
    storageKey,
    checksum,
    mimeType: detected,
    width: metadata.width,
    height: metadata.height,
    bytes: input.byteLength,
    lqip,
    derivatives,
  };
}
