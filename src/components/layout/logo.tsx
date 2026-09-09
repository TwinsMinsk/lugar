import { cn } from '@/lib/utils';

export type BrandLogo = { url: string; width: number; height: number };

/**
 * Wordmark, or the real logo once there is one.
 *
 * The text treatment is the honest default: a wordmark in the brand's own
 * display face looks intentional where a grey placeholder box does not. But
 * "when a real logo arrives it replaces this component's contents" — what the
 * comment here used to promise — meant editing this file. The owner could
 * upload a logo under Settings and nothing anywhere read it; the setting sat in
 * the amber "waiting for values" banner with no way to satisfy it.
 *
 * A plain <img>, not `MediaImage`: that component crops to a frame around a
 * focal point, which is the right behaviour for photography and the wrong one
 * for a mark — the same reason the brand logos on the materials block are
 * drawn `contain`. The height is fixed to the line the wordmark occupied and
 * the width follows, so a logo of any proportion sits on the same baseline as
 * the text it replaces.
 */
export function Logo({
  className,
  size = 'md',
  onDark = false,
  logo,
}: {
  className?: string;
  size?: 'sm' | 'md';
  onDark?: boolean;
  logo?: BrandLogo | null;
}) {
  if (logo) {
    return (
      <span className={cn('flex items-center', className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logo.url}
          alt="LUGAR"
          width={logo.width}
          height={logo.height}
          className={cn('w-auto object-contain', size === 'md' ? 'h-[26px]' : 'h-[18px]')}
        />
      </span>
    );
  }

  return (
    <span className={cn('flex items-baseline gap-2.5', className)}>
      <span
        className={cn(
          'font-display leading-none tracking-[0.22em] uppercase',
          size === 'md' ? 'text-[26px]' : 'text-[18px]',
          onDark && 'text-on-dark-bright',
        )}
      >
        Lugar
      </span>
      <span
        className={cn(
          'pb-0.5 text-[9px] tracking-[0.3em] uppercase',
          onDark ? 'text-on-dark-faint' : 'text-ink-faint',
        )}
      >
        España
      </span>
    </span>
  );
}
