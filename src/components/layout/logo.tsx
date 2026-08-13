import { cn } from '@/lib/utils';

/**
 * Wordmark.
 *
 * A text treatment, not an image, because the owner has not supplied a logo
 * file yet — and a text wordmark in the brand's own display face is honest and
 * looks intentional, whereas a grey box does not. When a real logo arrives it
 * replaces this component's contents; nothing else changes.
 */
export function Logo({
  className,
  size = 'md',
  onDark = false,
}: {
  className?: string;
  size?: 'sm' | 'md';
  onDark?: boolean;
}) {
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
