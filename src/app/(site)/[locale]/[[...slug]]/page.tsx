import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';

import { Blocks } from '@/content/blocks/render';
import { getPortfolioIndexSlug, listPublishedPaths } from '@/data/public/documents';
import { loadPage } from '@/data/public/page-loader';
import { publicEnv } from '@/env';
import { LOCALE_TAG, routing, type Locale } from '@/i18n/routing';
import { absoluteLocaleUrl, documentPath } from '@/lib/routes';

type PageProps = {
  params: Promise<{ locale: string; slug?: string[] }>;
};

/**
 * Prerender every published path.
 *
 * Without this the catch-all reads `params` dynamically and, under Cache
 * Components, nothing can be prerendered — every visitor would pay for a
 * server render of a page whose content changes a few times a month.
 *
 * `dynamicParams` stays at its default of true, so a page published after the
 * build still renders on demand rather than 404ing; it simply is not in the
 * initial static set.
 *
 * If the database is unreachable at build time the list comes back empty and
 * every route falls back to on-demand rendering, so a build never fails purely
 * because the database was not up yet.
 */
export async function generateStaticParams() {
  try {
    const [paths, indexSlugs] = await Promise.all([
      listPublishedPaths(),
      Promise.all(
        routing.locales.map(
          async (locale) => [locale, await getPortfolioIndexSlug(locale)] as const,
        ),
      ),
    ]);
    const indexByLocale = new Map(indexSlugs);

    return paths.map((entry) => ({
      locale: entry.locale,
      slug:
        entry.kind === 'project'
          ? [indexByLocale.get(entry.locale) ?? 'raboty', entry.slug]
          : entry.slug === ''
            ? []
            : [entry.slug],
    }));
  } catch {
    return [];
  }
}

/**
 * The single public page route.
 *
 * Every public URL — home, the three direction pages, the portfolio index, a
 * project, About, Contacts, the legal pages — resolves through here against
 * `document_locales`. That means the owner can rename a slug in /admin and the
 * route follows, with a 301 written automatically; no route file has to change.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params;
  if (!hasLocale(routing.locales, rawLocale)) return {};
  const locale = rawLocale as Locale;

  const loaded = await loadPage(locale, slug ?? []);
  if (!loaded) return { title: 'LUGAR', robots: { index: false, follow: false } };

  const seo = loaded.meta.seo?.[locale] ?? loaded.meta.seo?.ru ?? {};
  const path = documentPath(loaded.ref.kind, loaded.ref.slug, loaded.portfolioIndexSlug);
  const canonical = seo.canonical ?? absoluteLocaleUrl(locale, path, publicEnv.appUrl);

  // Only locales that are actually published get an alternate. Emitting an
  // hreflang URL that 404s is worse than omitting it.
  const languages: Record<string, string> = {};
  for (const alternate of loaded.alternates) {
    const alternatePath = documentPath(
      alternate.kind,
      alternate.slug,
      alternate.kind === 'project' ? loaded.portfolioIndexSlug : null,
    );
    languages[LOCALE_TAG[alternate.locale]] = absoluteLocaleUrl(
      alternate.locale,
      alternatePath,
      publicEnv.appUrl,
    );
  }
  if (loaded.alternates.some((alternate) => alternate.locale === 'ru')) {
    languages['x-default'] = languages[LOCALE_TAG.ru]!;
  }

  return {
    title: seo.title,
    description: seo.description,
    alternates: { canonical, languages },
    robots: loaded.ref.noindex ? { index: false, follow: false } : undefined,
    openGraph: {
      type: 'website',
      siteName: 'LUGAR',
      locale: LOCALE_TAG[locale],
      url: canonical,
      title: seo.title,
      description: seo.description,
    },
    twitter: { card: 'summary_large_image', title: seo.title, description: seo.description },
  };
}

export default async function PublicPage({ params }: PageProps) {
  const { locale: rawLocale, slug } = await params;
  if (!hasLocale(routing.locales, rawLocale)) notFound();
  const locale = rawLocale as Locale;

  setRequestLocale(locale);

  const loaded = await loadPage(locale, slug ?? []);
  if (!loaded) notFound();

  return <Blocks blocks={loaded.blocks} ctx={loaded.ctx} />;
}
