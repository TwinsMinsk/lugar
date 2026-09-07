import { defineRouting } from 'next-intl/routing';

export const LOCALES = ['ru', 'es', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'ru';

/**
 * Fallback chain. Russian is the source language and is always complete, so it
 * terminates every chain. Untranslated Spanish or English fields render the
 * Russian original rather than an empty slot.
 */
export const LOCALE_FALLBACK: Record<Locale, readonly Locale[]> = {
  ru: ['ru'],
  es: ['es', 'ru'],
  en: ['en', 'ru'],
};

/** BCP-47 tags for <html lang> and Open Graph's `og:locale`. */
export const LOCALE_TAG: Record<Locale, string> = {
  ru: 'ru-RU',
  es: 'es-ES',
  en: 'en-GB',
};

/**
 * hreflang tags — a narrower claim than `LOCALE_TAG`, and not the same thing.
 * `<html lang="en-GB">` says "this text is British English", a defensible
 * regional detail. `hreflang="en-GB"` says "show this page to searchers in
 * the United Kingdom" — that is what tells Google who the page is *for*, and
 * a Spain-based studio's English content is for any English-speaking
 * searcher, not specifically UK ones. Spanish and Russian keep their regional
 * tags: the Spanish audience genuinely is Spain, and the Russian one is
 * Russian speakers, not a specific country whose exclusion would be wrong the
 * same way.
 */
export const HREFLANG_TAG: Record<Locale, string> = {
  ru: 'ru-RU',
  es: 'es-ES',
  en: 'en',
};

export const LOCALE_LABEL: Record<Locale, string> = {
  ru: 'RU',
  es: 'ES',
  en: 'EN',
};

/**
 * Default region used when normalising a phone number typed without a country
 * code. A visitor reading the Spanish or English site is most likely dialling a
 * Spanish number; a Russian-speaking visitor may well still be on a +7 number,
 * so `ru` deliberately does not assume ES.
 */
export const LOCALE_PHONE_REGION: Record<Locale, 'ES' | 'RU'> = {
  ru: 'ES',
  es: 'ES',
  en: 'ES',
};

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  /**
   * 'as-needed' keeps the Russian site on clean unprefixed paths
   * (/korpusnaya-mebel) exactly as specified, while Spanish and English get
   * /es and /en prefixes. hreflang still emits all three absolute URLs plus
   * x-default, so the unprefixed default is unambiguous to crawlers.
   */
  localePrefix: 'as-needed',
  /**
   * Locale is resolved from the URL only. Automatic Accept-Language
   * redirection would make every page's canonical URL depend on the visitor's
   * browser, which is hostile to crawlers and to shared links.
   */
  localeDetection: false,
});
