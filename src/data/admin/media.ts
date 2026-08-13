import 'server-only';

import { and, desc, eq, isNull, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { documentLocales, mediaAssets, mediaUsage } from '@/db/schema';
import { requireCapability } from '@/lib/auth/guards';

/** Count of placeholder assets still standing in for real photography. */
export async function countPlaceholderMedia(): Promise<number> {
  await requireCapability('media.read');
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.isPlaceholder, true), isNull(mediaAssets.deletedAt)));
  return row?.n ?? 0;
}

export type AdminMediaAsset = {
  id: string;
  storageKey: string;
  mimeType: string;
  width: number;
  height: number;
  bytes: number;
  alt: Record<string, string | undefined>;
  isPlaceholder: boolean;
  version: number;
  createdAt: Date;
  /** How many distinct revisions reference this asset. */
  usageCount: number;
  /** True when at least one of those revisions is live somewhere. */
  usedOnPublishedPage: boolean;
};

export async function listMedia(options?: {
  onlyPlaceholders?: boolean;
}): Promise<AdminMediaAsset[]> {
  await requireCapability('media.read');

  const rows = await db
    .select({
      id: mediaAssets.id,
      storageKey: mediaAssets.storageKey,
      mimeType: mediaAssets.mimeType,
      width: mediaAssets.width,
      height: mediaAssets.height,
      bytes: mediaAssets.bytes,
      alt: mediaAssets.alt,
      isPlaceholder: mediaAssets.isPlaceholder,
      version: mediaAssets.version,
      createdAt: mediaAssets.createdAt,
      usageCount: sql<number>`(
        select count(distinct mu.revision_id)::int
        from media_usage mu where mu.asset_id = ${mediaAssets.id}
      )`,
      usedOnPublishedPage: sql<boolean>`exists (
        select 1 from media_usage mu
        join document_locales dl on dl.published_revision_id = mu.revision_id
        where mu.asset_id = ${mediaAssets.id} and dl.status = 'published'
      )`,
    })
    .from(mediaAssets)
    .where(
      options?.onlyPlaceholders
        ? and(isNull(mediaAssets.deletedAt), eq(mediaAssets.isPlaceholder, true))
        : isNull(mediaAssets.deletedAt),
    )
    .orderBy(desc(mediaAssets.createdAt));

  return rows.map((row) => ({
    ...row,
    alt: (row.alt ?? {}) as Record<string, string | undefined>,
  }));
}

export type MediaUsageEntry = {
  documentId: string;
  locale: string;
  slug: string;
  kind: string;
  status: string;
  fieldPath: string;
};

/**
 * Where an asset is used.
 *
 * Powers the delete guard: an asset referenced by a *published* revision cannot
 * be removed, and the admin shows the exact pages rather than a bare refusal.
 */
export async function getMediaUsage(assetId: string): Promise<MediaUsageEntry[]> {
  await requireCapability('media.read');

  const rows = await db
    .select({
      documentId: mediaUsage.documentId,
      locale: documentLocales.locale,
      slug: documentLocales.slug,
      kind: documentLocales.kind,
      status: documentLocales.status,
      fieldPath: mediaUsage.fieldPath,
    })
    .from(mediaUsage)
    .innerJoin(documentLocales, eq(documentLocales.publishedRevisionId, mediaUsage.revisionId))
    .where(eq(mediaUsage.assetId, assetId));

  return rows;
}
