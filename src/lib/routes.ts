import { DEFAULT_LOCALE, type Locale } from '@/i18n/routing';

/**
 * URL construction, in one place.
 *
 * Paths are built without a locale prefix and then prefixed here, matching
 * next-intl's `localePrefix: 'as-needed'` — Russian stays on clean unprefixed
 * paths while Spanish and English are prefixed. Hand-assembling these anywhere
 * else is how hreflang ends up pointing at URLs that 404.
 */

/** Locale-less path for a document. Projects nest under the portfolio index. */
export function documentPath(
  kind: 'page' | 'project',
  slug: string,
  portfolioIndexSlug?: string | null,
): string {
  if (kind === 'project') {
    const parent = portfolioIndexSlug ?? 'raboty';
    return `/${parent}/${slug}`;
  }
  return slug === '' ? '/' : `/${slug}`;
}

/** Applies the as-needed locale prefix. */
export function localePath(locale: Locale, path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (locale === DEFAULT_LOCALE) return normalized;
  return normalized === '/' ? `/${locale}` : `/${locale}${normalized}`;
}

export function absoluteUrl(path: string, appUrl: string): string {
  const base = appUrl.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Absolute, locale-prefixed URL — for canonical, hreflang and sitemap. */
export function absoluteLocaleUrl(locale: Locale, path: string, appUrl: string): string {
  return absoluteUrl(localePath(locale, path), appUrl);
}

/**
 * Click-to-chat link.
 *
 * The number is digits only with no `+`, and the message is percent-encoded
 * UTF-8 — which matters here because the default message is Cyrillic.
 */
export function whatsappLink(phoneDigits: string, message?: string): string {
  const digits = phoneDigits.replace(/\D/g, '');
  const base = `https://wa.me/${digits}`;
  if (!message) return base;
  return `${base}?text=${encodeURIComponent(message)}`;
}

export function telLink(phoneE164: string): string {
  return `tel:${phoneE164.replace(/[^\d+]/g, '')}`;
}
