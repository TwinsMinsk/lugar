import { eq, sql } from 'drizzle-orm';

import { collectMediaUsage } from '@/content/blocks/media-usage';
import type { AnyBlock } from '@/content/blocks/union';
import { LOCALES } from '@/i18n/routing';
import { db } from '../client';
import {
  documentLocales,
  documentRevisions,
  documents,
  mediaAssets,
  mediaUsage,
  navigationItems,
} from '../schema';
import {
  id,
  LEGAL_SEEDS,
  NAVIGATION_SEED,
  PAGE_SEEDS,
  PLACEHOLDER_ASSETS,
  type PageSeed,
} from './content';

/**
 * Seeds page documents, their published revision and their locale rows.
 *
 * Idempotent: documents are keyed on `seed_key` with ON CONFLICT DO NOTHING,
 * and block content is only written when creating the document for the first
 * time. Re-running after launch therefore cannot overwrite the owner's edits.
 */
export async function seedPlaceholderMedia(): Promise<number> {
  const rows = PLACEHOLDER_ASSETS.map((asset) => ({
    id: id(`media:${asset.key}`),
    // No file is uploaded. The renderer draws a hatched REPLACE frame from
    // `is_placeholder` alone, so no image bytes are ever fabricated.
    storageKey: `placeholder/${asset.key}`,
    checksumSha256: `placeholder-${asset.key}`,
    mimeType: 'image/svg+xml',
    width: asset.width,
    height: asset.height,
    bytes: 0,
    alt: asset.alt,
    isPlaceholder: true,
  }));

  const inserted = await db
    .insert(mediaAssets)
    .values(rows)
    .onConflictDoNothing({ target: mediaAssets.id })
    .returning({ id: mediaAssets.id });

  return inserted.length;
}

async function seedOnePage(seed: PageSeed): Promise<boolean> {
  const documentId = id(`doc:${seed.seedKey}`);

  const [document] = await db
    .insert(documents)
    .values({
      id: documentId,
      kind: 'page',
      template: seed.template,
      seedKey: seed.seedKey,
      baseSlug: seed.slugs.ru,
      isSystem: seed.isSystem,
    })
    // `documents_seed_key_uq` is a PARTIAL unique index, so Postgres can only
    // use it as a conflict arbiter when the same predicate is restated here.
    .onConflictDoNothing({ target: documents.seedKey, where: sql`seed_key is not null` })
    .returning({ id: documents.id });

  // Already present — leave the owner's content alone.
  if (!document) return false;

  const blocks = seed.blocks as AnyBlock[];
  const meta = { seo: seed.seo };

  const publishedRevisionId = id(`rev:${seed.seedKey}:1`);
  const draftRevisionId = id(`rev:${seed.seedKey}:2`);

  await db.insert(documentRevisions).values([
    {
      id: publishedRevisionId,
      documentId,
      revisionNumber: 1,
      isDraft: false,
      blocks,
      meta,
      note: 'Seeded from the approved design prototype.',
    },
    // A fresh draft cloned from the published revision, so the owner can start
    // editing immediately without the first save having to create one.
    {
      id: draftRevisionId,
      documentId,
      revisionNumber: 2,
      isDraft: true,
      blocks,
      meta,
    },
  ]);

  await db.update(documents).set({ draftRevisionId }).where(eq(documents.id, documentId));

  await db.insert(documentLocales).values(
    LOCALES.map((locale) => ({
      documentId,
      locale,
      kind: 'page' as const,
      slug: seed.slugs[locale],
      status: 'published' as const,
      publishedRevisionId,
      publishedAt: new Date(),
    })),
  );

  // Media usage for the published revision — this is what makes the database
  // refuse to delete an asset that a live page still shows.
  const usage = collectMediaUsage(blocks);
  if (usage.length > 0) {
    await db
      .insert(mediaUsage)
      .values(
        usage.flatMap((entry) =>
          [publishedRevisionId, draftRevisionId].map((revisionId) => ({
            assetId: entry.assetId,
            revisionId,
            documentId,
            blockId: entry.blockId,
            fieldPath: entry.fieldPath,
          })),
        ),
      )
      .onConflictDoNothing();
  }

  return true;
}

export async function seedPages(): Promise<number> {
  let created = 0;
  for (const seed of [...PAGE_SEEDS, ...LEGAL_SEEDS]) {
    if (await seedOnePage(seed)) created += 1;
  }
  return created;
}

export async function seedNavigation(): Promise<number> {
  const rows = [
    ...NAVIGATION_SEED.header.map((item, index) => ({
      id: id(`nav:${item.key}`),
      menu: 'header',
      label: item.label,
      documentId: item.documentId,
      sortOrder: (index + 1) * 100,
      isVisible: true,
    })),
    ...NAVIGATION_SEED.footer_legal.map((item, index) => ({
      id: id(`nav:${item.key}`),
      menu: 'footer_legal',
      label: item.label,
      documentId: item.documentId,
      sortOrder: (index + 1) * 100,
      isVisible: true,
    })),
  ];

  const inserted = await db
    .insert(navigationItems)
    .values(rows)
    .onConflictDoNothing({ target: navigationItems.id })
    .returning({ id: navigationItems.id });

  return inserted.length;
}
