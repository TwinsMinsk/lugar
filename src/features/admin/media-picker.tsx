'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { uploadMedia } from '@/app/(admin)/admin/_actions/media';
import { buttonClasses } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { messagesFor } from './messages';

const message = messagesFor({
  no_file: 'Выберите файл на компьютере.',
});

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
 *
 * The library is not the only way in: a picture can be uploaded straight from
 * the computer here and is chosen the moment it lands. Sending the owner to the
 * media screen and back to fill one slot is the kind of detour that gets a slot
 * left empty instead.
 */
/**
 * Upload from the computer, without leaving the slot being filled.
 *
 * Description is asked for here rather than "later": the upload is rejected
 * without it, and a library where alt text is optional ends up with none.
 */
function InlineUpload({ onUploaded }: { onUploaded: (assetId: string, file: File) => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pendingUpload, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      ref={formRef}
      className="border-line bg-surface mb-4 flex flex-wrap items-end gap-3 rounded-[--radius-card] border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const formData = new FormData(form);
        const file = formData.get('file');
        startTransition(async () => {
          setError(null);
          const result = await uploadMedia(formData);
          if (result.ok && result.assetId) {
            form.reset();
            onUploaded(result.assetId, file instanceof File ? file : new File([], ''));
          } else {
            setError(message(result.ok ? 'unexpected' : result.error));
          }
        });
      }}
    >
      <div className="flex-1 basis-[200px]">
        <label htmlFor="picker-file" className="text-ink-muted mb-1 block text-[12px] font-medium">
          Загрузить с компьютера
        </label>
        <input
          id="picker-file"
          name="file"
          type="file"
          required
          accept="image/jpeg,image/png,image/webp,image/avif,image/tiff"
          className="text-[13px]"
        />
      </div>

      <div className="flex-1 basis-[220px]">
        <label htmlFor="picker-alt" className="text-ink-muted mb-1 block text-[12px] font-medium">
          Описание (alt, по-русски)
        </label>
        <input
          id="picker-alt"
          name="altRu"
          required
          placeholder="Логотип EGGER"
          className="border-line-strong bg-surface focus:border-accent w-full rounded-[--radius-btn] border px-3 py-2 text-[14px] outline-none"
        />
      </div>

      <button type="submit" disabled={pendingUpload} className={buttonClasses('primary', 'sm')}>
        {pendingUpload ? 'Загружаем…' : 'Загрузить и выбрать'}
      </button>

      <p role="alert" className="text-danger basis-full text-[12px] empty:hidden">
        {error}
      </p>
    </form>
  );
}

export function MediaPicker({
  assets,
  value,
  onChange,
  label = 'Изображение',
  clearable = true,
}: {
  assets: PickableAsset[];
  value: string | null;
  onChange: (assetId: string | null) => void;
  label?: string;
  /** Some slots are required by their schema — emptying those cannot be saved. */
  clearable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  /**
   * A picture uploaded from this control, held until the server props catch up.
   *
   * `router.refresh()` is what puts the new asset into `assets`, and that is a
   * round trip. Without this the thumbnail would read "не выбрано" for a moment
   * right after a successful upload — the one moment the owner is watching it.
   */
  const [pending, setPending] = useState<PickableAsset | null>(null);

  useEffect(() => {
    // The preview is an object URL; letting it leak would hold the file open.
    return () => {
      if (pending) URL.revokeObjectURL(pending.url);
    };
  }, [pending]);

  const selected =
    assets.find((asset) => asset.id === value) ?? (pending?.id === value ? pending : null);

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
        {selected && clearable ? (
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

            <InlineUpload
              onUploaded={(assetId, file) => {
                // Selected immediately, with a local preview standing in until
                // the refreshed server props carry the real one.
                setPending({
                  id: assetId,
                  url: URL.createObjectURL(file),
                  alt: '',
                  isPlaceholder: false,
                  width: 0,
                  height: 0,
                });
                onChange(assetId);
                router.refresh();
                setOpen(false);
              }}
            />

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
