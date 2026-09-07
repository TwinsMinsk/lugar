import { t } from '@/content/i18n';
import type { SiteSettings } from '@/data/public/settings';
import type { Locale } from '@/i18n/routing';

/**
 * JSON-LD builders, kept out of `page.tsx` on purpose.
 *
 * Next validates a `page.tsx`'s exports against a fixed set (`default`,
 * `generateMetadata`, `generateStaticParams`, …) — an extra named export
 * there is not something the route file is allowed to offer, which also
 * means a helper defined inline in that file cannot be imported by a test.
 * Pure functions belong in their own module for exactly that reason.
 */

/**
 * `LocalBusiness` structured data.
 *
 * Built entirely from Settings: nothing here is invented, and a field the
 * owner has left blank is simply absent from the object rather than rendered
 * as an empty or placeholder value schema.org validators would flag.
 */
export function localBusinessJsonLd(
  settings: SiteSettings,
  locale: Locale,
  appUrl: string,
): Record<string, unknown> {
  const sameAs = [settings.social.instagram, settings.social.facebook].filter(
    (url): url is string => Boolean(url),
  );

  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: settings.legal.companyName ?? 'LUGAR',
    url: appUrl,
    ...(settings.contact.phoneE164 ? { telephone: settings.contact.phoneE164 } : {}),
    ...(settings.contact.email ? { email: settings.contact.email } : {}),
    ...(settings.contact.address ? { address: settings.contact.address } : {}),
    ...(t(settings.contact.serviceArea, locale)
      ? { areaServed: t(settings.contact.serviceArea, locale) }
      : {}),
    ...(sameAs.length > 0 ? { sameAs } : {}),
  };
}

/**
 * `BreadcrumbList` structured data.
 *
 * Two levels — home and the current page — for every page except home
 * itself (a one-item trail is not a trail, and Google's own guidance is to
 * omit it there). Deliberately not a full ancestor chain: a project page
 * could claim home → portfolio index → project, but that third level needs
 * the index page's own title fetched separately, and a two-level trail is
 * still a correct, valid `BreadcrumbList` — it just does not name every
 * intermediate URL segment. Google does not require that; it wants a real
 * navigational path, and "home, then here" is one.
 */
export function breadcrumbJsonLd(
  homeUrl: string,
  pageUrl: string,
  pageName: string,
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'LUGAR', item: homeUrl },
      { '@type': 'ListItem', position: 2, name: pageName, item: pageUrl },
    ],
  };
}
