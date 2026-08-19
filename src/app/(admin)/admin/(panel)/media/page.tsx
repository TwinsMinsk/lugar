import Link from 'next/link';

import { buttonClasses } from '@/components/ui/button';
import { listMedia } from '@/data/admin/media';
import { publicEnv } from '@/env';
import { MediaManager, type MediaItem } from '@/features/admin/media-manager';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Фотографии' };

type Params = { filter?: string; q?: string; page?: string };

export default async function AdminMediaPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { filter, q, page: rawPage } = await searchParams;
  const onlyPlaceholders = filter === 'placeholder';
  const page = Math.max(Number(rawPage ?? '1') || 1, 1);

  const [library, removedAssets] = await Promise.all([
    listMedia({ onlyPlaceholders, q, page }),
    listMedia({ deleted: true, perPage: 24 }),
  ]);

  const base = publicEnv.mediaBaseUrl.replace(/\/$/, '');
  const url = (key: string) => (base ? `${base}/${key}` : `/api/media/${key}`);

  const toItem = (asset: (typeof library.rows)[number]): MediaItem => ({
    id: asset.id,
    // Content-addressed keys already change when the file does; see mediaUrl().
    url: url(asset.storageKey),
    // The card shows the smallest generated size. Pointing it at the original
    // is what made this screen unusable with real photography.
    thumbnailUrl: url(asset.thumbnailKey ?? asset.storageKey),
    width: asset.width,
    height: asset.height,
    bytes: asset.bytes,
    alt: asset.alt,
    focalX: asset.focalX,
    focalY: asset.focalY,
    credit: null,
    isPlaceholder: asset.isPlaceholder,
    usageCount: asset.usageCount,
    usedOnPublishedPage: asset.usedOnPublishedPage,
  });

  const pageCount = Math.max(Math.ceil(library.total / library.perPage), 1);
  const href = (next: { page?: number; filter?: string; q?: string }) => {
    const search = new URLSearchParams();
    const nextFilter = next.filter ?? (onlyPlaceholders ? 'placeholder' : undefined);
    const nextQuery = next.q ?? q;
    if (nextFilter) search.set('filter', nextFilter);
    if (nextQuery) search.set('q', nextQuery);
    if (next.page && next.page > 1) search.set('page', String(next.page));
    return search.toString() ? `/admin/media?${search}` : '/admin/media';
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[32px] leading-tight">Фотографии</h1>
        <p className="text-ink-soft mt-2 max-w-[70ch] text-[14px]">
          Фокус-точку задавайте кликом по нужной части фотографии — именно она останется в кадре при
          любой обрезке. Оригинал никогда не перезаписывается: все размеры генерируются отдельно,
          поэтому кадрировать можно сколько угодно раз.
        </p>
      </div>

      <form
        method="get"
        action="/admin/media"
        className="border-line bg-surface flex flex-wrap items-end gap-3 rounded-[--radius-card] border p-4"
      >
        <div className="min-w-[240px] flex-1">
          <label htmlFor="media-q" className="text-ink-muted mb-1 block text-[12px] font-medium">
            Поиск по описанию
          </label>
          <input
            id="media-q"
            name="q"
            defaultValue={q ?? ''}
            placeholder="Например: кухня с островом"
            className="border-line-strong bg-surface w-full rounded-[--radius-btn] border px-3 py-2 text-[14px]"
          />
        </div>
        {onlyPlaceholders ? <input type="hidden" name="filter" value="placeholder" /> : null}
        <button type="submit" className={buttonClasses('primary', 'sm')}>
          Показать
        </button>
        {q ? (
          <Link
            href={href({ q: '', page: 1 })}
            className={cn(buttonClasses('ghost', 'sm'), 'text-[13px]')}
          >
            Сбросить
          </Link>
        ) : null}

        {/* The placeholder filter had no visible control at all — it existed
            only as a query string the owner was never told about. */}
        <Link
          href={
            onlyPlaceholders
              ? href({ filter: '', page: 1 })
              : href({ filter: 'placeholder', page: 1 })
          }
          className={cn(
            'ml-auto rounded-[--radius-btn] border px-2.5 py-1 text-[13px] transition-colors',
            onlyPlaceholders
              ? 'border-accent text-accent'
              : 'border-line text-ink-muted hover:border-line-strong',
          )}
        >
          {onlyPlaceholders ? 'Показаны только заглушки' : 'Только заглушки'}
        </Link>
      </form>

      {onlyPlaceholders ? (
        <p className="border-warning-line bg-warning-surface rounded-[--radius-card] border px-4 py-3 text-[13px]">
          Показаны только заглушки. Замените файл в карточке — все блоки, где стоит это изображение,
          подхватят новое сами.
        </p>
      ) : null}

      <MediaManager items={library.rows.map(toItem)} removed={removedAssets.rows.map(toItem)} />

      {pageCount > 1 ? (
        <nav aria-label="Страницы" className="flex flex-wrap items-center gap-3">
          <span className="text-ink-faint text-[13px]">
            Страница {library.page} из {pageCount} · всего {library.total}
          </span>
          {library.page > 1 ? (
            <Link
              href={href({ page: library.page - 1 })}
              className={cn(buttonClasses('ghost', 'sm'), 'text-[13px]')}
            >
              Назад
            </Link>
          ) : null}
          {library.page < pageCount ? (
            <Link
              href={href({ page: library.page + 1 })}
              className={cn(buttonClasses('outline', 'sm'), 'text-[13px]')}
            >
              Дальше
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
