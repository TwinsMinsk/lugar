import { getTranslations } from 'next-intl/server';

import { buttonClasses } from '@/components/ui/button';
import { Section, SectionHeading, Lead } from '@/components/ui/typography';
import { Link } from '@/i18n/navigation';

/**
 * The public site's 404.
 *
 * Every unmatched path under the locale-aware catch-all — a typo'd URL, a
 * stale link from before a slug changed and its redirect expired, a bot
 * probing for WordPress admin paths — used to fall through to Next's own
 * built-in not-found boundary: an unbranded page in whatever language Next
 * ships, with none of the site's header or navigation. This is what renders
 * instead, in the visitor's own language (the `error.*` messages already
 * existed, translated into all three — nothing consumed them before this).
 *
 * A Server Component, not a client one: there is nothing here that needs the
 * browser, and `getTranslations` is the same server-side call the rest of
 * this layout already makes.
 */
export default async function NotFound() {
  const t = await getTranslations('error');

  return (
    <Section className="flex min-h-[50vh] items-center">
      <div className="max-w-[60ch]">
        <SectionHeading as="h1" size="page" className="mb-5">
          {t('notFoundTitle')}
        </SectionHeading>
        <Lead className="mb-8">{t('notFoundBody')}</Lead>
        <Link href="/" className={buttonClasses('primary', 'lg')}>
          {t('notFoundHome')}
        </Link>
      </div>
    </Section>
  );
}
