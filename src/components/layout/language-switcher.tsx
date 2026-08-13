'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { LOCALE_LABEL, LOCALES, type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * Language switcher.
 *
 * Links through a server route rather than rewriting the path on the client.
 *
 * The naive approach — take the current pathname and swap the locale prefix —
 * silently breaks the moment the owner gives a page its own Spanish slug, and
 * then every language switch on that page is a 404. Resolving the equivalent
 * document server-side means diverged slugs are handled correctly by
 * construction, at the cost of one redirect.
 */
export function LanguageSwitcher({
  currentLocale,
  onDark = false,
}: {
  currentLocale: Locale;
  onDark?: boolean;
}) {
  const t = useTranslations('nav');
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-0.5" role="group" aria-label={t('languageSwitcher')}>
      {LOCALES.map((locale) => {
        const isCurrent = locale === currentLocale;
        return (
          <a
            key={locale}
            href={`/api/locale/${locale}?from=${encodeURIComponent(pathname)}`}
            hrefLang={locale}
            aria-current={isCurrent ? 'true' : undefined}
            aria-label={
              isCurrent
                ? t('currentLanguage', { language: LOCALE_LABEL[locale] })
                : t('switchTo', { language: LOCALE_LABEL[locale] })
            }
            className={cn(
              'rounded-[--radius-btn] px-[7px] py-1.5 text-[12px] tracking-[0.1em] transition-colors',
              'duration-[--duration-fast]',
              isCurrent
                ? onDark
                  ? 'text-on-dark bg-white/10 font-semibold'
                  : 'text-ink bg-[oklch(0.92_0.006_85)] font-semibold'
                : onDark
                  ? 'text-on-dark-faint hover:text-on-dark'
                  : 'text-ink-ghost hover:text-ink',
            )}
          >
            {LOCALE_LABEL[locale]}
          </a>
        );
      })}
    </div>
  );
}
