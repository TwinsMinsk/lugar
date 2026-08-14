import Image from 'next/image';

import type { MediaRef } from '@/content/blocks/primitives';
import { t, type Locale } from '@/content/i18n';
import type { MediaAsset } from '@/data/public/media';
import { publicEnv } from '@/env';
import { cn } from '@/lib/utils';

/**
 * Resolve a public URL for an asset.
 *
 * With R2 configured this is the CDN origin; in development it falls back to
 * the same-origin media route backed by local disk.
 *
 * No cache-busting query string: storage keys are content-addressed by SHA-256,
 * so replacing an asset's file already produces a different URL. A `?v=` would
 * add nothing — and Next 16 rejects local image sources with query strings
 * unless an *exact* search value is allowlisted, precisely to prevent
 * enumeration. Keeping the URL clean sidesteps that entirely.
 */
export function mediaUrl(asset: MediaAsset): string {
  const base = publicEnv.mediaBaseUrl.replace(/\/$/, '');
  return base ? `${base}/${asset.storageKey}` : `/api/media/${asset.storageKey}`;
}

/**
 * A visibly wrong stand-in for missing photography.
 *
 * Deliberately loud. A subtle grey box is the kind of thing that reaches
 * production unnoticed; diagonal magenta hatching with REPLACE written across
 * it in three languages is not. Rendered in CSS rather than as a stored file,
 * so seeding never has to fabricate image bytes.
 */
function PlaceholderFrame({ label, className }: { label?: string; className?: string }) {
  return (
    <div
      role="img"
      aria-label={label ? `Placeholder: ${label}` : 'Placeholder image'}
      className={cn(
        'absolute inset-0 flex flex-col items-center justify-center gap-2 overflow-hidden p-4 text-center',
        className,
      )}
      style={{
        background:
          'repeating-linear-gradient(45deg, oklch(0.86 0.09 350) 0 12px, oklch(0.93 0.05 350) 12px 24px)',
      }}
    >
      <span className="text-[10px] font-semibold tracking-[0.24em] text-[oklch(0.32_0.14_350)] uppercase">
        Заменить / Reemplazar / Replace
      </span>
      {label ? (
        <span className="max-w-[28ch] text-[11px] leading-snug text-[oklch(0.38_0.10_350)]">
          {label}
        </span>
      ) : null}
    </div>
  );
}

export type MediaImageProps = {
  asset: MediaAsset | undefined;
  reference?: MediaRef;
  locale: Locale;
  /** Tailwind aspect-ratio class or an inline ratio; the frame always reserves space. */
  aspect?: string;
  sizes: string;
  /** Only the LCP hero image should set this. */
  priority?: boolean;
  className?: string;
  imageClassName?: string;
  /** Decorative images take an empty alt so screen readers skip them. */
  decorative?: boolean;
};

/**
 * The single image component for the public site.
 *
 * Always renders inside an aspect-ratio frame so space is reserved from the
 * first paint — the prototype is photography-led, and unreserved images are the
 * main way a page like this accumulates layout shift.
 *
 * The focal point is applied via object-position rather than baked into the
 * file, so re-cropping is non-destructive and the original is never rewritten.
 */
export function MediaImage({
  asset,
  reference,
  locale,
  aspect = 'aspect-[4/3]',
  sizes,
  priority = false,
  className,
  imageClassName,
  decorative = false,
}: MediaImageProps) {
  const focal = reference?.focalOverride ?? (asset ? { x: asset.focalX, y: asset.focalY } : null);
  const objectPosition = focal ? `${focal.x * 100}% ${focal.y * 100}%` : '50% 50%';

  const altText = decorative
    ? ''
    : (t(reference?.altOverride, locale) ?? (asset ? t(asset.alt, locale) : '') ?? '');

  return (
    <div className={cn('bg-slot relative overflow-hidden', aspect, className)}>
      {!asset ? (
        <PlaceholderFrame label="Изображение не выбрано" />
      ) : asset.isPlaceholder ? (
        <PlaceholderFrame label={t(asset.alt, locale) ?? undefined} />
      ) : (
        <Image
          src={mediaUrl(asset)}
          alt={altText}
          fill
          sizes={sizes}
          priority={priority}
          loading={priority ? undefined : 'lazy'}
          quality={82}
          placeholder={asset.lqip ? 'blur' : 'empty'}
          blurDataURL={asset.lqip ?? undefined}
          style={{ objectFit: 'cover', objectPosition }}
          className={imageClassName}
        />
      )}
    </div>
  );
}
