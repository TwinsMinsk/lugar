import type { Metadata } from 'next';
import { draftMode } from 'next/headers';
import { notFound, permanentRedirect, redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';

import { mediaUrl } from '@/components/ui/media-image';
import { JsonLd } from '@/components/seo/json-ld';
import { breadcrumbJsonLd, localBusinessJsonLd } from '@/components/seo/structured-data';
import { Blocks } from '@/content/blocks/render';
import { t } from '@/content/i18n';
import { PortfolioIndex } from '@/features/portfolio/portfolio-index';
import { DOCUMENT_IDS } from '@/db/seed/content';
import { getPortfolioIndexSlug, listPublishedPaths } from '@/data/public/documents';
import { getMediaAssets } from '@/data/public/media';
import { loadPage } from '@/data/public/page-loader';
import { resolveRedirect } from '@/data/public/redirects';
import { getSiteSettings } from '@/data/public/settings';
import { publicEnv } from '@/env';
import { HREFLANG_TAG, LOCALE_TAG, routing, type Locale } from '@/i18n/routing';
import { absoluteLocaleUrl, documentPath, localePath } from '@/lib/routes';

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
 * If the database is unreachable at build time this falls back to the home page
 * of each locale rather than to nothing. Cache Components rejects an empty
 * result outright — "all generateStaticParams functions must return at least
 * one result" — so returning `[]` turns an unreachable database into a failed
 * build. Railway builds cannot reach the private network the database lives on,
 * which makes that the normal case there, not an edge one.
 *
 * The fallback is a real route: `/`, `/es`, `/en` exist whatever the content
 * says, and `dynamicParams` stays true, so everything else still renders on
 * demand.
 */
const HOME_PARAMS = routing.locales.map((locale) => ({ locale, slug: [] as string[] }));

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

    // An empty database is as fatal to the build as an unreachable one.
    if (paths.length === 0) return HOME_PARAMS;

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
    return HOME_PARAMS;
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

  // Per field, not per object. Falling back to the whole `ru` object once the
  // owner had filled in only this locale's title meant a page with an es title
  // and no es description served the RUSSIAN description underneath it — a
  // mixed-language search result. `canonical` deliberately never falls back:
  // it is this locale's own URL, and ru's would point an es page at the wrong
  // language entirely.
  const seoLocale = loaded.meta.seo?.[locale];
  const seoRu = loaded.meta.seo?.ru;
  const seoTitle = seoLocale?.title ?? seoRu?.title;
  const seoDescription = seoLocale?.description ?? seoRu?.description;

  const path = documentPath(loaded.ref.kind, loaded.ref.slug, loaded.portfolioIndexSlug);
  const canonical = seoLocale?.canonical ?? absoluteLocaleUrl(locale, path, publicEnv.appUrl);

  // Only locales that are actually published get an alternate. Emitting an
  // hreflang URL that 404s is worse than omitting it.
  const languages: Record<string, string> = {};
  for (const alternate of loaded.alternates) {
    const alternatePath = documentPath(
      alternate.kind,
      alternate.slug,
      alternate.kind === 'project' ? loaded.portfolioIndexSlug : null,
    );
    languages[HREFLANG_TAG[alternate.locale]] = absoluteLocaleUrl(
      alternate.locale,
      alternatePath,
      publicEnv.appUrl,
    );
  }
  if (loaded.alternates.some((alternate) => alternate.locale === 'ru')) {
    languages['x-default'] = languages[HREFLANG_TAG.ru]!;
  }

  // A preview render shows unpublished content, so it must never be indexed —
  // regardless of the document's own robots setting.
  const { isEnabled: isPreview } = await draftMode();

  const settings = await getSiteSettings();
  // `seo.defaultTitle` used to be read into `SiteSettings` and then read by
  // nothing — an untitled page fell back to the hardcoded string `'LUGAR'`
  // from the layout's own metadata, not to the setting the owner can actually
  // see and edit under "SEO" in Settings.
  const title = seoTitle ?? t(settings.seo.defaultTitle, locale);

  // A page-level override wins if one is ever set (the schema supports it;
  // the admin editor does not expose it yet); otherwise the sitewide
  // "Картинка для соцсетей" setting, so every page gets a real preview card
  // the moment the owner uploads one image, rather than each page needing its
  // own. Relative URLs resolve against `metadataBase` (the site layout).
  const ogImageAssetId = seoLocale?.ogImageAssetId ?? settings.seo.ogImageAssetId ?? undefined;
  const ogAsset = ogImageAssetId
    ? (await getMediaAssets([ogImageAssetId])).get(ogImageAssetId)
    : undefined;
  const ogImages =
    ogAsset && !ogAsset.isPlaceholder
      ? [{ url: mediaUrl(ogAsset), width: ogAsset.width, height: ogAsset.height }]
      : undefined;

  return {
    title,
    description: seoDescription,
    alternates: { canonical, languages },
    robots: isPreview || loaded.ref.noindex ? { index: false, follow: false } : undefined,
    openGraph: {
      type: 'website',
      siteName: 'LUGAR',
      locale: LOCALE_TAG[locale],
      url: canonical,
      title,
      description: seoDescription,
      images: ogImages,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: seoDescription,
      images: ogImages?.map((image) => image.url),
    },
  };
}

export default async function PublicPage({ params }: PageProps) {
  const { locale: rawLocale, slug } = await params;
  if (!hasLocale(routing.locales, rawLocale)) notFound();
  const locale = rawLocale as Locale;

  setRequestLocale(locale);

  const loaded = await loadPage(locale, slug ?? []);
  if (!loaded) {
    // Only now — a document that resolves always wins over slug history, so a
    // stale redirect can never shadow a page created later at the same URL.
    const requested = localePath(locale, `/${(slug ?? []).join('/')}`);
    const target = await resolveRedirect(requested);
    if (target) {
      // 308/307 rather than 301/302: these are the App Router's permanent and
      // temporary redirects, and search engines treat them as equivalent to the
      // older pair. What the admin editor calls "постоянный" maps to 308.
      if (target.permanent) permanentRedirect(target.to);
      redirect(target.to);
    }
    notFound();
  }

  const isHome = loaded.ref.documentId === DOCUMENT_IDS.HOME;
  const isHomeOrContact = isHome || loaded.ref.documentId === DOCUMENT_IDS.CONTACTS;

  // Fetched once, shared by both JSON-LD blocks below — `'use cache'` means a
  // second call in generateMetadata for the same request is a cache hit, not
  // a second query, but there is no reason to ask twice within this function.
  const settings = await getSiteSettings();

  const localBusiness = isHomeOrContact ? (
    <JsonLd data={localBusinessJsonLd(settings, locale, publicEnv.appUrl)} />
  ) : null;

  const breadcrumb = isHome ? null : (
    <JsonLd
      data={breadcrumbJsonLd(
        absoluteLocaleUrl(locale, '/', publicEnv.appUrl),
        absoluteLocaleUrl(
          locale,
          documentPath(loaded.ref.kind, loaded.ref.slug, loaded.portfolioIndexSlug),
          publicEnv.appUrl,
        ),
        loaded.meta.seo?.[locale]?.title ??
          loaded.meta.seo?.ru?.title ??
          t(settings.seo.defaultTitle, locale) ??
          'LUGAR',
      )}
    />
  );

  // The portfolio index is the one template with a section that is not editable
  // content: the filterable project grid is generated from published projects,
  // not authored block-by-block. It sits immediately after the page heading,
  // with the remaining blocks (contacts, CTA) following as usual.
  if (loaded.ref.template === 'portfolio_index') {
    const [heading, ...rest] = loaded.blocks;
    return (
      <>
        {localBusiness}
        {breadcrumb}
        {heading ? <Blocks blocks={[heading]} ctx={loaded.ctx} /> : null}
        <PortfolioIndex ctx={loaded.ctx} />
        <Blocks blocks={rest} ctx={loaded.ctx} />
      </>
    );
  }

  return (
    <>
      {localBusiness}
      {breadcrumb}
      <Blocks blocks={loaded.blocks} ctx={loaded.ctx} />
    </>
  );
}
