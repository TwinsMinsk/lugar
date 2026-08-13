import { getTranslations } from 'next-intl/server';

import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { Logo } from '@/components/layout/logo';
import { MobileMenu, type MobileNavItem } from '@/components/layout/mobile-menu';
import { LeadTrigger } from '@/features/leads/lead-trigger';
import { buttonClasses } from '@/components/ui/button';
import { t } from '@/content/i18n';
import { getNavigation } from '@/data/public/navigation';
import { getPortfolioIndexSlug } from '@/data/public/documents';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { documentPath } from '@/lib/routes';

/**
 * Sticky site header.
 *
 * The desktop/mobile breakpoint is 1180px, not the usual 1024px, because the
 * Russian menu labels ("Корпусная мебель", "Наши работы") are long enough to
 * wrap the nav below that — the prototype made the same call.
 */
export async function Header({ locale }: { locale: Locale }) {
  const [items, indexSlug, tr] = await Promise.all([
    getNavigation('header', locale),
    getPortfolioIndexSlug(locale),
    getTranslations('cta'),
  ]);

  const navItems: MobileNavItem[] = items.map((item) => ({
    label: t(item.label, locale) ?? '',
    href: item.externalUrl
      ? item.externalUrl
      : item.anchor
        ? `#${item.anchor}`
        : documentPath(item.kind ?? 'page', item.slug ?? '', indexSlug),
  }));

  return (
    <header className="border-line bg-bg/90 sticky top-0 z-[60] border-b backdrop-blur-[14px]">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-5 px-[clamp(18px,4vw,56px)] py-4">
        <Link href="/" className="flex-none" aria-label="LUGAR">
          <Logo />
        </Link>

        <nav
          className="nav-desktop:flex hidden items-center gap-[clamp(13px,1.7vw,30px)]"
          aria-label={tr('whatsapp')}
        >
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-ink-nav hover:text-accent hover:border-b-accent border-b border-transparent py-1.5 text-[14px] tracking-[0.01em] whitespace-nowrap transition-colors duration-[--duration-fast]"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex flex-none items-center gap-3.5">
          <LanguageSwitcher currentLocale={locale} />
          <LeadTrigger
            form="calculate"
            className={buttonClasses('primary', 'sm', 'nav-desktop:inline-flex hidden')}
          >
            {tr('whatsappShort')}
          </LeadTrigger>
          <MobileMenu items={navItems} ctaLabel={tr('whatsapp')} />
        </div>
      </div>
    </header>
  );
}
