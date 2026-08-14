'use server';

import { and, eq, max } from 'drizzle-orm';
import { updateTag } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';

import { collectMediaUsage } from '@/content/blocks/media-usage';
import { blocksSchema, type AnyBlock } from '@/content/blocks/union';
import { tags } from '@/data/cache-tags';
import { db } from '@/db/client';
import { documentLocales, documentRevisions, documents, mediaUsage, redirects } from '@/db/schema';
import { LOCALES, type Locale } from '@/i18n/routing';
import { recordAudit, summarizeBlocks } from '@/lib/audit';
import { requireCapability } from '@/lib/auth/guards';

/**
 * Content mutations.
 *
 * Publishing is atomic for a whole page, not per block: a half-published page —
 * new hero, old contact block — is a state no reviewer approved and no visitor
 * should ever see.
 *
 * Revisions are immutable once frozen, so rollback is a single pointer move
 * rather than a re-import of old content.
 */

const localeSchema = z.enum(LOCALES);

async function requestContext() {
  const headerList = await headers();
  return {
    ipAddress: headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: headerList.get('user-agent')?.slice(0, 500) ?? null,
  };
}

/** Recompute media usage for one revision from its block tree. */
async function syncMediaUsage(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  documentId: string,
  revisionId: string,
  blocks: AnyBlock[],
) {
  await tx.delete(mediaUsage).where(eq(mediaUsage.revisionId, revisionId));
  const usage = collectMediaUsage(blocks);
  if (usage.length === 0) return;
  await tx
    .insert(mediaUsage)
    .values(
      usage.map((entry) => ({
        assetId: entry.assetId,
        revisionId,
        documentId,
        blockId: entry.blockId,
        fieldPath: entry.fieldPath,
      })),
    )
    .onConflictDoNothing();
}

/** Invalidate every cache entry a published document participates in. */
async function invalidateDocument(documentId: string) {
  const localeRows = await db
    .select({
      locale: documentLocales.locale,
      slug: documentLocales.slug,
      kind: documentLocales.kind,
    })
    .from(documentLocales)
    .where(eq(documentLocales.documentId, documentId));

  for (const row of localeRows) {
    const locale = row.locale as Locale;
    // updateTag, not revalidateTag: the owner must see their change on the very
    // next request, not after a stale-while-revalidate round.
    updateTag(tags.path(row.kind, locale, row.slug));
    updateTag(tags.document(documentId, locale));
    updateTag(tags.projectsIndex(locale));
    updateTag(tags.navigation(locale));
  }
}

export type ActionResult = { ok: true } | { ok: false; error: string };

const saveDraftSchema = z.object({
  documentId: z.uuid(),
  blocks: z.unknown(),
  note: z.string().max(200).optional(),
});

/**
 * Save the draft.
 *
 * Validation is strict here — an invalid block is never persisted. The public
 * renderer is lenient by comparison (it drops a bad block rather than failing
 * the page), because being strict on write and forgiving on read is the only
 * combination that neither loses data nor takes a live page down.
 */
export async function saveDraft(input: z.input<typeof saveDraftSchema>): Promise<ActionResult> {
  const { user } = await requireCapability('content.write');

  const parsedInput = saveDraftSchema.safeParse(input);
  if (!parsedInput.success) return { ok: false, error: 'invalid_input' };

  const parsedBlocks = blocksSchema.safeParse(parsedInput.data.blocks);
  if (!parsedBlocks.success) {
    return { ok: false, error: 'invalid_blocks' };
  }
  const blocks = parsedBlocks.data;

  const [document] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, parsedInput.data.documentId))
    .limit(1);
  if (!document?.draftRevisionId) return { ok: false, error: 'not_found' };

  const context = await requestContext();

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ blocks: documentRevisions.blocks })
      .from(documentRevisions)
      .where(eq(documentRevisions.id, document.draftRevisionId!))
      .limit(1);

    await tx
      .update(documentRevisions)
      .set({ blocks, note: parsedInput.data.note ?? null, createdBy: user.id })
      .where(eq(documentRevisions.id, document.draftRevisionId!));

    await syncMediaUsage(tx, document.id, document.draftRevisionId!, blocks);

    await recordAudit(
      {
        actorUserId: user.id,
        action: 'content.draft_saved',
        entityType: 'document',
        entityId: document.id,
        before: summarizeBlocks((existing?.blocks ?? []) as AnyBlock[]),
        after: summarizeBlocks(blocks),
        ...context,
      },
      tx,
    );
  });

  return { ok: true };
}

const publishSchema = z.object({
  documentId: z.uuid(),
  locales: z.array(localeSchema).min(1),
  note: z.string().max(200).optional(),
});

/**
 * Publish the current draft to one or more locales.
 *
 * Freezes the draft, points the chosen locales at it, then clones a fresh
 * draft. Publishing another locale later against the same frozen revision only
 * moves that locale's pointer — no reclone, and the two locales stay on
 * genuinely identical content.
 */
export async function publishDocument(input: z.input<typeof publishSchema>): Promise<ActionResult> {
  const { user } = await requireCapability('content.publish');

  const parsed = publishSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  const { documentId, locales, note } = parsed.data;

  const context = await requestContext();

  try {
    await db.transaction(async (tx) => {
      const [document] = await tx
        .select()
        .from(documents)
        .where(eq(documents.id, documentId))
        .limit(1);
      if (!document?.draftRevisionId) throw new Error('not_found');

      const draftId = document.draftRevisionId;

      const [draft] = await tx
        .select()
        .from(documentRevisions)
        .where(eq(documentRevisions.id, draftId))
        .limit(1);
      if (!draft) throw new Error('not_found');

      // Freeze the draft. It becomes an immutable historical revision.
      await tx
        .update(documentRevisions)
        .set({ isDraft: false, note: note ?? draft.note })
        .where(eq(documentRevisions.id, draftId));

      // At most three locales, so a loop is clearer than an IN-list cast.
      const publishedAt = new Date();
      for (const locale of locales) {
        await tx
          .update(documentLocales)
          .set({ status: 'published', publishedRevisionId: draftId, publishedAt })
          .where(
            and(eq(documentLocales.documentId, documentId), eq(documentLocales.locale, locale)),
          );
      }

      // Clone a fresh draft so editing can continue immediately.
      const [highestRow] = await tx
        .select({ value: max(documentRevisions.revisionNumber) })
        .from(documentRevisions)
        .where(eq(documentRevisions.documentId, documentId));

      const [newDraft] = await tx
        .insert(documentRevisions)
        .values({
          documentId,
          revisionNumber: (highestRow?.value ?? draft.revisionNumber) + 1,
          isDraft: true,
          blocks: draft.blocks,
          meta: draft.meta,
          createdBy: user.id,
        })
        .returning({ id: documentRevisions.id });

      await tx
        .update(documents)
        .set({ draftRevisionId: newDraft!.id })
        .where(eq(documents.id, documentId));

      await syncMediaUsage(tx, documentId, newDraft!.id, (draft.blocks ?? []) as AnyBlock[]);

      await recordAudit(
        {
          actorUserId: user.id,
          action: 'content.published',
          entityType: 'document',
          entityId: documentId,
          after: { locales, revisionNumber: draft.revisionNumber },
          ...context,
        },
        tx,
      );
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'publish_failed' };
  }

  await invalidateDocument(documentId);
  return { ok: true };
}

const rollbackSchema = z.object({
  documentId: z.uuid(),
  revisionId: z.uuid(),
  locales: z.array(localeSchema).min(1),
});

/**
 * Restore a previously published revision.
 *
 * A single pointer move — the revision itself was never mutated, so this cannot
 * fail halfway or reconstruct content approximately.
 */
export async function rollbackDocument(
  input: z.input<typeof rollbackSchema>,
): Promise<ActionResult> {
  const { user } = await requireCapability('content.rollback');

  const parsed = rollbackSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  const { documentId, revisionId, locales } = parsed.data;

  const context = await requestContext();

  try {
    await db.transaction(async (tx) => {
      const [revision] = await tx
        .select({ id: documentRevisions.id, number: documentRevisions.revisionNumber })
        .from(documentRevisions)
        .where(
          and(
            eq(documentRevisions.id, revisionId),
            // Guard against pointing a document at another document's revision.
            eq(documentRevisions.documentId, documentId),
            eq(documentRevisions.isDraft, false),
          ),
        )
        .limit(1);
      if (!revision) throw new Error('revision_not_found');

      for (const locale of locales) {
        await tx
          .update(documentLocales)
          .set({
            status: 'published',
            publishedRevisionId: revisionId,
            publishedAt: new Date(),
          })
          .where(
            and(eq(documentLocales.documentId, documentId), eq(documentLocales.locale, locale)),
          );
      }

      await recordAudit(
        {
          actorUserId: user.id,
          action: 'content.rolled_back',
          entityType: 'document',
          entityId: documentId,
          after: { locales, revisionNumber: revision.number },
          ...context,
        },
        tx,
      );
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'rollback_failed' };
  }

  await invalidateDocument(documentId);
  return { ok: true };
}

const unpublishSchema = z.object({
  documentId: z.uuid(),
  locales: z.array(localeSchema).min(1),
});

/**
 * Take a locale off the public site.
 *
 * The published pointer is retained, so republishing is one click and the
 * revision it served is not orphaned. System pages cannot be unpublished — a
 * site with no home page is not a state the CMS should be able to reach.
 */
export async function unpublishDocument(
  input: z.input<typeof unpublishSchema>,
): Promise<ActionResult> {
  const { user } = await requireCapability('content.publish');

  const parsed = unpublishSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  const { documentId, locales } = parsed.data;

  const [document] = await db
    .select({ isSystem: documents.isSystem })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);
  if (!document) return { ok: false, error: 'not_found' };
  if (document.isSystem) return { ok: false, error: 'system_document' };

  const context = await requestContext();

  await db.transaction(async (tx) => {
    for (const locale of locales) {
      await tx
        .update(documentLocales)
        .set({ status: 'archived' })
        .where(and(eq(documentLocales.documentId, documentId), eq(documentLocales.locale, locale)));
    }
    await recordAudit(
      {
        actorUserId: user.id,
        action: 'content.unpublished',
        entityType: 'document',
        entityId: documentId,
        after: { locales },
        ...context,
      },
      tx,
    );
  });

  await invalidateDocument(documentId);
  return { ok: true };
}

const slugSchema = z.object({
  documentId: z.uuid(),
  locale: localeSchema,
  slug: z
    .string()
    .trim()
    .max(96)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$|^$/, 'slug_format'),
});

/**
 * Change a locale's slug.
 *
 * Writes a 301 from the old path automatically when the locale was published,
 * so a renamed page keeps whatever search ranking it had instead of 404ing.
 */
export async function updateSlug(input: z.input<typeof slugSchema>): Promise<ActionResult> {
  const { user } = await requireCapability('content.write');

  const parsed = slugSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'slug_format' };
  const { documentId, locale, slug } = parsed.data;

  const [current] = await db
    .select()
    .from(documentLocales)
    .where(and(eq(documentLocales.documentId, documentId), eq(documentLocales.locale, locale)))
    .limit(1);
  if (!current) return { ok: false, error: 'not_found' };
  if (current.slug === slug) return { ok: true };

  const context = await requestContext();

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(documentLocales)
        .set({ slug })
        .where(and(eq(documentLocales.documentId, documentId), eq(documentLocales.locale, locale)));

      if (current.status === 'published' && current.slug !== '') {
        const from = locale === 'ru' ? `/${current.slug}` : `/${locale}/${current.slug}`;
        const to =
          slug === ''
            ? locale === 'ru'
              ? '/'
              : `/${locale}`
            : locale === 'ru'
              ? `/${slug}`
              : `/${locale}/${slug}`;
        // Renaming *back* to a path we previously redirected away from would
        // otherwise leave /a -> /b and /b -> /a pointing at each other. The
        // page now lives here again, so its old redirect is simply wrong.
        await tx.delete(redirects).where(eq(redirects.fromPath, to));

        await tx
          .insert(redirects)
          .values({
            fromPath: from,
            toPath: to,
            statusCode: 301,
            // Recorded so the redirects screen can explain where a rule the
            // owner never typed came from.
            note: 'Автоматически: адрес страницы изменён',
            createdBy: user.id,
          })
          .onConflictDoUpdate({
            target: redirects.fromPath,
            set: { toPath: to, isActive: true },
          });
      }

      await recordAudit(
        {
          actorUserId: user.id,
          action: 'content.slug_changed',
          entityType: 'document',
          entityId: documentId,
          before: { locale, slug: current.slug },
          after: { locale, slug },
          ...context,
        },
        tx,
      );
    });
  } catch {
    // The unique index on (kind, locale, slug) is what rejects a collision.
    return { ok: false, error: 'slug_taken' };
  }

  await invalidateDocument(documentId);
  updateTag(tags.redirects());
  return { ok: true };
}
