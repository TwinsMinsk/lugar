import { NextResponse } from 'next/server';

import { storage } from '@/lib/storage';

/**
 * Serves media from local disk in development.
 *
 * With Cloudflare R2 configured, images are served straight from the bucket's
 * public URL and this route is never hit — `mediaUrl()` only points here when
 * NEXT_PUBLIC_MEDIA_BASE_URL is unset. It exists so `npm run dev` works with no
 * cloud account, not as a production serving path.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  const storageKey = key.map((segment) => decodeURIComponent(segment)).join('/');

  // Traversal is rejected by the storage driver, which resolves the path and
  // refuses anything outside its root.
  try {
    const body = await storage().get(storageKey);
    const extension = storageKey.split('.').pop()?.toLowerCase() ?? '';
    const contentType =
      extension === 'avif'
        ? 'image/avif'
        : extension === 'webp'
          ? 'image/webp'
          : extension === 'png'
            ? 'image/png'
            : 'image/jpeg';

    return new NextResponse(new Uint8Array(body), {
      headers: {
        'content-type': contentType,
        // Derivatives are content-addressed and versioned, so they are immutable.
        'cache-control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}
