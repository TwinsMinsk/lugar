import 'server-only';

import { inArray } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';

import type { LocalizedTextOptional } from '@/content/i18n';
import { db } from '@/db/client';
import { mediaAssets } from '@/db/schema';
import { PUBLIC_CACHE_PROFILE, tags } from '../cache-tags';

export type MediaAsset = {
  id: string;
  storageKey: string;
  mimeType: string;
  width: number;
  height: number;
  lqip: string | null;
  focalX: number;
  focalY: number;
  alt: LocalizedTextOptional;
  caption: LocalizedTextOptional | null;
  credit: string | null;
  version: number;
  isPlaceholder: boolean;
};

/**
 * Batch-load assets by id.
 *
 * A page resolves all of its media in ONE query (`WHERE id = ANY($1)`) rather
 * than one query per image. With a photography-led design that is the
 * difference between four queries per page and forty.
 */
export async function getMediaAssets(ids: string[]): Promise<Map<string, MediaAsset>> {
  if (ids.length === 0) return new Map();
  return getMediaAssetsCached([...new Set(ids)].sort());
}

async function getMediaAssetsCached(ids: string[]): Promise<Map<string, MediaAsset>> {
  'use cache';
  cacheLife(PUBLIC_CACHE_PROFILE);
  for (const id of ids) cacheTag(tags.media(id));

  const rows = await db
    .select({
      id: mediaAssets.id,
      storageKey: mediaAssets.storageKey,
      mimeType: mediaAssets.mimeType,
      width: mediaAssets.width,
      height: mediaAssets.height,
      lqip: mediaAssets.lqip,
      focalX: mediaAssets.focalX,
      focalY: mediaAssets.focalY,
      alt: mediaAssets.alt,
      caption: mediaAssets.caption,
      credit: mediaAssets.credit,
      version: mediaAssets.version,
      isPlaceholder: mediaAssets.isPlaceholder,
    })
    .from(mediaAssets)
    .where(inArray(mediaAssets.id, ids));

  return new Map(
    rows.map((row) => [
      row.id,
      {
        ...row,
        alt: (row.alt ?? {}) as LocalizedTextOptional,
        caption: (row.caption ?? null) as LocalizedTextOptional | null,
      },
    ]),
  );
}
