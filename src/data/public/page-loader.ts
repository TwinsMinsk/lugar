import 'server-only';

import { referencedAssetIds } from '@/content/blocks/media-usage';
import type { RenderContext } from '@/content/blocks/render/context';
import type { AnyBlock } from '@/content/blocks/union';
import type { Locale } from '@/i18n/routing';
import {
  getLocaleAlternates,
  getPortfolioIndexSlug,
  getRevision,
  resolvePage,
  resolveProject,
  type DocumentMeta,
  type PublishedRef,
} from './documents';
import { getMediaAssets } from './media';
import { getDocumentSlug } from './navigation';
import { getServiceCategories, listPublishedProjects } from './portfolio';
import { getSiteSettings } from './settings';

export type LoadedPage = {
  ref: PublishedRef;
  blocks: AnyBlock[];
  meta: DocumentMeta;
  ctx: RenderContext;
  alternates: Array<{ locale: Locale; slug: string; kind: 'page' | 'project' }>;
  portfolioIndexSlug: string | null;
};

/**
 * Resolve a URL to a published document and load everything it needs.
 *
 * Path shapes:
 *   []                        → home page (slug '')
 *   [slug]                    → a page
 *   [portfolioIndex, slug]    → a project, but only under the portfolio index
 *                               slug for THIS locale
 *
 * Anything deeper, or a two-segment path whose first segment is not the
 * portfolio index, resolves to null and produces a 404 rather than being
 * guessed at.
 */
export async function loadPage(locale: Locale, segments: string[]): Promise<LoadedPage | null> {
  const portfolioIndexSlug = await getPortfolioIndexSlug(locale);

  let ref: PublishedRef | null = null;

  if (segments.length === 0) {
    ref = await resolvePage(locale, '');
  } else if (segments.length === 1) {
    ref = await resolvePage(locale, segments[0]!);
  } else if (segments.length === 2 && portfolioIndexSlug && segments[0] === portfolioIndexSlug) {
    ref = await resolveProject(locale, segments[1]!);
  }

  if (!ref) return null;

  const revision = await getRevision(ref.revisionId);
  if (!revision) return null;

  const { blocks, meta } = revision;

  // Collect every dependency the block list declares, then fetch each kind in
  // a single batched query rather than one per reference.
  const assetIds = referencedAssetIds(blocks);
  const linkedDocumentIds = collectLinkedDocumentIds(blocks);

  const needsProjects = blocks.some(
    (block) => block.type === 'portfolio_teaser' || block.type === 'portfolio_gallery',
  );
  const directions = new Set(
    blocks.flatMap((block) =>
      block.type === 'service_grid' && block.data.source.mode === 'direction'
        ? [block.data.source.direction]
        : [],
    ),
  );

  const [settings, projects, alternates, korpus, mebel, dveri] = await Promise.all([
    getSiteSettings(),
    needsProjects ? listPublishedProjects(locale) : Promise.resolve([]),
    getLocaleAlternates(ref.documentId),
    directions.has('korpusnaya') ? getServiceCategories('korpusnaya') : Promise.resolve([]),
    directions.has('mebel') ? getServiceCategories('mebel') : Promise.resolve([]),
    directions.has('dveri') ? getServiceCategories('dveri') : Promise.resolve([]),
  ]);

  // Project covers are media too, and they are not referenced by any block.
  const coverIds = projects
    .map((project) => project.coverAssetId)
    .filter((id): id is string => Boolean(id));

  const [media, documentSlugs] = await Promise.all([
    getMediaAssets([...assetIds, ...coverIds]),
    resolveDocumentSlugs(linkedDocumentIds, locale),
  ]);

  const ctx: RenderContext = {
    locale,
    media,
    settings,
    portfolioIndexSlug,
    documentSlugs,
    projects,
    serviceCategories: { korpusnaya: korpus, mebel, dveri },
    mode: 'public',
  };

  return { ref, blocks, meta, ctx, alternates, portfolioIndexSlug };
}

/** Every documentId a CTA or teaser links to, so slugs resolve in one pass. */
function collectLinkedDocumentIds(blocks: AnyBlock[]): string[] {
  const ids = new Set<string>();

  const visit = (node: unknown): void => {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const record = node as Record<string, unknown>;
    if (record.kind === 'document' && typeof record.documentId === 'string') {
      ids.add(record.documentId);
      return;
    }
    if (typeof record.linkTargetDocumentId === 'string') ids.add(record.linkTargetDocumentId);
    Object.values(record).forEach(visit);
  };

  blocks.forEach((block) => visit(block.data));
  return [...ids];
}

async function resolveDocumentSlugs(
  documentIds: string[],
  locale: Locale,
): Promise<Map<string, { slug: string; kind: 'page' | 'project' }>> {
  const entries = await Promise.all(
    documentIds.map(async (documentId) => {
      const resolved = await getDocumentSlug(documentId, locale);
      return resolved ? ([documentId, resolved] as const) : null;
    }),
  );
  return new Map(entries.filter((entry): entry is NonNullable<typeof entry> => entry !== null));
}
