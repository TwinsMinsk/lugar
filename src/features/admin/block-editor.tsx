'use client';

import { useState, useTransition } from 'react';

import {
  publishDocument,
  rollbackDocument,
  saveDraft,
  unpublishDocument,
} from '@/app/(admin)/admin/_actions/content';
import { buttonClasses } from '@/components/ui/button';
import { ConfirmButton, InlineConfirm } from '@/components/ui/dialog';
import { BLOCK_REGISTRY } from '@/content/blocks/registry';
import type { AnyBlock } from '@/content/blocks/union';
import { LOCALES, type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { collectLocalizedFields, setAtPath } from './localized-fields';

export type RevisionOption = {
  id: string;
  revisionNumber: number;
  isDraft: boolean;
  createdAt: string;
  authorName: string | null;
  liveFor: Locale[];
};

/**
 * Page block editor.
 *
 * Reordering is keyboard-first by requirement, and that shapes the design:
 * every block row carries Move up / Move down buttons and a "position N of M"
 * select, with each move announced through an aria-live region. Drag and drop
 * would be an enhancement layered on top — never the only way to reorder,
 * because that excludes keyboard and screen-reader users from the core task.
 *
 * Text fields are discovered from the data's shape rather than hand-written per
 * block type, so a new block becomes editable without touching this file.
 */
export function BlockEditor({
  documentId,
  initialBlocks,
  revisions,
  publishedLocales,
}: {
  documentId: string;
  initialBlocks: AnyBlock[];
  revisions: RevisionOption[];
  publishedLocales: Locale[];
}) {
  const [blocks, setBlocks] = useState<AnyBlock[]>(initialBlocks);
  const [locale, setLocale] = useState<Locale>('ru');
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [expanded, setExpanded] = useState<string | null>(initialBlocks[0]?.id ?? null);
  const [pending, startTransition] = useTransition();

  function update(next: AnyBlock[], message?: string) {
    setBlocks(next);
    setDirty(true);
    if (message) setAnnouncement(message);
  }

  function move(index: number, to: number) {
    if (to < 0 || to >= blocks.length) return;
    const next = [...blocks];
    const [item] = next.splice(index, 1);
    next.splice(to, 0, item!);
    const label = BLOCK_REGISTRY[item!.type].label.ru;
    update(next, `Блок «${label}» перемещён на позицию ${to + 1} из ${next.length}`);
  }

  function toggleHidden(index: number) {
    const next = [...blocks];
    const block = { ...next[index]!, hidden: !next[index]!.hidden };
    next[index] = block as AnyBlock;
    update(
      next,
      `Блок «${BLOCK_REGISTRY[block.type].label.ru}» ${block.hidden ? 'скрыт' : 'показан'}`,
    );
  }

  function editField(index: number, path: string, value: string) {
    const next = [...blocks];
    const block = next[index]!;
    const currentLeaf = (path
      .replace(/\[(\d+)\]/g, '.$1')
      .split('.')
      .filter(Boolean)
      .reduce<unknown>(
        (acc, key) =>
          acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined,
        block.data,
      ) ?? {}) as Partial<Record<Locale, string>>;

    const nextLeaf = { ...currentLeaf, [locale]: value };
    // An emptied non-source locale is removed entirely rather than stored as
    // "", so the fallback chain treats it as untranslated and shows Russian.
    if (locale !== 'ru' && value.trim() === '') delete nextLeaf[locale];

    next[index] = { ...block, data: setAtPath(block.data, path, nextLeaf) } as AnyBlock;
    update(next);
  }

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      setStatus(null);
      const result = await action();
      setStatus(result.ok ? success : `Ошибка: ${result.error ?? 'неизвестно'}`);
      if (result.ok) setDirty(false);
    });
  }

  const inputClass = cn(
    'border-line-strong bg-surface w-full rounded-[--radius-btn] border px-3 py-2 text-[14px]',
    'focus:border-accent outline-none transition-colors duration-[--duration-fast]',
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Locale switcher — which language's text the fields below edit. */}
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Язык редактирования" className="flex gap-1">
          {LOCALES.map((code) => (
            <button
              key={code}
              type="button"
              aria-pressed={locale === code}
              onClick={() => setLocale(code)}
              className={cn(
                'rounded-[--radius-btn] border px-3 py-1.5 text-[13px] uppercase',
                locale === code
                  ? 'bg-accent border-accent text-white'
                  : 'border-line-chip text-ink-filter hover:border-accent',
              )}
            >
              {code}
            </button>
          ))}
        </div>
        {locale !== 'ru' ? (
          <p className="text-ink-faint text-[12px]">
            Пустое поле означает «нет перевода» — на сайте покажется русский текст.
          </p>
        ) : null}
      </div>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <ol className="flex flex-col gap-3">
        {blocks.map((block, index) => {
          const definition = BLOCK_REGISTRY[block.type];
          const fields = collectLocalizedFields(block.data);
          const isOpen = expanded === block.id;

          return (
            <li
              key={block.id}
              className={cn(
                'border-line bg-surface rounded-[--radius-card] border',
                block.hidden && 'opacity-60',
              )}
            >
              <div className="flex flex-wrap items-center gap-2 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : block.id)}
                  aria-expanded={isOpen}
                  className="text-ink hover:text-accent flex-1 text-left text-[15px] font-medium"
                >
                  {definition.label.ru}
                  {block.hidden ? (
                    <span className="text-ink-faint ml-2 text-[12px]">скрыт</span>
                  ) : null}
                </button>

                <label className="text-ink-faint flex items-center gap-1.5 text-[12px]">
                  <span className="sr-only sm:not-sr-only">Позиция</span>
                  <select
                    value={index}
                    onChange={(event) => move(index, Number(event.target.value))}
                    aria-label={`Позиция блока «${definition.label.ru}»`}
                    className="border-line-strong rounded-[--radius-btn] border px-2 py-1 text-[13px]"
                  >
                    {blocks.map((_, position) => (
                      <option key={position} value={position}>
                        {position + 1} из {blocks.length}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  type="button"
                  onClick={() => move(index, index - 1)}
                  disabled={index === 0}
                  aria-label={`Переместить «${definition.label.ru}» вверх`}
                  className="border-line-strong text-ink rounded-[--radius-btn] border px-2 py-1 text-[13px] disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(index, index + 1)}
                  disabled={index === blocks.length - 1}
                  aria-label={`Переместить «${definition.label.ru}» вниз`}
                  className="border-line-strong text-ink rounded-[--radius-btn] border px-2 py-1 text-[13px] disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => toggleHidden(index)}
                  aria-pressed={block.hidden}
                  className="border-line-strong text-ink rounded-[--radius-btn] border px-2.5 py-1 text-[13px]"
                >
                  {block.hidden ? 'Показать' : 'Скрыть'}
                </button>
              </div>

              {isOpen ? (
                <div className="border-line flex flex-col gap-3 border-t px-4 py-4">
                  <p className="text-ink-faint text-[12px]">{definition.description.ru}</p>
                  {fields.length === 0 ? (
                    <p className="text-ink-soft text-[13px]">
                      В этом блоке нет редактируемого текста.
                    </p>
                  ) : (
                    fields.map((field) => (
                      <div key={field.path}>
                        <label
                          htmlFor={`${block.id}-${field.path}`}
                          className="text-ink-muted mb-1 block text-[12px] font-medium"
                        >
                          {field.label}
                        </label>
                        {field.multiline ? (
                          <textarea
                            id={`${block.id}-${field.path}`}
                            rows={3}
                            value={field.values[locale] ?? ''}
                            placeholder={locale === 'ru' ? '' : (field.values.ru ?? '')}
                            onChange={(event) => editField(index, field.path, event.target.value)}
                            className={cn(inputClass, 'resize-y')}
                          />
                        ) : (
                          <input
                            id={`${block.id}-${field.path}`}
                            value={field.values[locale] ?? ''}
                            placeholder={locale === 'ru' ? '' : (field.values.ru ?? '')}
                            onChange={(event) => editField(index, field.path, event.target.value)}
                            className={inputClass}
                          />
                        )}
                      </div>
                    ))
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      <div className="border-line bg-surface sticky bottom-0 flex flex-wrap items-center gap-3 rounded-[--radius-card] border p-4">
        <button
          type="button"
          disabled={pending || !dirty}
          onClick={() => run(() => saveDraft({ documentId, blocks }), 'Черновик сохранён')}
          className={buttonClasses('outline', 'sm')}
        >
          {pending ? 'Сохраняем…' : 'Сохранить черновик'}
        </button>

        {/* Publishing is the one button here whose effect is outside this
            screen, and it quietly saves the draft first — so the dialog says
            both things rather than letting the reader discover them. */}
        {LOCALES.map((code) => (
          <ConfirmButton
            key={code}
            label={`Опубликовать ${code.toUpperCase()}`}
            title={`Опубликовать ${code.toUpperCase()}?`}
            description={
              dirty
                ? `Черновик сначала сохранится, затем версию ${code.toUpperCase()} увидят посетители сайта.`
                : `Текущий черновик увидят посетители сайта в версии ${code.toUpperCase()}.`
            }
            confirmLabel="Опубликовать"
            variant="primary"
            tone="neutral"
            className="text-[13px]"
            disabled={pending}
            onConfirm={() =>
              run(async () => {
                const saved = await saveDraft({ documentId, blocks });
                if (!saved.ok) return saved;
                return publishDocument({ documentId, locales: [code] });
              }, `Опубликовано (${code.toUpperCase()})`)
            }
          />
        ))}

        {/* The missing verb: a page could be published and never taken down. */}
        {publishedLocales.map((code) => (
          <InlineConfirm
            key={`unpublish-${code}`}
            label={`Снять с сайта ${code.toUpperCase()}`}
            question={`Снять ${code.toUpperCase()} с сайта?`}
            confirmLabel="Снять"
            disabled={pending}
            onConfirm={() =>
              run(
                () => unpublishDocument({ documentId, locales: [code] }),
                `Снято с сайта (${code.toUpperCase()})`,
              )
            }
          />
        ))}

        {dirty ? (
          <span className="text-[13px] text-[oklch(0.5_0.12_85)]">Есть несохранённые правки</span>
        ) : null}
        {status ? (
          <span role="status" className="text-ink-muted text-[13px]">
            {status}
          </span>
        ) : null}
      </div>

      <RevisionHistory
        documentId={documentId}
        revisions={revisions}
        publishedLocales={publishedLocales}
        pending={pending}
        onRun={run}
      />
    </div>
  );
}

function RevisionHistory({
  documentId,
  revisions,
  publishedLocales,
  pending,
  onRun,
}: {
  documentId: string;
  revisions: RevisionOption[];
  publishedLocales: Locale[];
  pending: boolean;
  onRun: (action: () => Promise<{ ok: boolean; error?: string }>, success: string) => void;
}) {
  const restorable = revisions.filter((revision) => !revision.isDraft);
  if (restorable.length === 0) return null;

  return (
    <section className="border-line bg-surface rounded-[--radius-card] border p-4">
      <h2 className="font-display mb-3 text-[18px]">История версий</h2>
      <ul className="divide-line divide-y">
        {restorable.map((revision) => (
          <li key={revision.id} className="flex flex-wrap items-center gap-3 py-2.5">
            <span className="text-ink text-[14px]">Версия {revision.revisionNumber}</span>
            <span className="text-ink-faint text-[12px]">
              {new Date(revision.createdAt).toLocaleString('ru-RU', {
                timeZone: 'Europe/Madrid',
                dateStyle: 'short',
                timeStyle: 'short',
              })}
              {revision.authorName ? ` · ${revision.authorName}` : ''}
            </span>
            {revision.liveFor.length > 0 ? (
              <span className="rounded-[--radius-btn] bg-[oklch(0.94_0.05_150)] px-2 py-0.5 text-[11px] text-[oklch(0.38_0.08_150)] uppercase">
                сейчас на сайте: {revision.liveFor.join(', ')}
              </span>
            ) : null}
            <div className="ml-auto flex gap-1.5">
              {(publishedLocales.length > 0 ? publishedLocales : LOCALES).map((code) => (
                <ConfirmButton
                  key={code}
                  label={`↩ ${code}`}
                  title={`Вернуть версию ${revision.revisionNumber}?`}
                  description={`Версия ${revision.revisionNumber} снова станет тем, что показывается в ${code.toUpperCase()}. Текущий черновик при этом заменяется её содержимым.`}
                  confirmLabel="Вернуть версию"
                  tone="neutral"
                  disabled={pending || revision.liveFor.includes(code)}
                  className="uppercase"
                  onConfirm={() =>
                    onRun(
                      () =>
                        rollbackDocument({
                          documentId,
                          revisionId: revision.id,
                          locales: [code],
                        }),
                      `Версия ${revision.revisionNumber} восстановлена (${code.toUpperCase()})`,
                    )
                  }
                />
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
