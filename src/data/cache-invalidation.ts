import 'server-only';

import { eq } from 'drizzle-orm';
import { updateTag } from 'next/cache';

import { db } from '@/db/client';
import { documentLocales } from '@/db/schema';
import type { Locale } from '@/i18n/routing';
import { tags } from './cache-tags';

/** The locale rows a document participates in, as far as caching is concerned. */
export type DocumentLocaleRef = { locale: Locale; slug: string; kind: string };

export async function readDocumentLocaleRefs(documentId: string): Promise<DocumentLocaleRef[]> {
  const rows = await db
    .select({
      locale: documentLocales.locale,
      slug: documentLocales.slug,
      kind: documentLocales.kind,
    })
    .from(documentLocales)
    .where(eq(documentLocales.documentId, documentId));
  return rows.map((row) => ({ locale: row.locale as Locale, slug: row.slug, kind: row.kind }));
}

/**
 * Invalidate every cache entry a document participates in, from a snapshot.
 *
 * Separate from the read because permanent removal deletes the locale rows: by
 * the time the caches need clearing there is nothing left to read them from, so
 * the snapshot has to be taken before the transaction.
 */
export function invalidateDocumentRefs(documentId: string, refs: DocumentLocaleRef[]) {
  for (const ref of refs) {
    // updateTag, not revalidateTag: the owner must see their change on the very
    // next request, not after a stale-while-revalidate round.
    updateTag(tags.path(ref.kind, ref.locale, ref.slug));
    updateTag(tags.document(documentId, ref.locale));
    updateTag(tags.projectsIndex(ref.locale));
    updateTag(tags.navigation(ref.locale));
  }
}

/** Read-then-invalidate, for the mutations that leave the rows in place. */
export async function invalidateDocument(documentId: string) {
  invalidateDocumentRefs(documentId, await readDocumentLocaleRefs(documentId));
}
