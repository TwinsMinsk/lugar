import type { Metadata, Viewport } from 'next';
import { Alegreya, Golos_Text } from 'next/font/google';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { LOCALE_TAG, routing, type Locale } from '@/i18n/routing';
import '../../globals.css';

/**
 * Self-hosted via next/font, not the prototype's <link> to fonts.googleapis.
 * next/font inlines the @font-face at build time and preloads the files from
 * our own origin, which removes a render-blocking third-party round trip and
 * removes the layout shift the prototype would otherwise ship.
 */
const alegreya = Alegreya({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500'],
  variable: '--font-alegreya',
  display: 'swap',
});

const golos = Golos_Text({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600'],
  variable: '--font-golos',
  display: 'swap',
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f7f6f3',
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({ locale, namespace: 'common' });

  return {
    // Per-page titles fill the slot; the brand suffix is applied once here.
    title: { default: 'LUGAR', template: '%s — LUGAR' },
    applicationName: 'LUGAR',
    formatDetection: { telephone: false },
    other: { 'x-ui-locale': t('loading') ? locale : locale },
  };
}

export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  // Required for static rendering of a locale-segmented tree.
  setRequestLocale(locale);

  return (
    <html lang={LOCALE_TAG[locale as Locale]} className={`${alegreya.variable} ${golos.variable}`}>
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
