'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { useTranslations } from 'next-intl';

import { buttonClasses } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import {
  ALLOW_ALL,
  buildConsentState,
  CONSENT_CHANGED_EVENT,
  CONSENT_OPEN_EVENT,
  DENY_ALL,
  readConsentCookie,
  writeConsentCookie,
  type ConsentState,
} from './consent';

/**
 * Cookie consent banner.
 *
 * Deliberate choices:
 *  - "Only necessary" is a real button of equal prominence, not a link buried
 *    in a settings panel. A refusal that takes more clicks than acceptance is
 *    not a free choice.
 *  - Nothing renders until the client has read the cookie, so the banner never
 *    flashes for a visitor who already decided. That also means it cannot be
 *    prerendered into the static HTML, which is correct — consent is per-person,
 *    not per-page.
 *  - It is a complementary landmark, not a modal: it must not trap focus or
 *    block reading the page, and the visitor can ignore it indefinitely with
 *    analytics simply staying off.
 */
export function ConsentBanner({
  privacyHref,
  initiallyOpen = false,
}: {
  privacyHref: string;
  /** Decided on the server by ConsentGate, so there is no first-paint flash. */
  initiallyOpen?: boolean;
}) {
  const t = useTranslations('consent');
  const [visible, setVisible] = useState(initiallyOpen);
  const [showDetails, setShowDetails] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const panelId = useId();

  const apply = useCallback((next: ConsentState) => {
    writeConsentCookie(next);
    setVisible(false);
    setShowDetails(false);
    window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT, { detail: next }));
  }, []);

  // The footer's "Cookie preferences" link reopens this panel.
  useEffect(() => {
    const reopen = () => {
      const current = readConsentCookie();
      setAnalytics(current?.analytics ?? false);
      setMarketing(current?.marketing ?? false);
      setShowDetails(true);
      setVisible(true);
    };
    window.addEventListener(CONSENT_OPEN_EVENT, reopen);

    // The footer button is server-rendered, so it is wired by delegation
    // rather than by passing a handler through the server/client boundary.
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-consent-open]')) {
        event.preventDefault();
        reopen();
      }
    };
    document.addEventListener('click', onClick);

    return () => {
      window.removeEventListener(CONSENT_OPEN_EVENT, reopen);
      document.removeEventListener('click', onClick);
    };
  }, []);

  if (!visible) return null;

  const toggleClass = 'flex items-start gap-2.5 text-[13px] leading-relaxed text-ink-muted';

  return (
    <aside
      aria-label={t('title')}
      className={cn(
        'border-line bg-surface fixed right-0 bottom-0 left-0 z-[75] border-t shadow-[0_-8px_30px_rgba(0,0,0,0.10)]',
        // Clear of the sticky mobile CTA so the two never overlap.
        'nav-desktop:pb-5 pb-[calc(88px+1rem)]',
        'motion-safe:animate-[fade-in-up_220ms_ease-out]',
      )}
    >
      <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-[clamp(18px,5vw,64px)] pt-5">
        <div className="flex flex-col gap-2">
          <p className="font-display text-[19px] leading-tight">{t('title')}</p>
          <p className="text-ink-soft max-w-[70ch] text-[13.5px] leading-relaxed">
            {t('body')}{' '}
            <Link href={privacyHref} className="text-accent underline underline-offset-2">
              {t('manage')}
            </Link>
          </p>
        </div>

        {showDetails ? (
          <div id={panelId} className="flex flex-col gap-2.5 pt-1">
            <label className={cn(toggleClass, 'opacity-60')}>
              <input type="checkbox" checked disabled className="accent-accent mt-0.5 h-4 w-4" />
              <span>
                <strong className="text-ink font-medium">{t('categoryNecessary')}</strong> —{' '}
                {t('categoryNecessaryHint')}
              </span>
            </label>
            <label className={toggleClass}>
              <input
                type="checkbox"
                checked={analytics}
                onChange={(event) => setAnalytics(event.target.checked)}
                className="accent-accent mt-0.5 h-4 w-4"
              />
              <span>
                <strong className="text-ink font-medium">{t('categoryAnalytics')}</strong> —{' '}
                {t('categoryAnalyticsHint')}
              </span>
            </label>
            <label className={toggleClass}>
              <input
                type="checkbox"
                checked={marketing}
                onChange={(event) => setMarketing(event.target.checked)}
                className="accent-accent mt-0.5 h-4 w-4"
              />
              <span>
                <strong className="text-ink font-medium">{t('categoryMarketing')}</strong> —{' '}
                {t('categoryMarketingHint')}
              </span>
            </label>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => apply(buildConsentState(ALLOW_ALL))}
            className={buttonClasses('primary', 'sm')}
          >
            {t('acceptAll')}
          </button>
          <button
            type="button"
            onClick={() => apply(buildConsentState(DENY_ALL))}
            className={buttonClasses('outline', 'sm')}
          >
            {t('rejectAll')}
          </button>
          {showDetails ? (
            <button
              type="button"
              onClick={() => apply(buildConsentState({ necessary: true, analytics, marketing }))}
              className={buttonClasses('ghost', 'sm')}
            >
              {t('save')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowDetails(true)}
              aria-expanded={showDetails}
              aria-controls={panelId}
              className={buttonClasses('ghost', 'sm')}
            >
              {t('settings')}
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
