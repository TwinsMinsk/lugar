import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const mediaHost = process.env.NEXT_PUBLIC_MEDIA_BASE_URL
  ? new URL(process.env.NEXT_PUBLIC_MEDIA_BASE_URL)
  : null;

/**
 * Content-Security-Policy — the static, no-nonce form.
 *
 * Next's own CSP guide offers two shapes: a nonce-based one, and this one. The
 * nonce form buys a script-src that does not need `'unsafe-inline'`, but its
 * price is absolute: "all pages must be dynamically rendered" — no static
 * generation, no ISR, nothing cacheable at the edge. That is the opposite of
 * this site's own architecture (`generateStaticParams` prerenders every
 * published path, `PUBLIC_CACHE_PROFILE` exists specifically because the
 * per-instance cache is worth keeping). Trading that away for a marginally
 * stricter script-src, on a site with zero `dangerouslySetInnerHTML` for
 * scripts and no free-text content ever rendered as raw HTML, is a worse
 * trade than it looks — so this is the static form, `'unsafe-inline'` and all.
 *
 * `'unsafe-inline'` on style-src is not a compromise here, it is a
 * requirement: several components set `style={{...}}` directly (the focal
 * point on a cropped photo, the placeholder's diagonal hatching) — an
 * arbitrary, per-render value a nonce or a hash cannot cover. Without it
 * those elements silently lose their styling; CSP violations do not throw,
 * they just make the browser drop the rule.
 *
 * `blob:` in img-src is for the admin media picker's local preview
 * (`URL.createObjectURL`) before a file has finished uploading.
 * `data:` covers the LQIP blur placeholder, an inline base64 image.
 *
 * The googletagmanager.com / google-analytics.com / facebook.net /
 * facebook.com entries are not in use yet — analytics is consent-gated and
 * the loader script has not shipped. They are here so that shipping it later
 * is adding a `<Script src>` tag, not also debugging a CSP that silently
 * blocks it; an unused allowance costs nothing.
 *
 * `frame-ancestors 'self'` matches the existing `X-Frame-Options: SAMEORIGIN`
 * below rather than tightening it to `'none'` — nothing here embeds the site
 * in an iframe today, but that is a narrower, separate claim than "nothing
 * may ever frame it, including itself".
 *
 * `'unsafe-eval'` is added in dev only, on Next's own explicit instruction:
 * React calls `eval()` in development to reconstruct server-side error
 * stacks in the browser console. Confirmed by running into it directly —
 * without this branch, `npm run dev` logs "eval() is not supported in this
 * environment" on every page. Neither React nor Next uses `eval` in a
 * production build, so production stays without it.
 */
const isDev = process.env.NODE_ENV === 'development';

const CSP_HEADER = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://www.googletagmanager.com https://connect.facebook.net`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https://www.facebook.com",
  "font-src 'self'",
  "connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  'upgrade-insecure-requests',
].join('; ');

const nextConfig: NextConfig = {
  // Railway deploys the standalone server bundle (`node .next/standalone/server.js`).
  output: 'standalone',

  /**
   * Build output location.
   *
   * Defaults to `.next`. Overridable because Turbopack creates junction points
   * under `<distDir>/node_modules` for native server externals (sharp, the AWS
   * SDK), and exFAT does not support junctions at all — the build dies with
   * "creation of a new symbolic link or junction point failed". Pointing
   * distDir at an NTFS path fixes it; junctions may cross volumes, so the
   * targets can stay on the project's own drive.
   *
   * Irrelevant on Railway, which builds on Linux.
   */
  distDir: process.env.NEXT_DIST_DIR || '.next',

  reactStrictMode: true,

  // Cache Components: enables `use cache` + cacheTag/cacheLife.
  cacheComponents: true,

  // Fail the production build on type errors rather than shipping them.
  // Next 16 removed `next lint` and the `eslint` config key — linting runs as
  // its own `npm run lint` step in CI.
  typescript: { ignoreBuildErrors: false },

  images: {
    // `images.domains` was removed in Next 16 — remotePatterns only.
    remotePatterns: mediaHost
      ? [
          {
            protocol: mediaHost.protocol.replace(':', '') as 'http' | 'https',
            hostname: mediaHost.hostname,
            pathname: '/**',
          },
        ]
      : [],
    /**
     * The development media route serves from local disk. Allowlisted
     * explicitly because Next 16 requires local image sources to match a
     * pattern; no `search` entry is needed, since media URLs carry no query
     * string (storage keys are content-addressed — see mediaUrl()).
     */
    localPatterns: [{ pathname: '/api/media/**' }],
    formats: ['image/avif', 'image/webp'],
    // Photography-first site: keep the large end of the ladder.
    deviceSizes: [320, 420, 640, 768, 1024, 1280, 1600, 1920, 2560],
    imageSizes: [64, 96, 128, 256, 384],
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          /**
           * HSTS is safe to send unconditionally: browsers only honour it on a
           * response actually received over TLS (RFC 6797), so this has no
           * effect on `npm run dev` over plain http — no dev/prod branch
           * needed. `preload` is deliberately left off: submitting to the
           * browser preload list is close to irreversible (every subdomain is
           * forced to https, forever, long after removal), and the domain
           * this ships on is not final yet. Add it later, once the domain is,
           * as its own decision — not a default.
           */
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          { key: 'Content-Security-Policy', value: CSP_HEADER },
        ],
      },
      {
        // Admin, previews and the webhook must never be indexed.
        source: '/admin/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }],
      },
      {
        source: '/api/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
