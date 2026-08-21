'use client';

import { useRef, useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import {
  deleteMedia,
  purgeMedia,
  replaceMedia,
  restoreMedia,
  updateMediaMeta,
  uploadMedia,
} from '@/app/(admin)/admin/_actions/media';
import { buttonClasses } from '@/components/ui/button';
import { ConfirmButton } from '@/components/ui/dialog';
import { LOCALES, type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { FileDropField } from './file-drop';
import { messagesFor } from './messages';

export type MediaItem = {
  id: string;
  /** The original file. Linked, not loaded — see MediaCard. */
  url: string;
  /** Smallest generated size, which is what the grid actually shows. */
  thumbnailUrl: string;
  width: number;
  height: number;
  bytes: number;
  alt: Partial<Record<Locale, string>>;
  focalX: number;
  focalY: number;
  credit: string | null;
  isPlaceholder: boolean;
  usageCount: number;
  usedOnPublishedPage: boolean;
};

/** Only what this screen says better than the shared vocabulary. */
const message = messagesFor({
  alt_required: 'Опишите изображение — без alt-текста его не примут.',
  file_too_large: 'Файл больше 20 МБ.',
  unsupported_format: 'Поддерживаются JPEG, PNG, WebP, AVIF и TIFF.',
  unreadable_image: 'Не удалось прочитать изображение.',
  in_use_on_published_page: 'Изображение стоит на опубликованной странице.',
  still_referenced: 'Изображение ещё используется в черновике или в истории версий.',
  not_archived: 'Сначала уберите изображение.',
  not_found: 'Изображение не найдено — возможно, его уже удалили.',
  no_file: 'Файл не выбран.',
});

export function MediaManager({ items, removed }: { items: MediaItem[]; removed: MediaItem[] }) {
  const [status, setStatus] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <UploadForm onDone={setStatus} />

      {/* Always mounted: an area inserted together with its text is not
          announced by screen readers. */}
      <p role="status" className="text-ink-muted text-[13px] empty:hidden">
        {status}
      </p>

      {items.length === 0 ? (
        <p className="text-ink-soft text-[14px]">Пока ничего не загружено.</p>
      ) : (
        <ul
          aria-label="Фотографии"
          className="grid gap-4"
          style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))' }}
        >
          {items.map((item) => (
            <MediaCard key={item.id} item={item} onStatus={setStatus} />
          ))}
        </ul>
      )}

      {removed.length > 0 ? (
        <section>
          <h2 className="font-display mb-2 text-[19px]">Убранные изображения</h2>
          <p className="text-ink-faint mb-3 max-w-[70ch] text-[13px]">
            Файл никуда не делся — убранное изображение можно вернуть. Насовсем стираются только те,
            на которые не ссылается ни одна версия страницы: иначе откат к старой версии показал бы
            пустые рамки.
          </p>
          <ul
            aria-label="Убранные изображения"
            className="grid gap-4"
            style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))' }}
          >
            {removed.map((item) => (
              <RemovedCard key={item.id} item={item} onStatus={setStatus} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/**
 * One removed image.
 *
 * Deliberately not the full card: nothing here is editable, so showing the
 * whole editing apparatus for a thing that is out of the library would only
 * invite work that goes nowhere.
 */
function RemovedCard({ item, onStatus }: { item: MediaItem; onStatus: (m: string) => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <li className="border-line bg-surface flex flex-col gap-3 rounded-[--radius-card] border border-dashed p-3">
      <div className="bg-slot relative aspect-[4/3] overflow-hidden rounded-[--radius-btn] opacity-60">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" />
      </div>

      <p className="text-ink-soft text-[13px]">{item.alt.ru ?? 'Без описания'}</p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await restoreMedia(item.id);
              if (!result.ok) {
                setError(message(result.error));
                return;
              }
              onStatus('Изображение вернулось в библиотеку.');
              router.refresh();
            })
          }
          className={cn(buttonClasses('ghost', 'sm'), 'text-[12px]')}
        >
          Вернуть
        </button>

        {item.usageCount === 0 ? (
          <ConfirmButton
            label="Удалить навсегда"
            title="Удалить навсегда?"
            description="Файл будет стёрт из хранилища. Отменить это нельзя."
            disabled={pending}
            onConfirm={() =>
              startTransition(async () => {
                setError(null);
                const result = await purgeMedia(item.id);
                if (!result.ok) {
                  setError(message(result.error));
                  return;
                }
                onStatus('Изображение удалено навсегда.');
                router.refresh();
              })
            }
          />
        ) : (
          <span className="text-ink-faint text-[12px]">
            используется в истории версий — остаётся здесь
          </span>
        )}
      </div>

      <p role="alert" className="text-danger text-[12px] empty:hidden">
        {error}
      </p>
    </li>
  );
}

function UploadForm({ onDone }: { onDone: (message: string) => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      ref={formRef}
      className="border-line bg-surface flex flex-wrap items-end gap-3 rounded-[--radius-card] border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(async () => {
          setError(null);
          const result = await uploadMedia(formData);
          if (result.ok) {
            formRef.current?.reset();
            onDone('Изображение загружено.');
          } else {
            setError(message(result.error));
          }
        });
      }}
    >
      <div className="flex-1 basis-[240px]">
        <FileDropField id="media-file" label="Файл" />
      </div>

      <div className="flex-1 basis-[260px]">
        <label htmlFor="media-alt" className="text-ink-muted mb-1 block text-[12px] font-medium">
          Описание (alt, по-русски)
        </label>
        <input
          id="media-alt"
          name="altRu"
          required
          placeholder="Кухня с островом, вид от окна"
          className="border-line-strong bg-surface focus:border-accent w-full rounded-[--radius-btn] border px-3 py-2 text-[14px] outline-none"
        />
      </div>

      <button type="submit" disabled={pending} className={buttonClasses('primary', 'sm')}>
        {pending ? 'Загружаем…' : 'Загрузить'}
      </button>

      {error ? (
        <p role="alert" className="text-danger basis-full text-[13px]">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function MediaCard({ item, onStatus }: { item: MediaItem; onStatus: (m: string) => void }) {
  const [alt, setAlt] = useState(item.alt);
  const [focal, setFocal] = useState({ x: item.focalX, y: item.focalY });
  const [locale, setLocale] = useState<Locale>('ru');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /**
   * Focal point is set by clicking the preview. That is the only interaction
   * that matches what the value means — "keep this part of the photograph in
   * frame" — far better than two numeric inputs the owner has to imagine.
   */
  function pickFocal(event: React.MouseEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    setFocal({ x: Number(x.toFixed(3)), y: Number(y.toFixed(3)) });
  }

  return (
    <li className="border-line bg-surface flex flex-col rounded-[--radius-card] border">
      <button
        type="button"
        onClick={pickFocal}
        aria-label="Выбрать фокус-точку: нажмите на важную часть изображения"
        className="bg-slot relative aspect-[4/3] w-full cursor-crosshair overflow-hidden rounded-t-[--radius-card]"
      >
        {item.isPlaceholder ? (
          <span
            className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold tracking-[0.2em] text-[oklch(0.32_0.14_350)] uppercase"
            style={{
              background:
                'repeating-linear-gradient(45deg, oklch(0.86 0.09 350) 0 12px, oklch(0.93 0.05 350) 12px 24px)',
            }}
          >
            Заглушка
          </span>
        ) : (
          /* The generated size, not the original.
             The card is under 300px wide, so the original was being downloaded
             in full and thrown away by the browser — fine for the seeded
             placeholders, ruinous with a real shoot. Judging the source
             photograph is still possible: «Открыть оригинал» below opens the
             untouched file. The focal point is a relative coordinate, so it
             lands identically on either. */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.thumbnailUrl}
            alt=""
            className="h-full w-full object-cover"
            style={{ objectPosition: `${focal.x * 100}% ${focal.y * 100}%` }}
          />
        )}
        <span
          aria-hidden
          className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
          style={{ left: `${focal.x * 100}%`, top: `${focal.y * 100}%` }}
        />
      </button>

      <div className="flex flex-1 flex-col gap-2.5 p-3.5">
        <div className="text-ink-faint flex flex-wrap items-center gap-2 text-[12px]">
          <span>
            {item.width}×{item.height}
          </span>
          <span>{Math.round(item.bytes / 1024)} КБ</span>
          <a
            href={item.url}
            target="_blank"
            rel="noopener"
            className="hover:text-accent underline underline-offset-2"
          >
            оригинал ↗
          </a>
          {item.usedOnPublishedPage ? (
            <span className="bg-success-surface text-success-ink rounded-[--radius-btn] px-1.5 py-0.5 text-[11px]">
              на сайте
            </span>
          ) : item.usageCount > 0 ? (
            <span className="rounded-[--radius-btn] bg-[oklch(0.93_0.005_85)] px-1.5 py-0.5 text-[11px]">
              в черновике
            </span>
          ) : (
            <span className="text-ink-ghost">не используется</span>
          )}
        </div>

        <div className="flex gap-1">
          {LOCALES.map((code) => (
            <button
              key={code}
              type="button"
              aria-pressed={locale === code}
              onClick={() => setLocale(code)}
              className={cn(
                'rounded-[--radius-btn] border px-2 py-0.5 text-[11px] uppercase',
                locale === code
                  ? 'bg-accent border-accent text-white'
                  : 'border-line-chip text-ink-filter',
              )}
            >
              {code}
            </button>
          ))}
        </div>

        <label className="sr-only" htmlFor={`alt-${item.id}-${locale}`}>
          Описание изображения ({locale})
        </label>
        <input
          id={`alt-${item.id}-${locale}`}
          value={alt[locale] ?? ''}
          placeholder={locale === 'ru' ? 'Описание (обязательно)' : (alt.ru ?? '')}
          onChange={(event) => setAlt({ ...alt, [locale]: event.target.value })}
          className="border-line-strong bg-surface focus:border-accent w-full rounded-[--radius-btn] border px-2.5 py-1.5 text-[13px] outline-none"
        />

        {error ? (
          <p role="alert" className="text-danger text-[12px]">
            {error}
          </p>
        ) : null}

        <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const result = await updateMediaMeta({
                  assetId: item.id,
                  alt: { ru: alt.ru ?? '', es: alt.es, en: alt.en },
                  focalX: focal.x,
                  focalY: focal.y,
                });
                if (result.ok) onStatus('Сохранено.');
                else setError(message(result.error));
              })
            }
            className={buttonClasses('outline', 'sm', 'text-[12px]')}
          >
            Сохранить
          </button>

          <label className={cn(buttonClasses('ghost', 'sm', 'cursor-pointer text-[12px]'))}>
            Заменить файл
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif,image/tiff"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const formData = new FormData();
                formData.set('assetId', item.id);
                formData.set('file', file);
                startTransition(async () => {
                  setError(null);
                  const result = await replaceMedia(formData);
                  if (result.ok) onStatus('Файл заменён — блоки, где он стоит, обновятся сами.');
                  else setError(message(result.error));
                });
              }}
            />
          </label>

          {item.usedOnPublishedPage ? (
            <span className="text-ink-faint text-[12px]">
              стоит на опубликованной странице — убрать нельзя
            </span>
          ) : (
            <ConfirmButton
              label="Убрать"
              title="Убрать изображение?"
              description={
                item.usageCount > 0
                  ? 'Изображение используется в черновиках или в истории версий. Оно уйдёт из библиотеки, но файл останется — вернуть можно в любой момент.'
                  : 'Изображение уйдёт из библиотеки. Файл останется, вернуть можно в любой момент.'
              }
              disabled={pending}
              onConfirm={() =>
                startTransition(async () => {
                  setError(null);
                  const result = await deleteMedia(item.id);
                  if (result.ok) onStatus('Изображение убрано.');
                  else {
                    const where = result.blockedBy
                      ?.map((entry) => `/${entry.slug} (${entry.locale})`)
                      .join(', ');
                    setError(message(result.error) + (where ? ` — ${where}` : ''));
                  }
                })
              }
            />
          )}
        </div>
      </div>
    </li>
  );
}
