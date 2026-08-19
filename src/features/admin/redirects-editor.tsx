'use client';

import { useState } from 'react';

import {
  createRedirect,
  deleteRedirect,
  setRedirectActive,
} from '@/app/(admin)/admin/_actions/redirects';
import { buttonClasses } from '@/components/ui/button';
import { InlineConfirm } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useAction } from './use-action';

export type RedirectRow = {
  id: string;
  fromPath: string;
  toPath: string;
  statusCode: number;
  isActive: boolean;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
  resolvesTo: string | null;
};

/** Only what this screen says better than the shared vocabulary. */
const ERRORS = {
  path_absolute: 'Путь должен начинаться со слэша: /staraya-stranica',
  path_external: 'Только адреса этого сайта, без домена и без «//».',
  path_characters: 'В пути есть недопустимые символы.',
  loop: 'Так получилось бы кольцо: конечный адрес ведёт обратно на исходный.',
  not_found: 'Правило не найдено — возможно, его уже удалили.',
};

const inputClass = cn(
  'border-line-strong bg-surface w-full rounded-[--radius-btn] border px-3 py-2 font-mono text-[13px]',
  'focus:border-accent outline-none transition-colors duration-[--duration-fast]',
);

export function RedirectsEditor({ rows }: { rows: RedirectRow[] }) {
  const [fromPath, setFromPath] = useState('');
  const [toPath, setToPath] = useState('');
  const [permanent, setPermanent] = useState(true);
  const [note, setNote] = useState('');
  const { isBusy, error, status, run } = useAction(ERRORS);

  return (
    <div className="flex flex-col gap-6">
      <form
        className="border-line bg-surface flex flex-col gap-4 rounded-[--radius-card] border p-4"
        onSubmit={(event) => {
          event.preventDefault();
          run(() => createRedirect({ fromPath, toPath, permanent, note }), {
            key: 'create',
            success: 'Правило добавлено.',
            onDone: () => {
              setFromPath('');
              setToPath('');
              setNote('');
            },
          });
        }}
      >
        <h2 className="font-display text-[19px]">Новое правило</h2>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label
              htmlFor="redirect-from"
              className="text-ink-muted mb-1 block text-[12px] font-medium"
            >
              Старый адрес
            </label>
            <input
              id="redirect-from"
              required
              value={fromPath}
              onChange={(event) => setFromPath(event.target.value)}
              placeholder="/kuhni-na-zakaz"
              className={inputClass}
            />
          </div>
          <div>
            <label
              htmlFor="redirect-to"
              className="text-ink-muted mb-1 block text-[12px] font-medium"
            >
              Куда вести
            </label>
            <input
              id="redirect-to"
              required
              value={toPath}
              onChange={(event) => setToPath(event.target.value)}
              placeholder="/korpusnaya-mebel"
              className={inputClass}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1">
            <label
              htmlFor="redirect-note"
              className="text-ink-muted mb-1 block text-[12px] font-medium"
            >
              Зачем это правило
            </label>
            <input
              id="redirect-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Адрес со старого сайта"
              className={cn(inputClass, 'font-body text-[14px]')}
            />
          </div>

          <label className="text-ink-muted flex items-center gap-2 pb-2.5 text-[13px]">
            <input
              type="checkbox"
              checked={permanent}
              onChange={(event) => setPermanent(event.target.checked)}
              className="accent-accent h-4 w-4"
            />
            Постоянное (301)
          </label>

          <button
            type="submit"
            disabled={isBusy('create')}
            className={buttonClasses('primary', 'sm')}
          >
            {isBusy('create') ? 'Сохраняем…' : 'Добавить'}
          </button>
        </div>

        <p className="text-ink-faint text-[12px] leading-snug">
          Постоянное правило говорит поисковым системам перенести позиции старого адреса на новый.
          Временное — если страница вернётся. Адреса испанской и английской версий начинаются с /es
          и /en.
        </p>

        {/* Both areas stay mounted: one inserted together with its text is not
            announced by a screen reader. */}
        <p role="alert" className="text-danger text-[13px] empty:hidden">
          {error}
        </p>
        <p role="status" className="text-ink-muted text-[13px] empty:hidden">
          {status}
        </p>
      </form>

      <section className="border-line bg-surface rounded-[--radius-card] border p-4">
        <h2 className="font-display mb-3 text-[19px]">Правила</h2>

        {rows.length === 0 ? (
          <p className="text-ink-faint text-[13px]">
            Пока пусто. Правила появляются здесь сами, когда вы меняете адрес страницы.
          </p>
        ) : (
          <ul className="divide-line divide-y">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-3">
                <div className="min-w-[280px] flex-1">
                  <div className="font-mono text-[13px]">
                    <span className={row.isActive ? 'text-ink' : 'text-ink-faint line-through'}>
                      {row.fromPath}
                    </span>
                    <span className="text-ink-faint mx-1.5">→</span>
                    <span className={row.isActive ? 'text-ink' : 'text-ink-faint'}>
                      {row.toPath}
                    </span>
                  </div>
                  {row.note ? (
                    <div className="text-ink-faint mt-0.5 text-[12px]">{row.note}</div>
                  ) : null}
                  {/* A rule can be correct on its own and still land somewhere else
                      once another rule chains onto its target. */}
                  {row.resolvesTo ? (
                    <div className="text-warning mt-0.5 text-[12px]">
                      Фактически ведёт на <span className="font-mono">{row.resolvesTo}</span> — есть
                      цепочка правил.
                    </div>
                  ) : null}
                </div>

                <span className="text-ink-faint text-[12px]">{row.statusCode}</span>

                {row.isActive ? null : (
                  <span className="rounded-[--radius-btn] bg-[oklch(0.94_0.01_85)] px-1.5 py-0.5 text-[11px] text-[oklch(0.45_0.01_85)]">
                    выключено
                  </span>
                )}

                <button
                  type="button"
                  disabled={isBusy(row.id)}
                  onClick={() =>
                    run(() => setRedirectActive(row.id, !row.isActive), {
                      key: row.id,
                      success: row.isActive ? 'Правило выключено.' : 'Правило включено.',
                    })
                  }
                  className={cn(buttonClasses('ghost', 'sm'), 'text-[12px]')}
                >
                  {row.isActive ? 'Выключить' : 'Включить'}
                </button>

                <InlineConfirm
                  label="Удалить"
                  question="Удалить правило?"
                  confirmLabel="Удалить"
                  disabled={isBusy(row.id)}
                  onConfirm={() =>
                    run(() => deleteRedirect(row.id), {
                      key: row.id,
                      success: 'Правило удалено.',
                    })
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
