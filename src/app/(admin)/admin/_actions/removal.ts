'use server';

import { and, eq, isNotNull, or } from 'drizzle-orm';
import { headers } from 'next/headers';
import { z } from 'zod';

import { invalidateDocumentRefs, readDocumentLocaleRefs } from '@/data/cache-invalidation';
import { db } from '@/db/client';
import { documentLocales, documents } from '@/db/schema';
import { recordAudit } from '@/lib/audit';
import { requireCapability } from '@/lib/auth/guards';

/**
 * Removal, in two levels.
 *
 * The panel distinguishes three things that all read as "delete" in ordinary
 * speech, and keeping them apart is what makes removal safe enough to offer:
 *
 *   Снять с сайта   unpublish — `document_locales.status`, per locale
 *   Убрать          out of the working list — `documents.archived_at`, per record
 *   Удалить навсегда a real DELETE, and only for something never published
 *
 * The middle one is what was missing: a project could be taken off the site but
 * never out of the panel, so a test entry stayed in the list forever with its
 * address permanently occupied.
 *
 * Level 2 is deliberately narrow. Once a document has been on the site its
 * revisions are history — rollback reads them, the audit trail points at them,
 * and someone may hold a link to it. Nothing about tidying a list justifies
 * destroying that, so the offer simply is not made and the reason is shown in
 * its place.
 */

export type RemovalResult =
  { ok: true } | { ok: false; error: string; blockedBy?: Array<Record<string, string>> };

async function requestContext() {
  const headerList = await headers();
  return {
    ipAddress: headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: headerList.get('user-agent')?.slice(0, 500) ?? null,
  };
}

async function loadDocument(documentId: string) {
  const [row] = await db
    .select({
      id: documents.id,
      kind: documents.kind,
      isSystem: documents.isSystem,
      archivedAt: documents.archivedAt,
    })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);
  return row ?? null;
}

/**
 * Level 1 — out of the working list.
 *
 * Also unpublishes, in the same transaction. The public resolver excludes
 * archived documents, so leaving a locale marked `published` would mean the
 * database claiming a page is on the site that nothing serves — and restoring
 * it later would silently put it back in front of visitors. Removal is the
 * stronger verb by design: off the site *and* out of the list, one undo away.
 */
export async function archiveDocument(documentId: string): Promise<RemovalResult> {
  const { user } = await requireCapability('content.delete');
  if (!z.uuid().safeParse(documentId).success) return { ok: false, error: 'invalid_input' };

  const document = await loadDocument(documentId);
  if (!document) return { ok: false, error: 'not_found' };
  if (document.isSystem) return { ok: false, error: 'system_document' };
  if (document.archivedAt) return { ok: true };

  const refs = await readDocumentLocaleRefs(documentId);
  const context = await requestContext();

  await db.transaction(async (tx) => {
    await tx.update(documents).set({ archivedAt: new Date() }).where(eq(documents.id, documentId));

    await tx
      .update(documentLocales)
      .set({ status: 'archived' })
      .where(eq(documentLocales.documentId, documentId));

    await recordAudit(
      {
        actorUserId: user.id,
        action: 'document.archived',
        entityType: 'document',
        entityId: documentId,
        after: { kind: document.kind },
        ...context,
      },
      tx,
    );
  });

  invalidateDocumentRefs(documentId, refs);
  return { ok: true };
}

/**
 * Undo level 1.
 *
 * Unconditionally safe: archiving never releases the slug, so nothing can have
 * taken the address in the meantime. The document comes back unpublished —
 * putting it in front of visitors again stays a separate, deliberate click.
 */
export async function restoreDocument(documentId: string): Promise<RemovalResult> {
  const { user } = await requireCapability('content.delete');
  if (!z.uuid().safeParse(documentId).success) return { ok: false, error: 'invalid_input' };

  const document = await loadDocument(documentId);
  if (!document) return { ok: false, error: 'not_found' };
  if (!document.archivedAt) return { ok: true };

  const context = await requestContext();

  await db.transaction(async (tx) => {
    await tx.update(documents).set({ archivedAt: null }).where(eq(documents.id, documentId));

    await recordAudit(
      {
        actorUserId: user.id,
        action: 'document.restored',
        entityType: 'document',
        entityId: documentId,
        ...context,
      },
      tx,
    );
  });

  invalidateDocumentRefs(documentId, await readDocumentLocaleRefs(documentId));
  return { ok: true };
}

/**
 * Level 2 — gone.
 *
 * Refuses anything that has ever been published in any locale. `status` is not
 * the test: unpublishing only moves `status`, leaving `published_revision_id`
 * and `published_at` in place, so those two columns still answer "was this ever
 * on the site?" long afterwards — which is exactly the question that matters.
 */
export async function purgeDocument(documentId: string): Promise<RemovalResult> {
  const { user } = await requireCapability('content.delete');
  if (!z.uuid().safeParse(documentId).success) return { ok: false, error: 'invalid_input' };

  const document = await loadDocument(documentId);
  if (!document) return { ok: false, error: 'not_found' };
  if (document.isSystem) return { ok: false, error: 'system_document' };
  // Only from the archive, so permanent removal is always the second decision
  // rather than one misplaced click on a live list.
  if (!document.archivedAt) return { ok: false, error: 'not_archived' };

  const published = await db
    .select({ locale: documentLocales.locale, slug: documentLocales.slug })
    .from(documentLocales)
    .where(
      and(
        eq(documentLocales.documentId, documentId),
        or(isNotNull(documentLocales.publishedRevisionId), isNotNull(documentLocales.publishedAt)),
      ),
    );

  if (published.length > 0) {
    return {
      ok: false,
      error: 'was_published',
      blockedBy: published.map((row) => ({ locale: row.locale, slug: row.slug })),
    };
  }

  // Before the transaction: the rows these tags are derived from are about to
  // stop existing.
  const refs = await readDocumentLocaleRefs(documentId);
  const context = await requestContext();

  await db.transaction(async (tx) => {
    // Deleting the document fires two independent cascades — one to
    // `document_locales`, one to `document_revisions` — and
    // `document_locales.published_revision_id` restricts the second. Whether
    // the restriction bites depends on the order the cascades happen to run in,
    // which is not something to leave to chance. Clearing the reference first
    // makes the delete correct regardless.
    await tx
      .update(documentLocales)
      .set({ publishedRevisionId: null })
      .where(eq(documentLocales.documentId, documentId));

    await tx.delete(documents).where(eq(documents.id, documentId));

    await recordAudit(
      {
        actorUserId: user.id,
        action: 'document.purged',
        entityType: 'document',
        entityId: documentId,
        before: {
          kind: document.kind,
          slug: refs.find((ref) => ref.locale === 'ru')?.slug ?? null,
        },
        ...context,
      },
      tx,
    );
  });

  invalidateDocumentRefs(documentId, refs);
  return { ok: true };
}
