import 'server-only';

import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';

import type { LocalizedText } from '@/content/i18n';
import { db } from '@/db/client';
import {
  documentLocales,
  documentRevisions,
  documents,
  portfolioCategories,
  portfolioProjectCategories,
  portfolioProjects,
  serviceCategories,
} from '@/db/schema';
import type { Locale } from '@/i18n/routing';
import { PUBLIC_CACHE_PROFILE, tags } from '../cache-tags';

export type PortfolioCategory = {
  id: string;
  slug: string;
  label: LocalizedText;
  filterSlug: Partial<Record<Locale, string>>;
};

export type PortfolioCard = {
  documentId: string;
  slug: string;
  title: string;
  coverAssetId: string | null;
  categorySlugs: string[];
  city: string | null;
  isFeatured: boolean;
};

export async function getPortfolioCategories(): Promise<PortfolioCategory[]> {
  'use cache';
  cacheLife(PUBLIC_CACHE_PROFILE);
  cacheTag(tags.taxonomy());

  const rows = await db
    .select({
      id: portfolioCategories.id,
      slug: portfolioCategories.slug,
      label: portfolioCategories.label,
      filterSlug: portfolioCategories.filterSlug,
    })
    .from(portfolioCategories)
    .where(eq(portfolioCategories.isActive, true))
    .orderBy(asc(portfolioCategories.sortOrder));

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    label: (row.label ?? {}) as LocalizedText,
    filterSlug: (row.filterSlug ?? {}) as Partial<Record<Locale, string>>,
  }));
}

export async function getServiceCategories(
  direction: 'korpusnaya' | 'mebel' | 'dveri',
): Promise<Array<{ slug: string; label: LocalizedText; note: LocalizedText | null }>> {
  'use cache';
  cacheLife(PUBLIC_CACHE_PROFILE);
  cacheTag(tags.taxonomy());

  const rows = await db
    .select({
      slug: serviceCategories.slug,
      label: serviceCategories.label,
      note: serviceCategories.note,
    })
    .from(serviceCategories)
    .where(and(eq(serviceCategories.direction, direction), eq(serviceCategories.isActive, true)))
    .orderBy(asc(serviceCategories.sortOrder));

  return rows.map((row) => ({
    slug: row.slug,
    label: (row.label ?? {}) as LocalizedText,
    note: (row.note ?? null) as LocalizedText | null,
  }));
}

/**
 * Published projects for one locale.
 *
 * The title is read from the revision's meta rather than a duplicated column,
 * so a rollback restores the listing title together with the page content
 * instead of leaving the two out of step.
 */
export async function listPublishedProjects(locale: Locale): Promise<PortfolioCard[]> {
  'use cache';
  cacheLife(PUBLIC_CACHE_PROFILE);
  cacheTag(tags.projectsIndex(locale));

  const rows = await db
    .select({
      documentId: documents.id,
      slug: documentLocales.slug,
      meta: documentRevisions.meta,
      coverAssetId: portfolioProjects.coverAssetId,
      city: portfolioProjects.city,
      isFeatured: portfolioProjects.isFeatured,
      sortOrder: portfolioProjects.sortOrder,
      categorySlugs: sql<
        string[]
      >`coalesce(array_agg(${portfolioCategories.slug}) filter (where ${portfolioCategories.slug} is not null), '{}')`,
    })
    .from(documents)
    .innerJoin(
      documentLocales,
      and(
        eq(documentLocales.documentId, documents.id),
        eq(documentLocales.locale, locale),
        eq(documentLocales.status, 'published'),
        isNotNull(documentLocales.publishedRevisionId),
      ),
    )
    .innerJoin(documentRevisions, eq(documentRevisions.id, documentLocales.publishedRevisionId))
    .leftJoin(portfolioProjects, eq(portfolioProjects.documentId, documents.id))
    .leftJoin(portfolioProjectCategories, eq(portfolioProjectCategories.documentId, documents.id))
    .leftJoin(
      portfolioCategories,
      eq(portfolioCategories.id, portfolioProjectCategories.categoryId),
    )
    .where(eq(documents.kind, 'project'))
    .groupBy(
      documents.id,
      documentLocales.slug,
      documentRevisions.meta,
      portfolioProjects.coverAssetId,
      portfolioProjects.city,
      portfolioProjects.isFeatured,
      portfolioProjects.sortOrder,
    )
    .orderBy(asc(portfolioProjects.sortOrder), desc(documents.createdAt));

  return rows.map((row) => {
    const meta = (row.meta ?? {}) as {
      seo?: Partial<Record<Locale, { title?: string }>>;
      title?: Partial<Record<Locale, string>>;
    };
    return {
      documentId: row.documentId,
      slug: row.slug,
      title: meta.title?.[locale] ?? meta.title?.ru ?? meta.seo?.[locale]?.title ?? row.slug,
      coverAssetId: row.coverAssetId,
      categorySlugs: row.categorySlugs ?? [],
      city: row.city,
      isFeatured: row.isFeatured ?? false,
    };
  });
}

/** Specific projects by id, preserving the order the editor chose. */
export async function getProjectsByIds(
  locale: Locale,
  documentIds: string[],
): Promise<PortfolioCard[]> {
  if (documentIds.length === 0) return [];
  const all = await listPublishedProjects(locale);
  const byId = new Map(all.map((card) => [card.documentId, card]));
  return documentIds
    .map((id) => byId.get(id))
    .filter((card): card is PortfolioCard => card !== undefined);
}

/** Projects sharing a category with the given one, excluding itself. */
export async function getRelatedProjects(
  locale: Locale,
  documentId: string,
  limit = 3,
): Promise<PortfolioCard[]> {
  const all = await listPublishedProjects(locale);
  const current = all.find((card) => card.documentId === documentId);
  if (!current) return [];

  const sameCategory = all.filter(
    (card) =>
      card.documentId !== documentId &&
      card.categorySlugs.some((slug) => current.categorySlugs.includes(slug)),
  );

  // Top up with any other project rather than showing a lonely single card.
  const fillers = all.filter(
    (card) => card.documentId !== documentId && !sameCategory.includes(card),
  );

  return [...sameCategory, ...fillers].slice(0, limit);
}

export async function getProjectCategorySlugs(documentIds: string[]): Promise<Set<string>> {
  if (documentIds.length === 0) return new Set();
  const rows = await db
    .select({ slug: portfolioCategories.slug })
    .from(portfolioProjectCategories)
    .innerJoin(
      portfolioCategories,
      eq(portfolioCategories.id, portfolioProjectCategories.categoryId),
    )
    .where(inArray(portfolioProjectCategories.documentId, documentIds));
  return new Set(rows.map((row) => row.slug));
}
