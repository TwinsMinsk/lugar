import 'server-only';

import { and, eq, isNotNull } from 'drizzle-orm';
import { updateTag } from 'next/cache';

import { tags } from '@/data/cache-tags';
import { db } from '@/db/client';
import { documentLocales } from '@/db/schema';
import { LOCALES, type Locale } from '@/i18n/routing';

/**
 * Invalidate everything a site-wide change touches.
 *
 * Menus and global settings are rendered by the header and footer, which live
 * in the layout — they are on every page, so changing one really does
 * invalidate the whole public site.
 *
 * Invalidating the per-page tags as well as the global one is not belt and
 * braces; it is the part that works. Expiring only `nav:{locale}` refreshes the
 * navigation read but leaves each route's prerendered output alone, so the site
 * keeps serving the previous menu until the route's own cache lifetime elapses.
 * An end-to-end test caught it: hiding a menu item updated the database and the
 * admin screen, and the live footer still showed the link. "The owner changed
 * it and the site didn't" is precisely the failure a CMS may not have.
 *
 * The cost is one small query and a few dozen tag expiries, on an action that
 * runs a handful of times a year.
 *
 * Must be called from a Server Action: `updateTag` is only valid there.
 */
export async function invalidatePublicPages(): Promise<void> {
  for (const locale of LOCALES) {
    updateTag(tags.navigation(locale));
    updateTag(tags.projectsIndex(locale));
  }
  updateTag(tags.settings());

  const rows = await db
    .select({
      documentId: documentLocales.documentId,
      locale: documentLocales.locale,
      kind: documentLocales.kind,
      slug: documentLocales.slug,
    })
    .from(documentLocales)
    .where(
      and(eq(documentLocales.status, 'published'), isNotNull(documentLocales.publishedRevisionId)),
    );

  for (const row of rows) {
    const locale = row.locale as Locale;
    updateTag(tags.path(row.kind, locale, row.slug));
    updateTag(tags.document(row.documentId, locale));
  }
}
