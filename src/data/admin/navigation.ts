import 'server-only';

import { and, asc, eq } from 'drizzle-orm';

import type { LocalizedText } from '@/content/i18n';
import { db } from '@/db/client';
import { documentLocales, documents, navigationItems } from '@/db/schema';
import { LOCALES, type Locale } from '@/i18n/routing';
import { requireCapability } from '@/lib/auth/guards';

/**
 * Navigation for the editor.
 *
 * The public reader drops any item whose target is not published in the locale
 * being rendered — that is correct (a menu link into a 404 is worse than a
 * missing link) but it is silent. So this read reports, per item, exactly which
 * locales will not show it, and the editor says so out loud. Otherwise the
 * owner adds a link, sees it on the Russian site, and never learns that the
 * Spanish menu simply does not have it.
 */

export const MENUS = ['header', 'footer_primary', 'footer_legal'] as const;
export type Menu = (typeof MENUS)[number];

export const MENU_LABEL: Record<Menu, string> = {
  header: 'Верхнее меню',
  footer_primary: 'Футер — разделы',
  footer_legal: 'Футер — юридические',
};

export type NavigationItemRow = {
  id: string;
  menu: Menu;
  label: LocalizedText;
  documentId: string | null;
  externalUrl: string | null;
  anchor: string | null;
  sortOrder: number;
  isVisible: boolean;
  /** Russian path of the linked document, for display. Null if not a document. */
  targetPath: string | null;
  /** Locales where the target is not published, so the item will not render. */
  hiddenIn: Locale[];
};

export async function listNavigation(): Promise<Record<Menu, NavigationItemRow[]>> {
  await requireCapability('navigation.write');

  const items = await db
    .select()
    .from(navigationItems)
    .orderBy(asc(navigationItems.menu), asc(navigationItems.sortOrder));

  // The portfolio index slug is editable, so project paths are built from it
  // rather than from a hardcoded 'raboty'.
  const [portfolioIndex] = await db
    .select({ slug: documentLocales.slug })
    .from(documentLocales)
    .innerJoin(documents, eq(documents.id, documentLocales.documentId))
    .where(and(eq(documents.template, 'portfolio_index'), eq(documentLocales.locale, 'ru')))
    .limit(1);
  const projectParent = portfolioIndex?.slug ?? 'raboty';

  const localeRows = await db
    .select({
      documentId: documentLocales.documentId,
      locale: documentLocales.locale,
      slug: documentLocales.slug,
      kind: documentLocales.kind,
      status: documentLocales.status,
      publishedRevisionId: documentLocales.publishedRevisionId,
    })
    .from(documentLocales);

  const published = new Map<string, Map<Locale, string>>();
  for (const row of localeRows) {
    if (row.status !== 'published' || row.publishedRevisionId === null) continue;
    const byLocale = published.get(row.documentId) ?? new Map<Locale, string>();
    byLocale.set(
      row.locale as Locale,
      row.kind === 'project' ? `${projectParent}/${row.slug}` : row.slug,
    );
    published.set(row.documentId, byLocale);
  }

  const grouped: Record<Menu, NavigationItemRow[]> = {
    header: [],
    footer_primary: [],
    footer_legal: [],
  };

  for (const item of items) {
    const menu = item.menu as Menu;
    if (!grouped[menu]) continue;

    const byLocale = item.documentId ? published.get(item.documentId) : undefined;
    const hiddenIn = item.documentId
      ? LOCALES.filter((locale) => !byLocale?.has(locale))
      : // External links and anchors work in every locale.
        [];

    grouped[menu].push({
      id: item.id,
      menu,
      label: (item.label ?? {}) as LocalizedText,
      documentId: item.documentId,
      externalUrl: item.externalUrl,
      anchor: item.anchor,
      sortOrder: item.sortOrder,
      isVisible: item.isVisible,
      targetPath: byLocale?.get('ru') !== undefined ? `/${byLocale.get('ru')}` : null,
      hiddenIn,
    });
  }

  return grouped;
}

export type NavigationTarget = {
  id: string;
  label: string;
  path: string;
  published: boolean;
};

/** Everything a menu item can point at, published or not. */
export async function listNavigationTargets(): Promise<NavigationTarget[]> {
  await requireCapability('navigation.write');

  const [portfolioIndex] = await db
    .select({ slug: documentLocales.slug })
    .from(documentLocales)
    .innerJoin(documents, eq(documents.id, documentLocales.documentId))
    .where(and(eq(documents.template, 'portfolio_index'), eq(documentLocales.locale, 'ru')))
    .limit(1);
  const projectParent = portfolioIndex?.slug ?? 'raboty';

  const rows = await db
    .select({
      id: documents.id,
      kind: documents.kind,
      seedKey: documents.seedKey,
      template: documents.template,
      slug: documentLocales.slug,
      status: documentLocales.status,
      publishedRevisionId: documentLocales.publishedRevisionId,
      sortOrder: documents.sortOrder,
    })
    .from(documents)
    .leftJoin(documentLocales, eq(documentLocales.documentId, documents.id))
    .where(eq(documentLocales.locale, 'ru'))
    .orderBy(asc(documents.kind), asc(documents.sortOrder));

  return rows.map((row) => ({
    id: row.id,
    label: row.seedKey?.replace(/^(page|project)\./, '') ?? row.template,
    path: row.slug === '' ? '/' : `/${row.kind === 'project' ? `${projectParent}/` : ''}${row.slug ?? ''}`,
    published: row.status === 'published' && row.publishedRevisionId !== null,
  }));
}
