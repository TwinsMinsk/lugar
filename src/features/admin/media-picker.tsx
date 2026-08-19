'use client';

import { useEffect, useRef, useState } from 'react';

import { buttonClasses } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type PickableAsset = {
  id: string;
  url: string;
  alt: string;
  isPlaceholder: boolean;
  width: number;
  height: number;
};

/**
 * Choose an image from the library.
 *
 * Placeholders are listed rather than hidden, and labelled, because a page is
 * often built against them before the real photography exists — pretending they
 * are not selectable would just push the owner to leave the slot empty instead,
 * which reads as a bug rather than as work in progress.
 *
 * A modal, so it traps focus and returns it; the trigger stays a real button.
 */
export function MediaPicker({
  assets,
  value,
  onChange,
  label = 'Изображение',
}: {
  assets: PickableAsset[];
  value: string | null;
  onChange: (assetId: string | null) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);

  const selected = assets.find((asset) => asset.id === value) ?? null;

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const focusables = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
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

  const visible = query.trim()
    ? assets.filter((asset) => asset.alt.toLowerCase().includes(query.trim().toLowerCase()))
    : assets;

  return (
    <div>
      <span className="text-ink-muted mb-1 block text-[12px] font-medium">{label}</span>

      <div className="flex flex-wrap items-center gap-2">
        <div className="border-line bg-slot relative h-16 w-24 flex-none overflow-hidden rounded-[--radius-btn] border">
          {selected ? (
            selected.isPlaceholder ? (
              <span
                className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold tracking-[0.14em] text-[oklch(0.32_0.14_350)] uppercase"
                style={{
                  background:
                    'repeating-linear-gradient(45deg, oklch(0.86 0.09 350) 0 8px, oklch(0.93 0.05 350) 8px 16px)',
                }}
              >
                Заглушка
              </span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selected.url} alt="" className="h-full w-full object-cover" />
            )
          ) : (
            <span className="text-ink-ghost absolute inset-0 flex items-center justify-center text-[11px]">
              не выбрано
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen(true)}
          className={buttonClasses('outline', 'sm')}
        >
          {selected ? 'Заменить' : 'Выбрать'}
        </button>
        {selected ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className={buttonClasses('ghost', 'sm')}
          >
            Убрать
          </button>
        ) : null}
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-[85] flex items-center justify-center bg-black/45 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Выбор изображения"
            className="bg-bg flex max-h-[80vh] w-full max-w-[880px] flex-col rounded-[--radius-card] p-5"
          >
            <div className="mb-4 flex items-center gap-3">
              <label htmlFor="media-picker-search" className="sr-only">
                Поиск по описанию
              </label>
              <input
                id="media-picker-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Поиск по описанию"
                className="border-line-strong bg-surface focus:border-accent flex-1 rounded-[--radius-btn] border px-3 py-2 text-[14px] outline-none"
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Закрыть"
                className="border-line-strong text-ink flex h-9 w-9 flex-none items-center justify-center rounded-[--radius-btn] border text-lg leading-none"
              >
                ×
              </button>
            </div>

            {visible.length === 0 ? (
              <p className="text-ink-soft py-8 text-center text-[14px]">
                Ничего не найдено. Загрузите изображение в разделе «Фотографии».
              </p>
            ) : (
              <ul
                className="grid gap-3 overflow-y-auto"
                style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))' }}
              >
                {visible.map((asset) => (
                  <li key={asset.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(asset.id);
                        setOpen(false);
                      }}
                      aria-pressed={asset.id === value}
                      className={cn(
                        'group w-full overflow-hidden rounded-[--radius-card] border text-left',
                        asset.id === value ? 'border-accent' : 'border-line hover:border-accent',
                      )}
                    >
                      <span className="bg-slot relative block aspect-[4/3]">
                        {asset.isPlaceholder ? (
                          <span
                            className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold tracking-[0.14em] text-[oklch(0.32_0.14_350)] uppercase"
                            style={{
                              background:
                                'repeating-linear-gradient(45deg, oklch(0.86 0.09 350) 0 8px, oklch(0.93 0.05 350) 8px 16px)',
                            }}
                          >
                            Заглушка
                          </span>
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={asset.url}
                            alt=""
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                        )}
                      </span>
                      <span className="text-ink-muted block truncate px-2 py-1.5 text-[12px]">
                        {asset.alt || 'без описания'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
