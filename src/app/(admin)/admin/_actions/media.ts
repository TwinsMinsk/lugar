'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { updateTag } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';

import { tags } from '@/data/cache-tags';
import { db } from '@/db/client';
import { documentLocales, mediaAssets, mediaDerivatives, mediaUsage } from '@/db/schema';
import { LOCALES } from '@/i18n/routing';
import { recordAudit } from '@/lib/audit';
import { requireCapability } from '@/lib/auth/guards';
import { MAX_UPLOAD_BYTES, processUpload, RECIPE } from '@/lib/media/process';

export type MediaActionResult =
  | { ok: true; assetId?: string }
  | { ok: false; error: string; blockedBy?: Array<{ locale: string; slug: string }> };

async function requestContext() {
  const headerList = await headers();
  return {
    ipAddress: headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: headerList.get('user-agent')?.slice(0, 500) ?? null,
  };
}

/**
 * Upload an image.
 *
 * Takes the bytes through a Server Action rather than a presigned direct upload
 * because processing (dimensions, derivatives, blur placeholder) has to happen
 * server-side anyway, and a two-step presign + notify flow can leave an object
 * in storage with no database row if the second step never arrives.
 *
 * If the same bytes were uploaded before, the existing asset is returned rather
 * than duplicated — the checksum is the natural key.
 */
export async function uploadMedia(formData: FormData): Promise<MediaActionResult> {
  const { user } = await requireCapability('media.write');

  const file = formData.get('file');
  if (!(file instanceof File)) return { ok: false, error: 'no_file' };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: 'file_too_large' };

  const altRu = String(formData.get('altRu') ?? '').trim();
  if (altRu.length === 0) {
    // Alt text is required at upload. Adding it "later" is how an image library
    // ends up with none, and a photography-led site is unusable without it.
    return { ok: false, error: 'alt_required' };
  }

  let processed;
  try {
    processed = await processUpload(Buffer.from(await file.arrayBuffer()));
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'processing_failed' };
  }

  const [existing] = await db
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.checksumSha256, processed.checksum), isNull(mediaAssets.deletedAt)))
    .limit(1);
  if (existing) return { ok: true, assetId: existing.id };

  const context = await requestContext();

  const assetId = await db.transaction(async (tx) => {
    const [asset] = await tx
      .insert(mediaAssets)
      .values({
        storageKey: processed.storageKey,
        checksumSha256: processed.checksum,
        mimeType: processed.mimeType,
        width: processed.width,
        height: processed.height,
        bytes: processed.bytes,
        originalFilename: file.name.slice(0, 200),
        lqip: processed.lqip,
        alt: { ru: altRu },
        recipeVersion: RECIPE.version,
        isPlaceholder: false,
        uploadedBy: user.id,
      })
      .returning({ id: mediaAssets.id });

    if (processed.derivatives.length > 0) {
      await tx.insert(mediaDerivatives).values(
        processed.derivatives.map((derivative) => ({
          assetId: asset!.id,
          width: derivative.width,
          format: derivative.format,
          storageKey: derivative.storageKey,
          bytes: derivative.bytes,
          recipeVersion: RECIPE.version,
        })),
      );
    }

    await recordAudit(
      {
        actorUserId: user.id,
        action: 'media.uploaded',
        entityType: 'media_asset',
        entityId: asset!.id,
        after: { bytes: processed.bytes, width: processed.width, height: processed.height },
        ...context,
      },
      tx,
    );

    return asset!.id;
  });

  return { ok: true, assetId };
}

const metaSchema = z.object({
  assetId: z.uuid(),
  alt: z.object({
    ru: z.string().trim().min(1).max(200),
    es: z.string().trim().max(200).optional(),
    en: z.string().trim().max(200).optional(),
  }),
  focalX: z.number().min(0).max(1),
  focalY: z.number().min(0).max(1),
  credit: z.string().trim().max(200).optional(),
});

/** Update alt text, focal point and credit. */
export async function updateMediaMeta(
  input: z.input<typeof metaSchema>,
): Promise<MediaActionResult> {
  const { user } = await requireCapability('media.write');

  const parsed = metaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  const { assetId, alt, focalX, focalY, credit } = parsed.data;

  const cleanedAlt: Record<string, string> = { ru: alt.ru };
  // An empty translation is absent, not blank — so the fallback shows Russian.
  if (alt.es) cleanedAlt.es = alt.es;
  if (alt.en) cleanedAlt.en = alt.en;

  const context = await requestContext();

  await db.transaction(async (tx) => {
    await tx
      .update(mediaAssets)
      .set({ alt: cleanedAlt, focalX, focalY, credit: credit ?? null })
      .where(eq(mediaAssets.id, assetId));

    await recordAudit(
      {
        actorUserId: user.id,
        action: 'media.meta_updated',
        entityType: 'media_asset',
        entityId: assetId,
        after: { focalX, focalY, altLocales: Object.keys(cleanedAlt) },
        ...context,
      },
      tx,
    );
  });

  updateTag(tags.media(assetId));
  for (const locale of LOCALES) updateTag(tags.navigation(locale));
  return { ok: true };
}

/**
 * Soft-delete an asset.
 *
 * Refuses when the asset is referenced by a revision that is currently live,
 * and names the pages rather than returning a bare refusal — "cannot delete" is
 * useless if the owner cannot find out why. The database enforces the same rule
 * independently through media_usage's RESTRICT foreign key, so this check being
 * bypassed still cannot orphan a published page's photograph.
 */
export async function deleteMedia(assetId: string): Promise<MediaActionResult> {
  const { user } = await requireCapability('media.delete');

  const blocking = await db
    .select({ locale: documentLocales.locale, slug: documentLocales.slug })
    .from(mediaUsage)
    .innerJoin(documentLocales, eq(documentLocales.publishedRevisionId, mediaUsage.revisionId))
    .where(and(eq(mediaUsage.assetId, assetId), eq(documentLocales.status, 'published')));

  if (blocking.length > 0) {
    return {
      ok: false,
      error: 'in_use_on_published_page',
      blockedBy: blocking.map((row) => ({ locale: row.locale, slug: row.slug })),
    };
  }

  const context = await requestContext();

  try {
    await db.transaction(async (tx) => {
      // Soft delete: the bytes stay, so an accidental removal is recoverable
      // and historic revisions still render if someone rolls back.
      await tx
        .update(mediaAssets)
        .set({ deletedAt: new Date() })
        .where(eq(mediaAssets.id, assetId));

      await recordAudit(
        {
          actorUserId: user.id,
          action: 'media.deleted',
          entityType: 'media_asset',
          entityId: assetId,
          ...context,
        },
        tx,
      );
    });
  } catch {
    // The RESTRICT foreign key fires when a draft still references the asset.
    return { ok: false, error: 'still_referenced' };
  }

  updateTag(tags.media(assetId));
  return { ok: true };
}

/**
 * Replace an asset's file in place.
 *
 * Keeps the same id, so every block that points at it follows automatically and
 * no revision has to be rewritten. The version counter is bumped and appended to
 * the public URL, which busts caches without changing the storage key.
 */
export async function replaceMedia(formData: FormData): Promise<MediaActionResult> {
  const { user } = await requireCapability('media.write');

  const assetId = String(formData.get('assetId') ?? '');
  if (!z.uuid().safeParse(assetId).success) return { ok: false, error: 'invalid_input' };

  const file = formData.get('file');
  if (!(file instanceof File)) return { ok: false, error: 'no_file' };

  let processed;
  try {
    processed = await processUpload(Buffer.from(await file.arrayBuffer()));
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'processing_failed' };
  }

  const [current] = await db
    .select({ version: mediaAssets.version })
    .from(mediaAssets)
    .where(eq(mediaAssets.id, assetId))
    .limit(1);
  if (!current) return { ok: false, error: 'not_found' };

  const context = await requestContext();

  await db.transaction(async (tx) => {
    await tx
      .update(mediaAssets)
      .set({
        storageKey: processed.storageKey,
        checksumSha256: processed.checksum,
        mimeType: processed.mimeType,
        width: processed.width,
        height: processed.height,
        bytes: processed.bytes,
        lqip: processed.lqip,
        version: current.version + 1,
        recipeVersion: RECIPE.version,
        // A replaced placeholder is, by definition, no longer a placeholder.
        isPlaceholder: false,
      })
      .where(eq(mediaAssets.id, assetId));

    await tx.delete(mediaDerivatives).where(eq(mediaDerivatives.assetId, assetId));
    if (processed.derivatives.length > 0) {
      await tx.insert(mediaDerivatives).values(
        processed.derivatives.map((derivative) => ({
          assetId,
          width: derivative.width,
          format: derivative.format,
          storageKey: derivative.storageKey,
          bytes: derivative.bytes,
          recipeVersion: RECIPE.version,
        })),
      );
    }

    await recordAudit(
      {
        actorUserId: user.id,
        action: 'media.replaced',
        entityType: 'media_asset',
        entityId: assetId,
        after: { version: current.version + 1 },
        ...context,
      },
      tx,
    );
  });

  // Every page showing this asset must re-render with the new version.
  const affected = await db
    .selectDistinct({ documentId: mediaUsage.documentId })
    .from(mediaUsage)
    .where(eq(mediaUsage.assetId, assetId));

  updateTag(tags.media(assetId));
  for (const row of affected) {
    for (const locale of LOCALES) updateTag(tags.document(row.documentId, locale));
  }

  return { ok: true, assetId };
}
