'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import {
  archiveStage,
  createStage,
  moveStage,
  restoreStage,
  setDefaultEntry,
  updateStage,
} from '@/app/(admin)/admin/_actions/pipeline';
import { buttonClasses } from '@/components/ui/button';
import type { PipelineStage } from '@/data/admin/lead-statuses';
import { cn } from '@/lib/utils';

export type ArchivedStage = { id: string; label: Record<string, string>; leadCount: number };

const ERRORS: Record<string, string> = {
  is_entry: 'Это этап, на который попадают новые заявки. Сначала назначьте другой.',
  last_stage: 'Последний этап убрать нельзя — заявкам будет негде находиться.',
  needs_target: 'На этом этапе есть заявки. Выберите, куда их перенести.',
  unknown_target: 'Этап, куда переносить, не найден.',
  won_and_lost: 'Этап не может быть одновременно выигранным и проигранным.',
  not_found: 'Этап не найден — возможно, его уже убрали.',
  archived: 'Этап убран из воронки. Сначала верните его.',
  invalid_input: 'Проверьте заполненные поля.',
};

const inputClass = cn(
  'border-line-strong bg-surface w-full rounded-[--radius-btn] border px-3 py-2 text-[14px]',
  'focus:border-accent outline-none transition-colors duration-[--duration-fast]',
);

export function PipelineEditor({
  stages,
  archived,
}: {
  stages: PipelineStage[];
  archived: ArchivedStage[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string }>, onDone?: () => void) {
    startTransition(async () => {
      setError(null);
      const result = await action();
      if (!result.ok) {
        setError(ERRORS[result.error ?? ''] ?? result.error ?? 'Ошибка');
        return;
      }
      onDone?.();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Reordering is invisible to a screen reader without this. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {error ? (
        <p role="alert" className="text-[13px] text-[oklch(0.52_0.17_25)]">
          {error}
        </p>
      ) : null}

      {/* Both lists carry names: without them a screen reader announces two
          unlabelled lists, and any query for "the last item" spans both. */}
      <ul
        aria-label="Этапы воронки"
        className="border-line divide-line bg-surface divide-y rounded-[--radius-card] border"
      >
        {stages.map((stage, index) => (
          <li key={stage.id} className="p-4">
            {editingId === stage.id ? (
              <StageForm
                initial={stage}
                pending={pending}
                submitLabel="Сохранить"
                onCancel={() => setEditingId(null)}
                onSubmit={(values) =>
                  run(
                    () => updateStage({ id: stage.id, ...values }),
                    () => setEditingId(null),
                  )
                }
              />
            ) : (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span
                  aria-hidden
                  className="inline-block h-3 w-3 flex-none rounded-full"
                  style={{ backgroundColor: stage.color }}
                />

                <div className="min-w-[200px] flex-1">
                  <div className="text-ink text-[15px]">
                    {stage.label.ru ?? stage.slug}
                    {stage.isDefaultEntry ? (
                      <span className="text-accent ml-2 text-[11px]">точка входа</span>
                    ) : null}
                    {stage.isWon ? (
                      <span className="ml-2 text-[11px] text-[oklch(0.45_0.10_150)]">выиграна</span>
                    ) : null}
                    {stage.isLost ? (
                      <span className="text-ink-faint ml-2 text-[11px]">проиграна</span>
                    ) : null}
                  </div>
                  <div className="text-ink-faint text-[12px]">
                    {stage.label.es ?? '—'} · {stage.label.en ?? '—'} · заявок {stage.leadCount}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={pending || index === 0}
                    aria-label={`Поднять этап «${stage.label.ru}»`}
                    onClick={() =>
                      run(
                        () => moveStage(stage.id, 'up'),
                        () => setAnnouncement(`${stage.label.ru}: позиция ${index}`),
                      )
                    }
                    className={cn(buttonClasses('ghost', 'sm'), 'text-[13px] disabled:opacity-40')}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={pending || index === stages.length - 1}
                    aria-label={`Опустить этап «${stage.label.ru}»`}
                    onClick={() =>
                      run(
                        () => moveStage(stage.id, 'down'),
                        () => setAnnouncement(`${stage.label.ru}: позиция ${index + 2}`),
                      )
                    }
                    className={cn(buttonClasses('ghost', 'sm'), 'text-[13px] disabled:opacity-40')}
                  >
                    ↓
                  </button>
                </div>

                {!stage.isDefaultEntry ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => setDefaultEntry(stage.id))}
                    className={cn(buttonClasses('ghost', 'sm'), 'text-[12px]')}
                  >
                    Сделать точкой входа
                  </button>
                ) : null}

                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setEditingId(stage.id);
                    setAdding(false);
                  }}
                  className={cn(buttonClasses('ghost', 'sm'), 'text-[12px]')}
                >
                  Изменить
                </button>

                <ArchiveControl
                  stage={stage}
                  others={stages.filter((other) => other.id !== stage.id)}
                  pending={pending}
                  onArchive={(moveTo) => run(() => archiveStage({ id: stage.id, moveTo }))}
                />
              </div>
            )}
          </li>
        ))}
      </ul>

      {adding ? (
        <div className="border-line bg-surface rounded-[--radius-card] border border-dashed p-4">
          <StageForm
            pending={pending}
            submitLabel="Добавить этап"
            onCancel={() => setAdding(false)}
            onSubmit={(values) =>
              run(
                () => createStage({ label: values.label, color: values.color }),
                () => setAdding(false),
              )
            }
          />
        </div>
      ) : (
        <div>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setAdding(true);
              setEditingId(null);
            }}
            className={buttonClasses('outline', 'sm')}
          >
            Добавить этап
          </button>
        </div>
      )}

      {archived.length > 0 ? (
        <section>
          <h2 className="font-display mb-2 text-[19px]">Убранные этапы</h2>
          <p className="text-ink-faint mb-3 text-[13px]">
            Этапы не удаляются: на них ссылается история закрытых сделок. Убранный этап можно
            вернуть — он встанет в конец воронки.
          </p>
          <ul
            aria-label="Убранные этапы"
            className="border-line divide-line bg-surface divide-y rounded-[--radius-card] border"
          >
            {archived.map((stage) => (
              <li key={stage.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="text-ink-soft flex-1 text-[14px]">
                  {stage.label.ru ?? '(без названия)'}
                </span>
                <span className="text-ink-faint text-[12px]">
                  в истории заявок: {stage.leadCount}
                </span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => restoreStage(stage.id))}
                  className={cn(buttonClasses('ghost', 'sm'), 'text-[12px]')}
                >
                  Вернуть
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/**
 * Archiving, with the leads accounted for.
 *
 * When the stage still holds leads the control turns into a choice of where
 * they go. Offering a bare "delete" and deciding their destination silently is
 * how a month of someone's work ends up back in the new-enquiries column.
 */
function ArchiveControl({
  stage,
  others,
  pending,
  onArchive,
}: {
  stage: PipelineStage;
  others: PipelineStage[];
  pending: boolean;
  onArchive: (moveTo?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(others[0]?.id ?? '');

  if (stage.isDefaultEntry) {
    return <span className="text-ink-faint text-[12px]">точка входа — убрать нельзя</span>;
  }

  if (!open) {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => (stage.leadCount === 0 ? onArchive() : setOpen(true))}
        className={cn(buttonClasses('ghost', 'sm'), 'text-[12px]')}
      >
        Убрать
      </button>
    );
  }

  return (
    <div className="border-line flex w-full flex-wrap items-end gap-2 rounded-[--radius-btn] border border-dashed p-2">
      <div className="min-w-[220px] flex-1">
        <label htmlFor={`move-${stage.id}`} className="text-ink-muted mb-1 block text-[12px]">
          Перенести {stage.leadCount} заявку(и) на этап
        </label>
        <select
          id={`move-${stage.id}`}
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          className={inputClass}
        >
          {others.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label.ru ?? option.slug}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        disabled={pending || target === ''}
        onClick={() => onArchive(target)}
        className={buttonClasses('primary', 'sm')}
      >
        Перенести и убрать
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className={cn(buttonClasses('ghost', 'sm'), 'text-[12px]')}
      >
        Отмена
      </button>
    </div>
  );
}

type StageValues = {
  label: { ru: string; es?: string; en?: string };
  color: string;
  isWon: boolean;
  isLost: boolean;
};

function StageForm({
  initial,
  pending,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: PipelineStage;
  pending: boolean;
  submitLabel: string;
  onSubmit: (values: StageValues) => void;
  onCancel: () => void;
}) {
  const [ru, setRu] = useState(initial?.label.ru ?? '');
  const [es, setEs] = useState(initial?.label.es ?? '');
  const [en, setEn] = useState(initial?.label.en ?? '');
  const [color, setColor] = useState(initial?.color ?? '#8a8a8a');
  const [outcome, setOutcome] = useState<'open' | 'won' | 'lost'>(
    initial?.isWon ? 'won' : initial?.isLost ? 'lost' : 'open',
  );

  const id = initial?.id ?? 'new';

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          label: { ru, es: es || undefined, en: en || undefined },
          color,
          isWon: outcome === 'won',
          isLost: outcome === 'lost',
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor={`ru-${id}`} className="text-ink-muted mb-1 block text-[12px]">
            Название (ru)
          </label>
          <input
            id={`ru-${id}`}
            required
            value={ru}
            onChange={(event) => setRu(event.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor={`es-${id}`} className="text-ink-muted mb-1 block text-[12px]">
            Название (es)
          </label>
          <input
            id={`es-${id}`}
            value={es}
            onChange={(event) => setEs(event.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor={`en-${id}`} className="text-ink-muted mb-1 block text-[12px]">
            Название (en)
          </label>
          <input
            id={`en-${id}`}
            value={en}
            onChange={(event) => setEn(event.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor={`color-${id}`} className="text-ink-muted mb-1 block text-[12px]">
            Цвет
          </label>
          <input
            id={`color-${id}`}
            type="color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
            className="border-line-strong h-10 w-16 rounded-[--radius-btn] border"
          />
        </div>

        <fieldset>
          {/*
            One choice, not two checkboxes. Won and lost are mutually exclusive
            and "terminal" follows from them — asking for all three separately
            invites a stage that is closed and open at once.
          */}
          <legend className="text-ink-muted mb-1 text-[12px]">Чем заканчивается</legend>
          <div className="flex flex-wrap gap-3 text-[13px]">
            {(
              [
                ['open', 'Работа продолжается'],
                ['won', 'Сделка выиграна'],
                ['lost', 'Сделка проиграна'],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name={`outcome-${id}`}
                  value={value}
                  checked={outcome === value}
                  onChange={() => setOutcome(value)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending || ru.trim() === ''}
          className={buttonClasses('primary', 'sm')}
        >
          {pending ? 'Сохраняем…' : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={cn(buttonClasses('ghost', 'sm'), 'text-[13px]')}
        >
          Отмена
        </button>
      </div>
    </form>
  );
}
