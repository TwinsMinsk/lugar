import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const mediaHost = process.env.NEXT_PUBLIC_MEDIA_BASE_URL
  ? new URL(process.env.NEXT_PUBLIC_MEDIA_BASE_URL)
  : null;

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
