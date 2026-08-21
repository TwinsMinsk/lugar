'use client';

import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

const ACCEPT = 'image/jpeg,image/png,image/webp,image/avif,image/tiff';

/**
 * The control that takes a picture off the computer.
 *
 * A bare `<input type="file">` renders as the browser's own "Выберите файл ·
 * Файл не выбран", which does not read as somewhere to put a picture — it reads
 * as a label nobody wrote. So the input stays (it is the accessible thing, and
 * the one the form submits) but is wrapped in a target big enough to look like
 * one, which also accepts a drag.
 *
 * `sr-only` rather than `hidden`: the input keeps its place in the tab order and
 * still announces itself, and `focus-within` is what draws the ring the sighted
 * keyboard user needs to see. A `hidden` input would drop out of the tab order
 * and make this reachable by mouse only.
 */
export function FileDropField({
  name = 'file',
  label,
  id,
  required = true,
}: {
  name?: string;
  label: string;
  id: string;
  required?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState<{ name: string; preview: string } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    return () => {
      if (chosen) URL.revokeObjectURL(chosen.preview);
    };
  }, [chosen]);

  // The form clears itself after a successful upload; the preview has to go
  // with it, or the zone keeps showing a picture that has already been sent.
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const onReset = () => setChosen(null);
    form.addEventListener('reset', onReset);
    return () => form.removeEventListener('reset', onReset);
  }, []);

  function take(file: File | undefined) {
    if (!file) return;
    setChosen({ name: file.name, preview: URL.createObjectURL(file) });
  }

  return (
    <div>
      <span className="text-ink-muted mb-1 block text-[12px] font-medium">{label}</span>

      <label
        htmlFor={id}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files?.[0];
          if (!file || !inputRef.current) return;
          // Assigning the transfer's list is what makes the dropped file part
          // of the form; without it the drop is only a preview.
          inputRef.current.files = event.dataTransfer.files;
          take(file);
        }}
        className={cn(
          'flex cursor-pointer items-center gap-3 rounded-[--radius-card] border border-dashed px-3 py-2.5',
          'transition-colors duration-[--duration-fast]',
          'focus-within:border-accent focus-within:ring-accent/30 focus-within:ring-2',
          dragging
            ? 'border-accent bg-accent/5'
            : 'border-line-strong bg-surface hover:border-accent',
        )}
      >
        <span className="bg-slot border-line relative flex h-11 w-11 flex-none items-center justify-center overflow-hidden rounded-[--radius-btn] border">
          {chosen ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={chosen.preview} alt="" className="h-full w-full object-cover" />
          ) : (
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="text-ink-ghost h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            >
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <circle cx="8.5" cy="9.5" r="1.6" />
              <path d="M21 15.5 16 11l-6.5 6.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>

        <span className="min-w-0">
          <span className="text-ink block truncate text-[13px] font-medium">
            {chosen ? chosen.name : 'Выбрать файл на компьютере'}
          </span>
          <span className="text-ink-faint block text-[11px]">
            {chosen ? 'Нажмите, чтобы заменить' : 'или перетащите сюда · JPEG, PNG, WebP, AVIF'}
          </span>
        </span>

        <input
          ref={inputRef}
          id={id}
          name={name}
          type="file"
          required={required}
          accept={ACCEPT}
          className="sr-only"
          onChange={(event) => take(event.target.files?.[0])}
        />
      </label>
    </div>
  );
}
