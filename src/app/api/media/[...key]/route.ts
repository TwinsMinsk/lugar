import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { mediaAssets, mediaDerivatives } from '@/db/schema';
import { env } from '@/env';
import { storage } from '@/lib/storage';

/**
 * Serves media from local disk.
 *
 * Written as a development convenience — with Cloudflare R2 configured,
 * `mediaUrl()` points at the bucket and nothing reaches this file. It is not
 * that today: the deploy runs `STORAGE_DRIVER=local` against a mounted volume,
 * so this route is how every photograph on the public site is delivered, and
 * it is treated accordingly.
 *
 * Three rules, each closing something this route did without them.
 *
 * 1. Only keys the database knows. It used to hand any key straight to the
 *    driver, which made everything under the storage root public — staging
 *    uploads included. A key is now looked up in `media_assets` and
 *    `media_derivatives`; anything else is a 404, which is also the honest
 *    answer for a key that never existed.
 * 2. The content type comes from that record, not from the characters after
 *    the last dot in a URL the visitor chose.
 * 3. Refused entirely unless the driver really is local. With S3 configured
 *    this would be an unauthenticated proxy for the whole bucket, on the
 *    origin, defeating both the CDN and the bucket's own access rules.
 */

/** `media_derivatives.format` is 'avif' | 'webp' | 'jpeg'. */
const DERIVATIVE_TYPES: Record<string, string> = {
  avif: 'image/avif',
  webp: 'image/webp',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

/**
 * Resolved keys, remembered.
 *
 * The lookup is on the hot path — a gallery page is twenty of these requests —
 * and caching it is safe for the reason the responses are `immutable`: keys are
 * content-addressed, so a key that resolved to a JPEG cannot later mean
 * something else. Bounded because the map would otherwise grow with the
 * library; the eviction is crude on purpose, since a miss costs one query.
 */
const RESOLVED = new Map<string, string>();
const RESOLVED_MAX = 2000;

async function contentTypeFor(storageKey: string): Promise<string | null> {
  const remembered = RESOLVED.get(storageKey);
  if (remembered) return remembered;

  const [asset] = await db
    .select({ mimeType: mediaAssets.mimeType })
    .from(mediaAssets)
    .where(eq(mediaAssets.storageKey, storageKey))
    .limit(1);

  let contentType = asset?.mimeType ?? null;

  if (!contentType) {
    const [derivative] = await db
      .select({ format: mediaDerivatives.format })
      .from(mediaDerivatives)
      .where(eq(mediaDerivatives.storageKey, storageKey))
      .limit(1);
    contentType = derivative ? (DERIVATIVE_TYPES[derivative.format] ?? null) : null;
  }

  if (contentType) {
    if (RESOLVED.size >= RESOLVED_MAX) RESOLVED.clear();
    RESOLVED.set(storageKey, contentType);
  }
  return contentType;
}

export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  if (env.STORAGE_DRIVER !== 'local') {
    return new NextResponse('Not found', { status: 404 });
  }

  const { key } = await params;

  let storageKey: string;
  try {
    // Inside the try on purpose: a malformed escape (`%zz`) throws here, and
    // outside it that surfaced as a 500 for what is simply a bad URL.
    storageKey = key.map((segment) => decodeURIComponent(segment)).join('/');
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }

  const contentType = await contentTypeFor(storageKey);
  if (!contentType) return new NextResponse('Not found', { status: 404 });

  try {
    const body = await storage().get(storageKey);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        'content-type': contentType,
        // Both tables hold content-addressed keys — the key changes when the
        // bytes do — so what they name can be cached as immutable.
        'cache-control': 'public, max-age=31536000, immutable',
        // The record vouches for the type, but a stored file is still
        // attacker-influenced input; refuse to let a browser sniff its way to
        // a different conclusion.
        'x-content-type-options': 'nosniff',
      },
    });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}
