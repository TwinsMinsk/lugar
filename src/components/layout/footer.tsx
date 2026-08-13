import { cacheLife } from 'next/cache';
import { getTranslations } from 'next-intl/server';

import { Logo } from '@/components/layout/logo';
import { t } from '@/content/i18n';
import { getPortfolioIndexSlug } from '@/data/public/documents';
import { getNavigation } from '@/data/public/navigation';
import { getSiteSettings } from '@/data/public/settings';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { documentPath } from '@/lib/routes';

/**
 * The copyright year, cached for a day.
 *
 * Reading `new Date()` directly during prerender is rejected by Cache
 * Components, and rightly so: the value would be frozen at build time and the
 * footer would show last year until the next deploy. A daily cache keeps the
 * page static while bounding staleness to one day.
 */
async function currentYear(): Promise<number> {
  'use cache';
  cacheLife('days');
  return new Date().getFullYear();
}

/**
 * Footer.
 *
 * Legal links and the company line are rendered only when the owner has
 * actually supplied them. An empty footer row is honest; a hardcoded
 * "© 2026 LUGAR S.L." would be a legal claim we have no basis to make.
 */
export async function Footer({ locale }: { locale: Locale }) {
  const [legalItems, settings, indexSlug, tc] = await Promise.all([
    getNavigation('footer_legal', locale),
    getSiteSettings(),
    getPortfolioIndexSlug(locale),
    getTranslations('consent'),
  ]);

  const year = await currentYear();
  const company = settings.legal.companyName;

  return (
    <footer className="bg-dark text-on-dark-faint px-[clamp(18px,5vw,64px)] pb-[clamp(32px,4vw,48px)]">
      <div className="border-dark-line mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 border-t pt-6.5">
        <Logo size="sm" onDark />

        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
          {legalItems.map((item) => (
            <Link
              key={item.id}
              href={
                item.externalUrl ?? documentPath(item.kind ?? 'page', item.slug ?? '', indexSlug)
              }
              className="hover:text-on-dark-muted transition-colors duration-[--duration-fast]"
            >
              {t(item.label, locale)}
            </Link>
          ))}
          <button
            type="button"
            data-consent-open
            className="hover:text-on-dark-muted cursor-pointer transition-colors duration-[--duration-fast]"
          >
            {tc('manage')}
          </button>
        </nav>

        <span className="text-[13px]">
          © {year} {company ?? 'LUGAR'}
        </span>
      </div>
    </footer>
  );
}
