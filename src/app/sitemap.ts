import type { MetadataRoute } from 'next';

import { getPortfolioIndexSlug, listPublishedPaths } from '@/data/public/documents';
import { publicEnv } from '@/env';
import { LOCALE_TAG, LOCALES, type Locale } from '@/i18n/routing';
import { absoluteLocaleUrl, documentPath } from '@/lib/routes';

/**
 * Sitemap.
 *
 * Contains published, indexable, canonical URLs only. Everything else is
 * deliberately absent:
 *   - drafts and unpublished locales never appear, because the query filters on
 *     `status = 'published'`;
 *   - pages the owner marked `noindex` are excluded, since listing a URL we ask
 *     crawlers to ignore is a contradiction;
 *   - /admin, previews and route handlers are not documents and cannot appear.
 *
 * Each entry carries reciprocal `alternates.languages`, so a crawler that finds
 * any one locale discovers the other two.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let paths: Awaited<ReturnType<typeof listPublishedPaths>>;
  let indexSlugs: Map<Locale, string | null>;

  try {
    const [resolvedPaths, resolvedIndexes] = await Promise.all([
      listPublishedPaths(),
      Promise.all(
        LOCALES.map(async (locale) => [locale, await getPortfolioIndexSlug(locale)] as const),
      ),
    ]);
    paths = resolvedPaths;
    indexSlugs = new Map(resolvedIndexes);
  } catch {
    // A sitemap that 500s is worse than a sitemap that is briefly empty.
    return [];
  }

  const indexable = paths.filter((entry) => !entry.noindex);

  // Group by document so each URL can list its siblings as alternates.
  const byDocument = new Map<string, typeof indexable>();
  for (const entry of indexable) {
    const bucket = byDocument.get(entry.documentId) ?? [];
    bucket.push(entry);
    byDocument.set(entry.documentId, bucket);
  }

  const urlFor = (entry: (typeof indexable)[number]) =>
    absoluteLocaleUrl(
      entry.locale,
      documentPath(
        entry.kind,
        entry.slug,
        entry.kind === 'project' ? (indexSlugs.get(entry.locale) ?? null) : null,
      ),
      publicEnv.appUrl,
    );

  return indexable.map((entry) => {
    const siblings = byDocument.get(entry.documentId) ?? [entry];
    const languages: Record<string, string> = {};
    for (const sibling of siblings) {
      languages[LOCALE_TAG[sibling.locale]] = urlFor(sibling);
    }

    return {
      url: urlFor(entry),
      lastModified: entry.publishedAt ?? undefined,
      changeFrequency: entry.kind === 'project' ? ('monthly' as const) : ('weekly' as const),
      // The home page outranks direction pages, which outrank everything else.
      priority: entry.slug === '' ? 1 : entry.kind === 'project' ? 0.6 : 0.8,
      alternates: { languages },
    };
  });
}
