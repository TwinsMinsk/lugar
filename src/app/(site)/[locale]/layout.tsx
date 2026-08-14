import { Suspense } from 'react';
import type { Metadata, Viewport } from 'next';
import { Alegreya, Golos_Text } from 'next/font/google';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Footer } from '@/components/layout/footer';
import { Header } from '@/components/layout/header';
import { StickyMobileCta } from '@/components/layout/sticky-mobile-cta';
import { MotionProvider } from '@/components/motion/motion-provider';
import { t } from '@/content/i18n';
import { getDocumentSlug } from '@/data/public/navigation';
import { getServiceCategories } from '@/data/public/portfolio';
import { DOCUMENT_IDS } from '@/db/seed/content';
import { AnalyticsBeacon } from '@/features/analytics/analytics-beacon';
import { AttributionBeacon } from '@/features/attribution/attribution-beacon';
import { ConsentGate } from '@/features/consent/consent-gate';
import { PreviewBanner } from '@/features/preview/preview-banner';
import { LeadDialog } from '@/features/leads/lead-dialog';
import { LeadDialogProvider } from '@/features/leads/lead-dialog-context';
import { LOCALE_TAG, routing, type Locale } from '@/i18n/routing';
import '../../globals.css';

/**
 * Fonts are self-hosted through next/font rather than the prototype's <link>
 * to fonts.googleapis.com. That removes a render-blocking third-party round
 * trip on the critical path and, because next/font emits size-adjust metrics,
 * removes the font-swap layout shift the prototype would otherwise ship.
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

  return {
    title: { default: 'LUGAR', template: '%s — LUGAR' },
    applicationName: 'LUGAR',
    // Stops iOS from turning measurements and dimensions into phone links.
    formatDetection: { telephone: false },
  };
}

export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  if (!hasLocale(routing.locales, rawLocale)) notFound();
  const locale = rawLocale as Locale;

  // Required for static rendering of a locale-segmented tree.
  setRequestLocale(locale);

  const [tNav, korpus, mebel, dveri, privacy] = await Promise.all([
    getTranslations('nav'),
    getServiceCategories('korpusnaya'),
    getServiceCategories('mebel'),
    getServiceCategories('dveri'),
    getDocumentSlug(DOCUMENT_IDS.PRIVACY, locale),
  ]);

  const services = [...korpus, ...mebel, ...dveri].map((category) => ({
    value: category.slug,
    label: t(category.label, locale) ?? category.slug,
  }));

  return (
    <html lang={LOCALE_TAG[locale]} className={`${alegreya.variable} ${golos.variable}`}>
      <body>
        <NextIntlClientProvider>
          <LeadDialogProvider>
            <MotionProvider>
              {/* Draft state is per-request, so it streams rather than being
                  baked into the prerendered shell. */}
              <Suspense fallback={null}>
                <PreviewBanner />
              </Suspense>
              <a href="#main" className="sr-only-focusable">
                {tNav('skipToContent')}
              </a>
              <AttributionBeacon />
              <AnalyticsBeacon />
              <Header locale={locale} />
              <main id="main">{children}</main>
              <Footer locale={locale} />
              <StickyMobileCta />
              <LeadDialog services={services} />
              {/* Consent is per-visitor, so it is a dynamic hole in an
                  otherwise fully prerendered page. */}
              <Suspense fallback={null}>
                <ConsentGate
                  privacyHref={privacy ? `/${privacy.slug}` : '/politika-konfidencialnosti'}
                />
              </Suspense>
            </MotionProvider>
          </LeadDialogProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
