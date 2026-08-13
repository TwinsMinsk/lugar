import type { LocalizedText } from '@/content/i18n';
import type { MediaAsset } from '@/data/public/media';
import type { PortfolioCard } from '@/data/public/portfolio';
import type { SiteSettings } from '@/data/public/settings';
import type { Locale } from '@/i18n/routing';

/**
 * Everything a block needs to render, resolved once per page.
 *
 * Blocks never query the database themselves. The page loader collects the
 * union of what all blocks reference — media ids, linked documents, projects —
 * and fetches each in a single batched query. That is the difference between
 * four queries per page and one per image on a photography-led site.
 */
export type RenderContext = {
  locale: Locale;
  media: Map<string, MediaAsset>;
  settings: SiteSettings;
  /** Parent segment for project URLs in this locale. */
  portfolioIndexSlug: string | null;
  /** documentId → published slug in this locale. Absent means unpublished. */
  documentSlugs: Map<string, { slug: string; kind: 'page' | 'project' }>;
  /** All published projects in this locale, for teaser blocks. */
  projects: PortfolioCard[];
  /** Service taxonomy per direction, for `service_grid` in `direction` mode. */
  serviceCategories: Record<
    'korpusnaya' | 'mebel' | 'dveri',
    Array<{ slug: string; label: LocalizedText; note: LocalizedText | null }>
  >;
  /** Preview mode renders diagnostics for invalid blocks instead of hiding them. */
  mode: 'public' | 'preview';
};
