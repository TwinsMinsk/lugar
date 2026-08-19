import 'server-only';

import { and, eq, isNotNull, isNull, or } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';
import { draftMode } from 'next/headers';

import { anyBlockSchema, type AnyBlock } from '@/content/blocks/union';
import { db } from '@/db/client';
import { documentLocales, documentRevisions, documents } from '@/db/schema';
import { LOCALES, type Locale } from '@/i18n/routing';
import { PUBLIC_CACHE_PROFILE, tags } from '../cache-tags';

/**
 * Public document reads.
 *
 * Every export here hard-codes `status = 'published'` and
 * `published_revision_id IS NOT NULL`, and no function accepts a revision id
 * from the caller. A caller cannot ask for a draft; it can only be *in* draft
 * mode, which is a separate, authorised state.
 *
 * Draft mode is honoured here rather than in a parallel module because Next
 * guarantees two things that make it safe: `draftMode().isEnabled` is readable
 * inside a `use cache` scope (unlike cookies() or headers()), and while it is
 * enabled nothing under such a scope is written to the cache. So a preview
 * render cannot become the next visitor's cached page — which is exactly the
 * failure a hand-rolled preview path tends to produce.
 *
 * Entering draft mode requires a signed token or an admin session; see
 * src/app/api/preview/route.ts.
 */

export type PublishedRef = {
  documentId: string;
  revisionId: string;
  kind: 'page' | 'project';
  template: string;
  slug: string;
  noindex: boolean;
  publishedAt: Date | null;
};

export type DocumentMeta = {
  seo?: Partial<
    Record<
      Locale,
      {
        title?: string;
        description?: string;
        canonical?: string;
        ogImageAssetId?: string;
      }
    >
  >;
};

export type PublishedDocument = PublishedRef & {
  blocks: AnyBlock[];
  meta: DocumentMeta;
};

/**
 * Which revision to render, and whether unpublished locales are visible.
 *
 * Off: published revision only. On: the document's live draft, and a locale
 * that has never been published becomes reachable so the owner can review
 * something before its first publish.
 */
async function previewState(): Promise<boolean> {
  const { isEnabled } = await draftMode();
  return isEnabled;
}

/** Slug of the portfolio index per locale — the parent segment of project URLs. */
export async function getPortfolioIndexSlug(locale: Locale): Promise<string | null> {
  'use cache';
  cacheLife(PUBLIC_CACHE_PROFILE);
  cacheTag(tags.projectsIndex(locale));

  const [row] = await db
    .select({ slug: documentLocales.slug })
    .from(documentLocales)
    .innerJoin(documents, eq(documents.id, documentLocales.documentId))
    .where(
      and(
        eq(documents.template, 'portfolio_index'),
        eq(documentLocales.locale, locale),
        eq(documentLocales.status, 'published'),
        isNotNull(documentLocales.publishedRevisionId),
      ),
    )
    .limit(1);

  return row?.slug ?? null;
}

/** Resolve a published page by its locale slug. `''` is the home page. */
export async function resolvePage(locale: Locale, slug: string): Promise<PublishedRef | null> {
  'use cache';
  cacheLife(PUBLIC_CACHE_PROFILE);
  cacheTag(tags.path('page', locale, slug));

  const preview = await previewState();

  const [row] = await db
    .select({
      documentId: documentLocales.documentId,
      publishedRevisionId: documentLocales.publishedRevisionId,
      draftRevisionId: documents.draftRevisionId,
      noindex: documentLocales.noindex,
      publishedAt: documentLocales.publishedAt,
      slug: documentLocales.slug,
      template: documents.template,
    })
    .from(documentLocales)
    .innerJoin(documents, eq(documents.id, documentLocales.documentId))
    .where(
      and(
        eq(documentLocales.kind, 'page'),
        eq(documentLocales.locale, locale),
        eq(documentLocales.slug, slug),
        // An archived document is gone from the panel, so it must be gone from
        // the site — including under preview. Without this a removed page stays
        // reachable through its signed preview link, and those get sent to
        // people.
        isNull(documents.archivedAt),
        preview
          ? or(eq(documentLocales.status, 'published'), eq(documentLocales.status, 'draft'))
          : eq(documentLocales.status, 'published'),
        preview ? undefined : isNotNull(documentLocales.publishedRevisionId),
      ),
    )
    .limit(1);

  const revisionId = preview
    ? (row?.draftRevisionId ?? row?.publishedRevisionId)
    : row?.publishedRevisionId;

  if (!row || !revisionId) return null;
  return {
    documentId: row.documentId,
    revisionId,
    kind: 'page',
    template: row.template,
    slug: row.slug,
    noindex: row.noindex,
    publishedAt: row.publishedAt,
  };
}

/** Resolve a published portfolio project by its locale slug. */
export async function resolveProject(locale: Locale, slug: string): Promise<PublishedRef | null> {
  'use cache';
  cacheLife(PUBLIC_CACHE_PROFILE);
  cacheTag(tags.path('project', locale, slug));

  const preview = await previewState();

  const [row] = await db
    .select({
      documentId: documentLocales.documentId,
      publishedRevisionId: documentLocales.publishedRevisionId,
      draftRevisionId: documents.draftRevisionId,
      noindex: documentLocales.noindex,
      publishedAt: documentLocales.publishedAt,
      slug: documentLocales.slug,
      template: documents.template,
    })
    .from(documentLocales)
    .innerJoin(documents, eq(documents.id, documentLocales.documentId))
    .where(
      and(
        eq(documentLocales.kind, 'project'),
        eq(documentLocales.locale, locale),
        eq(documentLocales.slug, slug),
        // See resolvePage: archived must be unreachable under preview too.
        isNull(documents.archivedAt),
        preview
          ? or(eq(documentLocales.status, 'published'), eq(documentLocales.status, 'draft'))
          : eq(documentLocales.status, 'published'),
        preview ? undefined : isNotNull(documentLocales.publishedRevisionId),
      ),
    )
    .limit(1);

  const revisionId = preview
    ? (row?.draftRevisionId ?? row?.publishedRevisionId)
    : row?.publishedRevisionId;

  if (!row || !revisionId) return null;
  return {
    documentId: row.documentId,
    revisionId,
    kind: 'project',
    template: row.template,
    slug: row.slug,
    noindex: row.noindex,
    publishedAt: row.publishedAt,
  };
}

/**
 * Load a frozen revision.
 *
 * Blocks are validated per-item rather than as a whole array: one corrupt block
 * must not take down an otherwise good page. Invalid blocks are dropped from
 * public output and reported, which is the safe direction to fail.
 */
export async function getRevision(revisionId: string): Promise<{
  blocks: AnyBlock[];
  meta: DocumentMeta;
  invalidCount: number;
} | null> {
  'use cache';
  cacheLife(PUBLIC_CACHE_PROFILE);
  cacheTag(tags.revision(revisionId));

  const [row] = await db
    .select({ blocks: documentRevisions.blocks, meta: documentRevisions.meta })
    .from(documentRevisions)
    .where(eq(documentRevisions.id, revisionId))
    .limit(1);

  if (!row) return null;

  const raw = Array.isArray(row.blocks) ? row.blocks : [];
  const blocks: AnyBlock[] = [];
  let invalidCount = 0;

  for (const candidate of raw) {
    const parsed = anyBlockSchema.safeParse(candidate);
    if (parsed.success) {
      if (!parsed.data.hidden) blocks.push(parsed.data);
    } else {
      invalidCount += 1;
    }
  }

  return { blocks, meta: (row.meta ?? {}) as DocumentMeta, invalidCount };
}

export async function getPublishedDocument(ref: PublishedRef): Promise<PublishedDocument | null> {
  const revision = await getRevision(ref.revisionId);
  if (!revision) return null;
  return { ...ref, blocks: revision.blocks, meta: revision.meta };
}

/**
 * Every published locale URL for one document, for hreflang alternates.
 *
 * Only locales that are actually published are returned — emitting an hreflang
 * URL that 404s is worse than omitting the alternate entirely.
 */
export async function getLocaleAlternates(
  documentId: string,
): Promise<Array<{ locale: Locale; slug: string; kind: 'page' | 'project' }>> {
  'use cache';
  cacheLife(PUBLIC_CACHE_PROFILE);
  for (const locale of LOCALES) cacheTag(tags.document(documentId, locale));

  const rows = await db
    .select({
      locale: documentLocales.locale,
      slug: documentLocales.slug,
      kind: documentLocales.kind,
    })
    .from(documentLocales)
    .where(
      and(
        eq(documentLocales.documentId, documentId),
        eq(documentLocales.status, 'published'),
        isNotNull(documentLocales.publishedRevisionId),
      ),
    );

  return rows.map((row) => ({
    locale: row.locale as Locale,
    slug: row.slug,
    kind: row.kind as 'page' | 'project',
  }));
}

/** All published paths, for sitemap generation. */
export async function listPublishedPaths(): Promise<
  Array<{
    documentId: string;
    locale: Locale;
    slug: string;
    kind: 'page' | 'project';
    publishedAt: Date | null;
    noindex: boolean;
  }>
> {
  'use cache';
  cacheLife(PUBLIC_CACHE_PROFILE);
  for (const locale of LOCALES) {
    cacheTag(tags.projectsIndex(locale));
    cacheTag(tags.navigation(locale));
  }

  const rows = await db
    .select({
      documentId: documentLocales.documentId,
      locale: documentLocales.locale,
      slug: documentLocales.slug,
      kind: documentLocales.kind,
      publishedAt: documentLocales.publishedAt,
      noindex: documentLocales.noindex,
    })
    .from(documentLocales)
    .where(
      and(eq(documentLocales.status, 'published'), isNotNull(documentLocales.publishedRevisionId)),
    );

  return rows.map((row) => ({
    ...row,
    locale: row.locale as Locale,
    kind: row.kind as 'page' | 'project',
  }));
}
