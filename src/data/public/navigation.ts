import 'server-only';

import { and, asc, eq, isNotNull } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';

import type { LocalizedText } from '@/content/i18n';
import { db } from '@/db/client';
import { documentLocales, documents, navigationItems } from '@/db/schema';
import type { Locale } from '@/i18n/routing';
import { PUBLIC_CACHE_PROFILE, tags } from '../cache-tags';

export type NavigationEntry = {
  id: string;
  label: LocalizedText;
  /** Resolved for this locale. Null when the target is not published here. */
  slug: string | null;
  kind: 'page' | 'project' | null;
  externalUrl: string | null;
  anchor: string | null;
};

/**
 * Navigation for one menu and locale.
 *
 * Items link by `documentId`, and the target slug is resolved here per locale.
 * An item whose target is unpublished in this locale resolves to `null` and is
 * dropped rather than rendering a link into a 404.
 */
export async function getNavigation(
  menu: 'header' | 'footer_primary' | 'footer_legal',
  locale: Locale,
): Promise<NavigationEntry[]> {
  'use cache';
  cacheLife(PUBLIC_CACHE_PROFILE);
  cacheTag(tags.navigation(locale));

  const rows = await db
    .select({
      id: navigationItems.id,
      label: navigationItems.label,
      externalUrl: navigationItems.externalUrl,
      anchor: navigationItems.anchor,
      slug: documentLocales.slug,
      kind: documentLocales.kind,
    })
    .from(navigationItems)
    .leftJoin(
      documentLocales,
      and(
        eq(documentLocales.documentId, navigationItems.documentId),
        eq(documentLocales.locale, locale),
        eq(documentLocales.status, 'published'),
        isNotNull(documentLocales.publishedRevisionId),
      ),
    )
    .where(and(eq(navigationItems.menu, menu), eq(navigationItems.isVisible, true)))
    .orderBy(asc(navigationItems.sortOrder));

  return rows
    .filter((row) => row.slug !== null || row.externalUrl !== null || row.anchor !== null)
    .map((row) => ({
      id: row.id,
      label: (row.label ?? {}) as LocalizedText,
      slug: row.slug,
      kind: (row.kind ?? null) as 'page' | 'project' | null,
      externalUrl: row.externalUrl,
      anchor: row.anchor,
    }));
}

/** Slug of a document in one locale — used to resolve CTA targets. */
export async function getDocumentSlug(
  documentId: string,
  locale: Locale,
): Promise<{ slug: string; kind: 'page' | 'project' } | null> {
  'use cache';
  cacheLife(PUBLIC_CACHE_PROFILE);
  cacheTag(tags.document(documentId, locale));

  const [row] = await db
    .select({ slug: documentLocales.slug, kind: documentLocales.kind })
    .from(documentLocales)
    .innerJoin(documents, eq(documents.id, documentLocales.documentId))
    .where(
      and(
        eq(documentLocales.documentId, documentId),
        eq(documentLocales.locale, locale),
        eq(documentLocales.status, 'published'),
        isNotNull(documentLocales.publishedRevisionId),
      ),
    )
    .limit(1);

  if (!row) return null;
  return { slug: row.slug, kind: row.kind as 'page' | 'project' };
}
