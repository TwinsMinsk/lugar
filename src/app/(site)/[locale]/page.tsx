import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { routing } from '@/i18n/routing';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * M1 placeholder.
 *
 * In M2 this is replaced by the CMS-driven resolver: look up the published
 * `document_locales` row for this locale and slug, load its frozen revision,
 * and render the block list through the block registry.
 */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations('cta');

  return (
    <main className="container-editorial section-y">
      <p className="eyebrow">LUGAR · España</p>
      <h1 className="mt-4 text-[clamp(34px,5.6vw,74px)] leading-[1.04] tracking-[-0.01em]">
        Мебель, сделанная точно под ваш дом
      </h1>
      <p className="text-ink-muted mt-6 max-w-[44ch] text-[clamp(15px,1.5vw,19px)] leading-relaxed">
        Каркас приложения готов. Публичные страницы собираются из блоков CMS на этапе M2.
      </p>
      <p className="text-ink-faint mt-10 text-sm">
        {t('whatsapp')} · locale: <code>{locale}</code>
      </p>
    </main>
  );
}
