'use client';

import { useState } from 'react';

import { updateSlug } from '@/app/(admin)/admin/_actions/content';
import { buttonClasses } from '@/components/ui/button';
import { ConfirmButton } from '@/components/ui/dialog';
import { LOCALES, type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { useAction } from './use-action';

/** Only what this screen says better than the shared vocabulary. */
const ERRORS = {
  slug_taken: 'Такой адрес уже занят другой страницей.',
  not_found: 'Страница не найдена.',
  invalid_input: 'Проверьте адрес.',
};

/**
 * The address of each locale.
 *
 * This existed as a server action with no interface at all, so the instruction
 * telling the owner to rename a page here described something that could not be
 * done. It matters most for Spanish and English: whoever proofreads those will
 * find an address that reads wrong, and the answer until now was "ask a
 * developer".
 *
 * A published rename writes a 301 from the old path automatically, so nothing
 * that was already indexed or already sent to someone starts 404ing.
 */
export function AddressEditor({
  documentId,
  locales,
  prefix = '',
}: {
  documentId: string;
  locales: Array<{ locale: Locale; slug: string; status: string }>;
  /** Path segment in front of the slug, e.g. 'raboty/' for a project. */
  prefix?: string;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(locales.map((entry) => [entry.locale, entry.slug])),
  );
  const { isBusy, error, status, run } = useAction(ERRORS);

  const byLocale = new Map(locales.map((entry) => [entry.locale, entry]));

  function apply(locale: Locale) {
    run(() => updateSlug({ documentId, locale, slug: values[locale] ?? '' }), {
      key: locale,
      success: `Адрес ${locale.toUpperCase()} изменён.`,
    });
  }

  return (
    <section className="border-line bg-surface rounded-[--radius-card] border p-4">
      <h2 className="font-display mb-1 text-[19px]">Адреса страницы</h2>
      <p className="text-ink-faint mb-3 max-w-[70ch] text-[13px]">
        По этим адресам страница открывается на сайте. Если адрес уже был опубликован, со старого
        автоматически появится переадресация — ссылки, которые кому-то отправляли, продолжат
        работать.
      </p>

      <div className="flex flex-col gap-3">
        {LOCALES.map((locale) => {
          const entry = byLocale.get(locale);
          if (!entry) return null;
          const value = values[locale] ?? '';
          const changed = value !== entry.slug;
          const isHome = entry.slug === '';

          return (
            <div key={locale} className="flex flex-wrap items-end gap-2">
              <div className="min-w-[260px] flex-1">
                <label
                  htmlFor={`slug-${locale}`}
                  className="text-ink-muted mb-1 block text-[12px] font-medium"
                >
                  Адрес {locale.toUpperCase()}
                </label>
                <div className="flex items-center gap-1">
                  <span className="text-ink-faint font-mono text-[13px]">
                    /{locale === 'ru' ? '' : `${locale}/`}
                    {prefix}
                  </span>
                  <input
                    id={`slug-${locale}`}
                    value={value}
                    disabled={isBusy(locale) || isHome}
                    onChange={(event) =>
                      setValues((prev) => ({ ...prev, [locale]: event.target.value }))
                    }
                    className={cn(
                      'border-line-strong bg-surface focus:border-accent w-full rounded-[--radius-btn] border px-3 py-2 font-mono text-[13px] outline-none',
                      'disabled:opacity-50',
                    )}
                  />
                </div>
              </div>

              {isHome ? (
                <span className="text-ink-faint pb-2 text-[12px]">
                  главная страница — адрес не меняется
                </span>
              ) : changed ? (
                entry.status === 'published' ? (
                  <ConfirmButton
                    label="Применить"
                    title={`Сменить адрес ${locale.toUpperCase()}?`}
                    description={`Страница сейчас на сайте по адресу /${entry.slug}. Со старого адреса появится постоянная переадресация на новый.`}
                    confirmLabel="Сменить адрес"
                    tone="neutral"
                    variant="outline"
                    className="mb-1 text-[13px]"
                    disabled={isBusy(locale)}
                    onConfirm={() => apply(locale)}
                  />
                ) : (
                  <button
                    type="button"
                    disabled={isBusy(locale)}
                    onClick={() => apply(locale)}
                    className={cn(buttonClasses('outline', 'sm'), 'mb-1 text-[13px]')}
                  >
                    Применить
                  </button>
                )
              ) : null}
            </div>
          );
        })}
      </div>

      <p role="status" className="text-ink-muted mt-3 text-[13px] empty:hidden">
        {status}
      </p>
      <p role="alert" className="mt-3 text-[13px] text-[oklch(0.52_0.17_25)] empty:hidden">
        {error}
      </p>
    </section>
  );
}
