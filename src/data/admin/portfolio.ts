import 'server-only';

import { asc, eq, isNull, sql } from 'drizzle-orm';

import type { LocalizedText } from '@/content/i18n';
import { db } from '@/db/client';
import {
  documentRevisions,
  documents,
  mediaAssets,
  portfolioCategories,
  portfolioProjectCategories,
  portfolioProjects,
} from '@/db/schema';
import { publicEnv } from '@/env';
import type { PickableAsset } from '@/features/admin/media-picker';
import { requireCapability } from '@/lib/auth/guards';

export type AdminProjectMeta = {
  documentId: string;
  coverAssetId: string | null;
  primaryCategoryId: string | null;
  categoryIds: string[];
  city: string | null;
  isFeatured: boolean;
  sortOrder: number;
};

export async function getProjectMeta(documentId: string): Promise<AdminProjectMeta | null> {
  await requireCapability('content.read');

  const [row] = await db
    .select()
    .from(portfolioProjects)
    .where(eq(portfolioProjects.documentId, documentId))
    .limit(1);
  if (!row) return null;

  const links = await db
    .select({ categoryId: portfolioProjectCategories.categoryId })
    .from(portfolioProjectCategories)
    .where(eq(portfolioProjectCategories.documentId, documentId));

  return {
    documentId,
    coverAssetId: row.coverAssetId,
    primaryCategoryId: row.primaryCategoryId,
    categoryIds: links.map((link) => link.categoryId),
    city: row.city,
    isFeatured: row.isFeatured,
    sortOrder: row.sortOrder,
  };
}

export async function listCategoriesForAdmin(): Promise<
  Array<{ id: string; slug: string; label: LocalizedText }>
> {
  await requireCapability('content.read');
  const rows = await db
    .select({
      id: portfolioCategories.id,
      slug: portfolioCategories.slug,
      label: portfolioCategories.label,
    })
    .from(portfolioCategories)
    .where(eq(portfolioCategories.isActive, true))
    .orderBy(asc(portfolioCategories.sortOrder));
  return rows.map((row) => ({ ...row, label: (row.label ?? {}) as LocalizedText }));
}

/**
 * Assets offered by the media picker.
 *
 * Placeholders are included deliberately: a page is often assembled before the
 * real photography exists, and excluding them would push the owner to leave the
 * slot empty instead — which reads as a broken page rather than as pending work.
 */
export async function listPickableAssets(): Promise<PickableAsset[]> {
  await requireCapability('media.read');

  const base = publicEnv.mediaBaseUrl.replace(/\/$/, '');
  const rows = await db
    .select({
      id: mediaAssets.id,
      storageKey: mediaAssets.storageKey,
      version: mediaAssets.version,
      alt: mediaAssets.alt,
      isPlaceholder: mediaAssets.isPlaceholder,
      width: mediaAssets.width,
      height: mediaAssets.height,
      /**
       * The smallest generated size.
       *
       * The picker draws 150px tiles, and pointing them at the originals meant
       * opening it downloaded the entire library at full resolution. Null
       * before processing has run, and the original is the fallback.
       */
      thumbnailKey: sql<string | null>`(
        select md.storage_key from media_derivatives md
         where md.asset_id = ${mediaAssets.id} and md.format = 'webp'
         order by md.width asc limit 1
      )`,
    })
    .from(mediaAssets)
    .where(isNull(mediaAssets.deletedAt))
    .orderBy(asc(mediaAssets.isPlaceholder), asc(mediaAssets.createdAt));

  return rows.map((row) => {
    const alt = (row.alt ?? {}) as Record<string, string | undefined>;
    return {
      id: row.id,
      url: (() => {
        const key = row.thumbnailKey ?? row.storageKey;
        return base ? `${base}/${key}` : `/api/media/${key}`;
      })(),
      alt: alt.ru ?? '',
      isPlaceholder: row.isPlaceholder,
      width: row.width,
      height: row.height,
    };
  });
}

export type AdminProjectCard = {
  documentId: string;
  /** From the draft revision's meta, which is where the card title is stored. */
  title: string | null;
  coverUrl: string | null;
  city: string | null;
  isFeatured: boolean;
};

/**
 * The extra columns the portfolio list needs.
 *
 * The list showed each project by its URL slug and nothing else — a table of
 * addresses for a furniture studio whose work is the whole point. Titles come
 * from the draft revision's `meta`, which is where `createProject` puts them
 * and where a rollback restores them from.
 *
 * Keyed by document id so the caller can merge it into whatever it already has
 * rather than this becoming a second, competing list query.
 */
export async function listProjectCards(): Promise<Map<string, AdminProjectCard>> {
  await requireCapability('content.read');

  const base = publicEnv.mediaBaseUrl.replace(/\/$/, '');

  const rows = await db
    .select({
      documentId: portfolioProjects.documentId,
      city: portfolioProjects.city,
      isFeatured: portfolioProjects.isFeatured,
      meta: documentRevisions.meta,
      coverKey: sql<string | null>`(
        select md.storage_key from media_derivatives md
         where md.asset_id = ${portfolioProjects.coverAssetId} and md.format = 'webp'
         order by md.width asc limit 1
      )`,
      coverOriginal: mediaAssets.storageKey,
    })
    .from(portfolioProjects)
    .innerJoin(documents, eq(documents.id, portfolioProjects.documentId))
    .leftJoin(documentRevisions, eq(documentRevisions.id, documents.draftRevisionId))
    .leftJoin(mediaAssets, eq(mediaAssets.id, portfolioProjects.coverAssetId));

  const cards = new Map<string, AdminProjectCard>();
  for (const row of rows) {
    const meta = (row.meta ?? {}) as { title?: Record<string, string> };
    const key = row.coverKey ?? row.coverOriginal;
    cards.set(row.documentId, {
      documentId: row.documentId,
      title: meta.title?.ru ?? null,
      coverUrl: key ? (base ? `${base}/${key}` : `/api/media/${key}`) : null,
      city: row.city,
      isFeatured: row.isFeatured,
    });
  }
  return cards;
}
