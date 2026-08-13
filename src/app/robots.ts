import type { MetadataRoute } from 'next';

import { publicEnv } from '@/env';

/**
 * robots.txt
 *
 * The admin, API routes and preview entry point are disallowed here *and* sent
 * `X-Robots-Tag: noindex` by next.config, because robots.txt only asks crawlers
 * not to fetch a URL — it does not stop an already-known URL being indexed.
 * Obscurity is not access control either: /admin is additionally gated by the
 * proxy and by a server-side role check on every query.
 */
export default function robots(): MetadataRoute.Robots {
  const base = publicEnv.appUrl.replace(/\/$/, '');

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/admin/', '/api/', '/preview'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
