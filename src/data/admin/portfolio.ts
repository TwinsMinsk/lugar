import 'server-only';

import { asc, eq, isNull } from 'drizzle-orm';

import type { LocalizedText } from '@/content/i18n';
import { db } from '@/db/client';
import {
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
    })
    .from(mediaAssets)
    .where(isNull(mediaAssets.deletedAt))
    .orderBy(asc(mediaAssets.isPlaceholder), asc(mediaAssets.createdAt));

  return rows.map((row) => {
    const alt = (row.alt ?? {}) as Record<string, string | undefined>;
    return {
      id: row.id,
      url: base ? `${base}/${row.storageKey}` : `/api/media/${row.storageKey}`,
      alt: alt.ru ?? '',
      isPlaceholder: row.isPlaceholder,
      width: row.width,
      height: row.height,
    };
  });
}
