import 'server-only';

import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';

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
  focalX: number;
  focalY: number;
  isPlaceholder: boolean;
  version: number;
  /** Smallest generated derivative; null before processing has run. */
  thumbnailKey: string | null;
  createdAt: Date;
  /** How many distinct revisions reference this asset. */
  usageCount: number;
  /** True when at least one of those revisions is live somewhere. */
  usedOnPublishedPage: boolean;
};

/**
 * A page of the library.
 *
 * Paged, and with a thumbnail key, because the screen this feeds used to load
 * every asset at once and point each card at the *original* file. That is fine
 * with the seeded placeholders and unusable the moment a real shoot is
 * uploaded: fifty 4-megapixel JPEGs is a hundred megabytes of downloads to
 * decide which photo goes on a page.
 *
 * Offset paging rather than keyset: unlike the lead inbox, nothing here is
 * being inserted while someone reads, and the owner wants page numbers.
 */
export async function listMedia(options?: {
  onlyPlaceholders?: boolean;
  /** The removed images, for the archive section rather than the library. */
  deleted?: boolean;
  /** Free text over the Russian description. */
  q?: string;
  page?: number;
  perPage?: number;
}): Promise<{ rows: AdminMediaAsset[]; total: number; page: number; perPage: number }> {
  await requireCapability('media.read');

  const perPage = Math.min(Math.max(options?.perPage ?? 24, 1), 96);
  const page = Math.max(options?.page ?? 1, 1);
  const term = options?.q?.trim();

  const where = and(
    options?.deleted ? isNotNull(mediaAssets.deletedAt) : isNull(mediaAssets.deletedAt),
    options?.onlyPlaceholders ? eq(mediaAssets.isPlaceholder, true) : undefined,
    // The description is a locale map; `->>'ru'` is what the card shows.
    term
      ? sql`${mediaAssets.alt}->>'ru' ilike ${'%' + term.replace(/[%_]/g, '') + '%'}`
      : undefined,
  );

  const rows = await db
    .select({
      id: mediaAssets.id,
      storageKey: mediaAssets.storageKey,
      mimeType: mediaAssets.mimeType,
      width: mediaAssets.width,
      height: mediaAssets.height,
      bytes: mediaAssets.bytes,
      alt: mediaAssets.alt,
      focalX: mediaAssets.focalX,
      focalY: mediaAssets.focalY,
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
      /**
       * The smallest derivative, for the card.
       *
       * Chosen in SQL rather than by loading every derivative and picking in
       * JS: the card needs exactly one key, and the alternative is a second
       * query per asset. Null for an asset whose derivatives have not been
       * generated, and the card falls back to the original.
       */
      thumbnailKey: sql<string | null>`(
        select md.storage_key from media_derivatives md
         where md.asset_id = ${mediaAssets.id} and md.format = 'webp'
         order by md.width asc limit 1
      )`,
    })
    .from(mediaAssets)
    .where(where)
    .orderBy(desc(mediaAssets.createdAt))
    .limit(perPage)
    .offset((page - 1) * perPage);

  const [counted] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(mediaAssets)
    .where(where);

  return {
    rows: rows.map((row) => ({
      ...row,
      alt: (row.alt ?? {}) as Record<string, string | undefined>,
    })),
    total: counted?.count ?? 0,
    page,
    perPage,
  };
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
