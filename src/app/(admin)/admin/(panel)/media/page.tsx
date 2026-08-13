import { listMedia } from '@/data/admin/media';
import { publicEnv } from '@/env';
import { MediaManager, type MediaItem } from '@/features/admin/media-manager';

export const metadata = { title: 'Медиа' };

export default async function AdminMediaPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const onlyPlaceholders = filter === 'placeholder';
  const assets = await listMedia({ onlyPlaceholders });

  const base = publicEnv.mediaBaseUrl.replace(/\/$/, '');
  const items: MediaItem[] = assets.map((asset) => ({
    id: asset.id,
    url: base
      ? `${base}/${asset.storageKey}?v=${asset.version}`
      : `/api/media/${asset.storageKey}?v=${asset.version}`,
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
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[32px] leading-tight">Медиа</h1>
        <p className="text-ink-soft mt-2 max-w-[70ch] text-[14px]">
          Фокус-точку задавайте кликом по нужной части фотографии — именно она останется в кадре при
          любой обрезке. Оригинал никогда не перезаписывается: все размеры генерируются отдельно,
          поэтому кадрировать можно сколько угодно раз.
        </p>
      </div>

      {onlyPlaceholders ? (
        <p className="rounded-[--radius-card] border border-[oklch(0.86_0.09_85)] bg-[oklch(0.98_0.03_85)] px-4 py-3 text-[13px]">
          Показаны только заглушки. Замените файл в карточке — все блоки, где стоит это изображение,
          подхватят новое сами.
        </p>
      ) : null}

      <MediaManager items={items} />
    </div>
  );
}
