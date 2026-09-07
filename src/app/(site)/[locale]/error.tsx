'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';

import { buttonClasses } from '@/components/ui/button';
import { Section, SectionHeading, Lead } from '@/components/ui/typography';

/**
 * The public site's error boundary.
 *
 * Catches a throw anywhere below the locale layout — a bad block, a failed
 * fetch that a Server Component didn't guard — and renders inside that layout
 * rather than replacing it, so the header and footer survive whatever broke
 * underneath them. Before this file existed, the same failure fell through to
 * Next's bare default error screen: no branding, no way back, English
 * regardless of which language the visitor was reading.
 *
 * Required to be a Client Component by Next's own contract for `error.tsx` —
 * an error boundary has to be able to catch a render that already reached the
 * browser, which a Server Component cannot do.
 */
export default function ErrorBoundary({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  /**
   * Next 16.3 stabilised `retry` alongside the older `reset`. The difference
   * matters here: `reset()` only clears the boundary and re-renders with
   * whatever already-fetched data caused the failure — for a page that broke
   * because a Server Component's fetch failed, that reliably reproduces the
   * same error. `retry()` re-fetches the segment, which is what "Обновить"
   * should mean, and what the App Router docs now recommend by default.
   */
  retry: () => void;
}) {
  const t = useTranslations('error');

  // The one line standing between "a page broke" and nobody ever knowing.
  // There is no error-reporting service wired up yet — this is deliberately
  // the single place that changes when one is: swap this for `Sentry.
  // captureException(error)` and every render failure on the public site is
  // covered at once.
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Section className="flex min-h-[50vh] items-center">
      <div className="max-w-[60ch]">
        <SectionHeading as="h1" size="page" className="mb-5">
          {t('genericTitle')}
        </SectionHeading>
        <Lead className="mb-8">{t('genericBody')}</Lead>
        <button type="button" onClick={() => retry()} className={buttonClasses('primary', 'lg')}>
          {t('retry')}
        </button>
      </div>
    </Section>
  );
}
