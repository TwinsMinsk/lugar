'use client';

import { useState } from 'react';

import { updateSeo } from '@/app/(admin)/admin/_actions/content';
import { buttonClasses } from '@/components/ui/button';
import { LOCALES, type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { useAction } from './use-action';

/** Only what this screen says better than the shared vocabulary. */
const ERRORS = {
  not_found: 'Страница не найдена.',
  invalid_input: 'Заголовок — до 70 символов, описание — до 180.',
};

type SeoValues = { title: string; description: string };

/** As stored: every field optional, and two the form does not edit. */
type StoredSeo = { title?: string; description?: string };

/**
 * What Google shows for this page.
 *
 * The data existed, the site served it and the editor loaded it — there was
 * simply no form, so the one thing the owner most wants to control about how
 * the studio appears in search was the one thing they could not touch.
 *
 * Per locale, because that is how it is stored and how it is served: a Spanish
 * search result showing a Russian headline is worse than no headline.
 *
 * The counters are advice, not a limit. Google truncates around 60 and 155
 * characters; the schema allows a little more, because a good title that runs
 * two characters long is not worth refusing.
 */
export function SeoEditor({
  documentId,
  initial,
}: {
  documentId: string;
  initial: Partial<Record<Locale, StoredSeo>>;
}) {
  const [values, setValues] = useState<Record<string, SeoValues>>(() =>
    Object.fromEntries(
      LOCALES.map((locale) => [
        locale,
        {
          title: initial[locale]?.title ?? '',
          description: initial[locale]?.description ?? '',
        },
      ]),
    ),
  );
  const [locale, setLocale] = useState<Locale>('ru');
  const { isBusy, error, status, run } = useAction(ERRORS);

  const current = values[locale] ?? { title: '', description: '' };
  const saved = initial[locale] ?? { title: '', description: '' };
  const changed =
    current.title !== (saved.title ?? '') || current.description !== (saved.description ?? '');

  const field = (key: keyof SeoValues, value: string) =>
    setValues((prev) => ({ ...prev, [locale]: { ...current, [key]: value } }));

  const inputClass = cn(
    'border-line-strong bg-surface w-full rounded-[--radius-btn] border px-3 py-2 text-[14px]',
    'focus:border-accent outline-none transition-colors duration-[--duration-fast]',
  );

  return (
    <section className="border-line bg-surface rounded-[--radius-card] border p-4">
      <h2 className="font-display mb-1 text-[19px]">Как страница выглядит в поиске</h2>
      <p className="text-ink-faint mb-3 max-w-[70ch] text-[13px]">
        Заголовок — синяя строка в результатах Google, описание — серый текст под ней. Если оставить
        пусто, поисковик придумает их сам из содержимого страницы. Изменения попадают в черновик и
        уходят на сайт вместе с публикацией.
      </p>

      <div className="mb-3 flex flex-wrap gap-2">
        {LOCALES.map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => setLocale(code)}
            aria-current={locale === code ? 'true' : undefined}
            className={cn(
              'rounded-[--radius-btn] border px-2.5 py-1 text-[13px] uppercase transition-colors',
              locale === code
                ? 'border-accent text-accent'
                : 'border-line text-ink-muted hover:border-line-strong',
            )}
          >
            {code}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <label htmlFor="seo-title" className="text-ink-muted mb-1 block text-[12px] font-medium">
            Заголовок в поиске{' '}
            <span className={cn('text-ink-faint', current.title.length > 60 && 'text-warning')}>
              {current.title.length}/60
            </span>
          </label>
          <input
            id="seo-title"
            value={current.title}
            maxLength={70}
            disabled={isBusy(locale)}
            onChange={(event) => field('title', event.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label
            htmlFor="seo-description"
            className="text-ink-muted mb-1 block text-[12px] font-medium"
          >
            Описание в поиске{' '}
            <span
              className={cn('text-ink-faint', current.description.length > 155 && 'text-warning')}
            >
              {current.description.length}/155
            </span>
          </label>
          <textarea
            id="seo-description"
            value={current.description}
            maxLength={180}
            rows={3}
            disabled={isBusy(locale)}
            onChange={(event) => field('description', event.target.value)}
            className={cn(inputClass, 'resize-y')}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={isBusy(locale) || !changed}
            onClick={() =>
              run(
                () =>
                  updateSeo({
                    documentId,
                    locale,
                    title: current.title,
                    description: current.description,
                  }),
                { key: locale, success: `Сохранено (${locale.toUpperCase()})` },
              )
            }
            className={buttonClasses('outline', 'sm')}
          >
            Сохранить
          </button>

          <p role="status" className="text-ink-muted text-[13px] empty:hidden">
            {status}
          </p>
          <p role="alert" className="text-danger text-[13px] empty:hidden">
            {error}
          </p>
        </div>
      </div>
    </section>
  );
}
