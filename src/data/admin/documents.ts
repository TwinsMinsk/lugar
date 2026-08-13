import 'server-only';

import { and, asc, desc, eq, isNotNull } from 'drizzle-orm';

import { anyBlockSchema, type AnyBlock } from '@/content/blocks/union';
import { db } from '@/db/client';
import { documentLocales, documentRevisions, documents, user } from '@/db/schema';
import { LOCALES, type Locale } from '@/i18n/routing';
import { requireCapability } from '@/lib/auth/guards';
import type { DocumentMeta } from '../public/documents';

/**
 * Admin document reads.
 *
 * Every export begins with `requireCapability`. That is the actual access
 * boundary — the admin layout's guard only stops a shell from flashing, and
 * `proxy.ts` only checks that a cookie exists. A Server Action or route handler
 * reached directly renders neither, so the check has to live here.
 */

export type AdminDocumentSummary = {
  id: string;
  kind: 'page' | 'project';
  template: string;
  isSystem: boolean;
  seedKey: string | null;
  locales: Array<{
    locale: Locale;
    slug: string;
    status: 'draft' | 'published' | 'archived';
    publishedAt: Date | null;
    /** True when the draft has moved on from what this locale serves. */
    hasUnpublishedChanges: boolean;
  }>;
};

export async function listDocuments(kind: 'page' | 'project'): Promise<AdminDocumentSummary[]> {
  await requireCapability('content.read');

  const rows = await db
    .select({
      id: documents.id,
      kind: documents.kind,
      template: documents.template,
      isSystem: documents.isSystem,
      seedKey: documents.seedKey,
      draftRevisionId: documents.draftRevisionId,
      sortOrder: documents.sortOrder,
      locale: documentLocales.locale,
      slug: documentLocales.slug,
      status: documentLocales.status,
      publishedAt: documentLocales.publishedAt,
      publishedRevisionId: documentLocales.publishedRevisionId,
    })
    .from(documents)
    .leftJoin(documentLocales, eq(documentLocales.documentId, documents.id))
    .where(eq(documents.kind, kind))
    .orderBy(asc(documents.sortOrder), asc(documents.createdAt));

  const byId = new Map<string, AdminDocumentSummary>();
  for (const row of rows) {
    const entry = byId.get(row.id) ?? {
      id: row.id,
      kind: row.kind as 'page' | 'project',
      template: row.template,
      isSystem: row.isSystem,
      seedKey: row.seedKey,
      locales: [],
    };
    if (row.locale) {
      entry.locales.push({
        locale: row.locale as Locale,
        slug: row.slug ?? '',
        status: (row.status ?? 'draft') as 'draft' | 'published' | 'archived',
        publishedAt: row.publishedAt,
        // The draft has diverged whenever it is not the revision being served.
        hasUnpublishedChanges:
          row.publishedRevisionId !== null && row.publishedRevisionId !== row.draftRevisionId,
      });
    }
    byId.set(row.id, entry);
  }

  // Stable locale order regardless of what the join returned.
  for (const entry of byId.values()) {
    entry.locales.sort((a, b) => LOCALES.indexOf(a.locale) - LOCALES.indexOf(b.locale));
  }

  return [...byId.values()];
}

export type AdminDocumentDetail = {
  id: string;
  kind: 'page' | 'project';
  template: string;
  isSystem: boolean;
  draftRevisionId: string;
  draftRevisionNumber: number;
  blocks: AnyBlock[];
  meta: DocumentMeta;
  /** Blocks that failed validation, surfaced instead of silently dropped. */
  invalidBlocks: number;
  locales: Array<{
    locale: Locale;
    slug: string;
    status: 'draft' | 'published' | 'archived';
    publishedRevisionId: string | null;
    publishedAt: Date | null;
    noindex: boolean;
  }>;
};

/** Load a document's editable draft. Never used by any public code path. */
export async function getDocumentForEditing(
  documentId: string,
): Promise<AdminDocumentDetail | null> {
  await requireCapability('content.read');

  const [document] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  if (!document?.draftRevisionId) return null;

  const [draft] = await db
    .select()
    .from(documentRevisions)
    .where(eq(documentRevisions.id, document.draftRevisionId))
    .limit(1);
  if (!draft) return null;

  const raw = Array.isArray(draft.blocks) ? draft.blocks : [];
  const blocks: AnyBlock[] = [];
  let invalidBlocks = 0;
  for (const candidate of raw) {
    const parsed = anyBlockSchema.safeParse(candidate);
    if (parsed.success) blocks.push(parsed.data);
    else invalidBlocks += 1;
  }

  const localeRows = await db
    .select()
    .from(documentLocales)
    .where(eq(documentLocales.documentId, documentId));

  return {
    id: document.id,
    kind: document.kind as 'page' | 'project',
    template: document.template,
    isSystem: document.isSystem,
    draftRevisionId: draft.id,
    draftRevisionNumber: draft.revisionNumber,
    blocks,
    meta: (draft.meta ?? {}) as DocumentMeta,
    invalidBlocks,
    locales: localeRows
      .map((row) => ({
        locale: row.locale as Locale,
        slug: row.slug,
        status: row.status as 'draft' | 'published' | 'archived',
        publishedRevisionId: row.publishedRevisionId,
        publishedAt: row.publishedAt,
        noindex: row.noindex,
      }))
      .sort((a, b) => LOCALES.indexOf(a.locale) - LOCALES.indexOf(b.locale)),
  };
}

export type RevisionSummary = {
  id: string;
  revisionNumber: number;
  isDraft: boolean;
  note: string | null;
  createdAt: Date;
  authorName: string | null;
  /** Locales currently served by this revision. */
  liveFor: Locale[];
};

/** Revision history, for the rollback picker. */
export async function listRevisions(documentId: string, limit = 30): Promise<RevisionSummary[]> {
  await requireCapability('content.read');

  const rows = await db
    .select({
      id: documentRevisions.id,
      revisionNumber: documentRevisions.revisionNumber,
      isDraft: documentRevisions.isDraft,
      note: documentRevisions.note,
      createdAt: documentRevisions.createdAt,
      authorName: user.name,
    })
    .from(documentRevisions)
    .leftJoin(user, eq(user.id, documentRevisions.createdBy))
    .where(eq(documentRevisions.documentId, documentId))
    .orderBy(desc(documentRevisions.revisionNumber))
    .limit(limit);

  const live = await db
    .select({
      locale: documentLocales.locale,
      publishedRevisionId: documentLocales.publishedRevisionId,
    })
    .from(documentLocales)
    .where(
      and(
        eq(documentLocales.documentId, documentId),
        isNotNull(documentLocales.publishedRevisionId),
      ),
    );

  return rows.map((row) => ({
    ...row,
    liveFor: live
      .filter((entry) => entry.publishedRevisionId === row.id)
      .map((entry) => entry.locale as Locale),
  }));
}

/** Blocks of a historic revision, for previewing before a rollback. */
export async function getRevisionBlocks(revisionId: string): Promise<AnyBlock[] | null> {
  await requireCapability('content.read');

  const [row] = await db
    .select({ blocks: documentRevisions.blocks })
    .from(documentRevisions)
    .where(eq(documentRevisions.id, revisionId))
    .limit(1);
  if (!row) return null;

  const raw = Array.isArray(row.blocks) ? row.blocks : [];
  return raw
    .map((candidate) => anyBlockSchema.safeParse(candidate))
    .filter((parsed) => parsed.success)
    .map((parsed) => parsed.data);
}
