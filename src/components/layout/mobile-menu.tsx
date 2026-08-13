'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Logo } from '@/components/layout/logo';
import { useLeadDialog } from '@/features/leads/lead-dialog-context';
import { buttonClasses } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

export type MobileNavItem = { href: string; label: string };

/**
 * Mobile navigation overlay.
 *
 * Focus handling is the point of this component, not the animation:
 *  - focus moves into the panel on open and returns to the trigger on close
 *  - Tab is trapped inside the panel while it is open
 *  - Escape closes it
 *  - background scrolling is locked
 *
 * The panel fades and slides a few pixels. It never starts from `scale(0)`,
 * which makes a menu feel like it is being thrown at the user.
 */
export function MobileMenu({ items, ctaLabel }: { items: MobileNavItem[]; ctaLabel: string }) {
  const t = useTranslations('nav');
  const { open: openLeadDialog } = useLeadDialog();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    // Move focus into the panel rather than leaving it behind the overlay.
    const focusables = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    focusables()[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;

      const nodes = focusables();
      if (nodes.length === 0) return;
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={t('openMenu')}
        className="border-line-strong nav-desktop:hidden flex h-[42px] w-[42px] cursor-pointer flex-col items-center justify-center gap-[5px] rounded-[--radius-btn] border"
      >
        <span aria-hidden className="bg-ink-strong block h-px w-[18px]" />
        <span aria-hidden className="bg-ink-strong block h-px w-[18px]" />
      </button>

      {open ? (
        <div
          id={panelId}
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={t('mainNavigation')}
          className={cn(
            'bg-bg fixed inset-0 z-[70] flex flex-col px-[clamp(18px,6vw,40px)] py-[22px]',
            'motion-safe:animate-[fade-in_180ms_ease-out]',
          )}
        >
          <div className="mb-9 flex items-center justify-between">
            <Logo />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t('closeMenu')}
              className="border-line-strong text-ink-strong flex h-[42px] w-[42px] cursor-pointer items-center justify-center rounded-[--radius-btn] border text-xl leading-none"
            >
              ×
            </button>
          </div>

          <nav className="flex flex-col gap-0.5" aria-label={t('mainNavigation')}>
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="border-line-soft font-display border-b py-1.5 text-[30px] leading-[1.5]"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              openLeadDialog({ form: 'calculate', blockContext: 'mobile_menu' });
            }}
            className={buttonClasses('primary', 'lg', 'mt-auto w-full')}
          >
            {ctaLabel}
          </button>
        </div>
      ) : null}
    </>
  );
}
