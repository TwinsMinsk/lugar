import type { Locale } from '@/i18n/routing';

/**
 * Cache tag vocabulary.
 *
 * Centralised so that a publish action and a cached read can never disagree
 * about a tag name — a typo there would present to the owner as "publishing
 * doesn't work", which is a miserable thing to debug.
 */
export const tags = {
  /** A resolved path → document mapping. Invalidated on publish and on slug change. */
  path: (kind: string, locale: Locale, slug: string) => `path:${kind}:${locale}:${slug}`,
  /** A document in one locale. */
  document: (documentId: string, locale: Locale) => `doc:${documentId}:${locale}`,
  /** A frozen revision. Immutable by construction, so this rarely invalidates. */
  revision: (revisionId: string) => `revision:${revisionId}`,
  /** The portfolio listing for one locale. */
  projectsIndex: (locale: Locale) => `projects-index:${locale}`,
  /** Header/footer navigation. */
  navigation: (locale: Locale) => `nav:${locale}`,
  /** Global settings — phone, social, service area, SEO defaults. */
  settings: () => 'settings',
  /** One media asset, including its derivatives. */
  media: (assetId: string) => `media:${assetId}`,
  /** Service and portfolio taxonomy. */
  taxonomy: () => 'taxonomy',
  /**
   * The whole redirect map, as one entry.
   *
   * Deliberately not tagged per path: a cache key derived from the requested
   * URL would let anyone mint unbounded cache entries by requesting random
   * 404s. One entry for the entire (small) table cannot be grown from outside.
   */
  redirects: () => 'redirects',
} as const;

/**
 * Cache profile for public reads.
 *
 * Deliberately NOT 'max'. Next's default cache handler is per-instance, so with
 * more than one Railway replica a publish on instance A would leave instance B
 * serving stale HTML forever under an unbounded lifetime. A bounded profile
 * caps worst-case staleness at minutes instead. Revisit — and raise this — once
 * a shared cache handler is configured.
 */
export const PUBLIC_CACHE_PROFILE = 'minutes' as const;
