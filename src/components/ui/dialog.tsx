'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { buttonClasses } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Modal dialog.
 *
 * The focus trap was written twice before this file existed — once in the media
 * picker, once in the public lead dialog — and a third copy was about to be
 * written for confirmations. The behaviour has to be identical everywhere or
 * keyboard users learn one dialog at a time, so it lives here.
 *
 * `initialFocus` exists for confirmations specifically: the first focusable
 * element in a confirmation is the destructive button, and opening a dialog
 * with the destructive option already under the return key is a trap.
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  label,
  labelledBy,
  describedBy,
  onClose,
  initialFocus,
  className,
  children,
}: {
  /** Accessible name. Use `labelledBy` instead when a heading already says it. */
  label?: string;
  labelledBy?: string;
  describedBy?: string;
  onClose: () => void;
  initialFocus?: React.RefObject<HTMLElement | null>;
  className?: string;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const focusables = () =>
      Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);

    (initialFocus?.current ?? focusables()[0])?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
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
      // Back to whatever opened it, so a keyboard user is not returned to the
      // top of the document.
      previouslyFocused?.focus();
    };
    // `onClose` is expected to be stable; callers wrap it in useCallback.
  }, [onClose, initialFocus]);

  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center bg-black/45 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={labelledBy ? undefined : label}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        className={cn('bg-bg w-full rounded-[--radius-card] p-5', className)}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * A destructive action behind one deliberate confirmation.
 *
 * The rules live in this component rather than at each call site, because a
 * confirmation that behaves differently on two screens is worse than none: the
 * owner stops reading it. Cancel takes the initial focus; Escape and the
 * backdrop cancel; the confirm button repeats the verb of the trigger rather
 * than saying "OK", so the sentence still makes sense when read alone; and the
 * dialog closes *before* the action runs, so the outcome is reported by the
 * screen rather than by a panel that has to stay open to show it.
 */
export function ConfirmButton({
  label,
  title,
  description,
  confirmLabel,
  onConfirm,
  disabled,
  variant = 'ghost',
  size = 'sm',
  className,
}: {
  /** The trigger's text. */
  label: string;
  title: string;
  description: React.ReactNode;
  /** Defaults to the trigger's text — the verb should not change mid-decision. */
  confirmLabel?: string;
  onConfirm: () => void;
  disabled?: boolean;
  variant?: 'ghost' | 'outline';
  size?: 'sm' | 'md';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const headingId = useId();
  const bodyId = useId();

  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn(buttonClasses(variant, size), 'text-[12px]', className)}
      >
        {label}
      </button>

      {open ? (
        <Modal
          labelledBy={headingId}
          describedBy={bodyId}
          onClose={close}
          initialFocus={cancelRef}
          className="max-w-[460px]"
        >
          <h2 id={headingId} className="font-display text-[21px] leading-tight">
            {title}
          </h2>
          <div id={bodyId} className="text-ink-soft mt-2 text-[14px] leading-relaxed">
            {description}
          </div>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button
              ref={cancelRef}
              type="button"
              onClick={close}
              className={buttonClasses('ghost', 'sm')}
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onConfirm();
              }}
              className={cn(
                buttonClasses('outline', 'sm'),
                'border-[oklch(0.52_0.17_25)] text-[oklch(0.52_0.17_25)]',
                'hover:bg-[oklch(0.52_0.17_25)] hover:text-white',
              )}
            >
              {confirmLabel ?? label}
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

/**
 * The same decision, without leaving the row.
 *
 * For consequences the row itself already shows — removing a menu item, taking
 * a project out of the list. A modal for those is heavier than the action, and
 * the pipeline editor established this pattern before this file existed.
 */
export function InlineConfirm({
  label,
  question,
  confirmLabel,
  onConfirm,
  disabled,
  className,
}: {
  label: string;
  question: string;
  confirmLabel?: string;
  onConfirm: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  if (!open) {
    return (
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn(buttonClasses('ghost', 'sm'), 'text-[12px]', className)}
      >
        {label}
      </button>
    );
  }

  return (
    <span className="border-line flex flex-wrap items-center gap-2 rounded-[--radius-btn] border border-dashed px-2 py-1">
      <span className="text-ink-soft text-[12px]">{question}</span>
      <button
        ref={cancelRef}
        type="button"
        onClick={() => {
          setOpen(false);
          triggerRef.current?.focus();
        }}
        className={cn(buttonClasses('ghost', 'sm'), 'text-[12px]')}
      >
        Отмена
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen(false);
          onConfirm();
        }}
        className={cn(buttonClasses('outline', 'sm'), 'text-[12px]')}
      >
        {confirmLabel ?? label}
      </button>
    </span>
  );
}
