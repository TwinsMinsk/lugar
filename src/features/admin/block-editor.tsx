'use client';

import { useState } from 'react';

import {
  publishDocument,
  rollbackDocument,
  saveDraft,
  unpublishDocument,
} from '@/app/(admin)/admin/_actions/content';
import { buttonClasses } from '@/components/ui/button';
import { ConfirmButton, InlineConfirm, Modal } from '@/components/ui/dialog';
import { blockNeedsMedia, createBlock } from '@/content/blocks/defaults';
import { BLOCK_REGISTRY, blocksAllowedOn } from '@/content/blocks/registry';
import type { AnyBlock, BlockType, TemplateId } from '@/content/blocks/union';
import { LOCALES, type Locale } from '@/i18n/routing';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { collectLocalizedFields, setAtPath } from './localized-fields';
import { collectMediaSlots } from './media-fields';
import { MediaPicker, type PickableAsset } from './media-picker';
import { useAction } from './use-action';

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
  assets,
  template,
  isSystem,
}: {
  documentId: string;
  initialBlocks: AnyBlock[];
  revisions: RevisionOption[];
  publishedLocales: Locale[];
  assets: PickableAsset[];
  /** Decides which block types this page may hold — see `blocksAllowedOn`. */
  template: TemplateId;
  /**
   * A page the site itself depends on. Its structural blocks stay: removing the
   * contact block from the contacts page leaves a page that exists, is linked
   * from the menu, and answers nothing.
   */
  isSystem: boolean;
}) {
  const [blocks, setBlocks] = useState<AnyBlock[]>(initialBlocks);
  const [locale, setLocale] = useState<Locale>('ru');
  const [dirty, setDirty] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [expanded, setExpanded] = useState<string | null>(initialBlocks[0]?.id ?? null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { busy: pending, isBusy, error, status, run } = useAction();

  /**
   * What may be added here, and how many are already in place.
   *
   * `blocksAllowedOn` and `maxPerPage` have been declared in the registry from
   * the start and read by nothing — this is the palette they were written for.
   * The two types that cannot exist without a picture are offered only when the
   * library has one, because inserting them empty produces a block that fails
   * validation, and `saveDraft` refuses the whole page when one block does.
   */
  const firstAssetId = assets[0]?.id ?? null;
  const counts = blocks.reduce<Partial<Record<BlockType, number>>>((acc, item) => {
    acc[item.type] = (acc[item.type] ?? 0) + 1;
    return acc;
  }, {});

  const palette = blocksAllowedOn(template).map((definition) => {
    const used = counts[definition.type] ?? 0;
    const atLimit = definition.maxPerPage !== undefined && used >= definition.maxPerPage;
    const needsPicture = blockNeedsMedia(definition.type) && !firstAssetId;
    return {
      definition,
      disabled: atLimit || needsPicture,
      reason: atLimit
        ? `Уже есть на странице (максимум ${definition.maxPerPage})`
        : needsPicture
          ? 'Нужна хотя бы одна фотография в библиотеке'
          : null,
    };
  });

  function addBlock(type: BlockType) {
    const block = createBlock(type, firstAssetId);
    const next = [...blocks, block];
    setPaletteOpen(false);
    setExpanded(block.id);
    update(next, `Блок «${BLOCK_REGISTRY[type].label.ru}» добавлен в конец страницы`);
  }

  function removeBlock(index: number) {
    const [removed] = blocks.slice(index, index + 1);
    const next = blocks.filter((_, position) => position !== index);
    update(next, `Блок «${BLOCK_REGISTRY[removed!.type].label.ru}» убран со страницы`);
  }

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

  function editMedia(index: number, path: string, assetId: string | null) {
    const next = [...blocks];
    const block = next[index]!;
    // Only the reference is replaced. Any per-block crop or alt override on the
    // slot belongs to the old picture, so it goes with it.
    const value = assetId ? { assetId } : undefined;
    next[index] = { ...block, data: setAtPath(block.data, path, value) } as AnyBlock;
    update(next, assetId ? 'Изображение выбрано' : 'Изображение убрано');
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

      {/* Named so the list is addressable: a bare listitem locator also
          matches the palette and the revision rows. */}
      <ol aria-label="Блоки страницы" className="flex flex-col gap-3">
        {blocks.map((block, index) => {
          const definition = BLOCK_REGISTRY[block.type];
          const fields = collectLocalizedFields(block.data);
          const mediaSlots = collectMediaSlots(definition.schema, block.data);
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

                {/* «Скрыть» is the reversible half and stays for everything.
                    Removal is offered for anything the owner added — and for a
                    structural block on a system page it is not offered at all,
                    because a contacts page without its contact block is a page
                    the menu still links to and that answers nothing. Nothing is
                    lost either way until the draft is saved. */}
                {definition.structural && isSystem ? (
                  <span className="text-ink-faint text-[12px]">часть страницы</span>
                ) : (
                  <InlineConfirm
                    label="Убрать блок"
                    question={`Убрать блок «${definition.label.ru}»?`}
                    confirmLabel="Убрать блок"
                    onConfirm={() => removeBlock(index)}
                  />
                )}
              </div>

              {isOpen ? (
                <div className="border-line flex flex-col gap-3 border-t px-4 py-4">
                  <p className="text-ink-faint text-[12px]">{definition.description.ru}</p>
                  {fields.length === 0 && mediaSlots.length === 0 ? (
                    <p className="text-ink-soft text-[13px]">
                      В этом блоке нет редактируемых полей.
                    </p>
                  ) : (
                    <>
                      {fields.map((field) => (
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
                      ))}

                      {mediaSlots.map((slot) => (
                        <MediaPicker
                          key={slot.path}
                          assets={assets}
                          value={slot.assetId}
                          label={slot.label}
                          clearable={slot.optional}
                          onChange={(assetId) => editMedia(index, slot.path, assetId)}
                        />
                      ))}
                    </>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      <div>
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className={buttonClasses('outline', 'sm')}
        >
          Добавить блок
        </button>
        <p className="text-ink-faint mt-1.5 text-[12px]">
          Новый блок появится в конце страницы — переставить его можно кнопками выше.
        </p>
      </div>

      {paletteOpen ? (
        <Modal
          label="Добавить блок"
          onClose={() => setPaletteOpen(false)}
          className="max-w-[560px]"
        >
          <div className="flex flex-col gap-3 p-5">
            <h2 className="font-display text-[19px]">Добавить блок</h2>
            <p className="text-ink-soft text-[13px]">
              Показаны только те блоки, которые подходят этой странице.
            </p>

            <ul className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
              {palette.map(({ definition, disabled, reason }) => (
                <li key={definition.type}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => addBlock(definition.type)}
                    className={cn(
                      'border-line hover:border-accent w-full rounded-[--radius-btn] border px-3 py-2.5 text-left',
                      'disabled:hover:border-line disabled:opacity-50',
                    )}
                  >
                    <span className="text-ink block text-[14px] font-medium">
                      {definition.label.ru}
                    </span>
                    <span className="text-ink-faint block text-[12px]">
                      {reason ?? definition.description.ru}
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setPaletteOpen(false)}
                className={buttonClasses('ghost', 'sm')}
              >
                Отмена
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      <div className="border-line bg-surface sticky bottom-0 flex flex-wrap items-center gap-3 rounded-[--radius-card] border p-4">
        <button
          type="button"
          disabled={pending || !dirty}
          onClick={() =>
            run(() => saveDraft({ documentId, blocks }), {
              key: 'save',
              success: 'Черновик сохранён',
              onDone: () => setDirty(false),
            })
          }
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
            disabled={isBusy(`publish-${code}`)}
            onConfirm={() =>
              run(
                async () => {
                  const saved = await saveDraft({ documentId, blocks });
                  if (!saved.ok) return saved;
                  return publishDocument({ documentId, locales: [code] });
                },
                {
                  key: `publish-${code}`,
                  success: `Опубликовано (${code.toUpperCase()})`,
                  onDone: () => setDirty(false),
                },
              )
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
            disabled={isBusy(`unpublish-${code}`)}
            onConfirm={() =>
              run(() => unpublishDocument({ documentId, locales: [code] }), {
                key: `unpublish-${code}`,
                success: `Снято с сайта (${code.toUpperCase()})`,
              })
            }
          />
        ))}

        {dirty ? <span className="text-warning text-[13px]">Есть несохранённые правки</span> : null}
        {/* Both areas stay mounted: one inserted together with its text is not
            announced by a screen reader. Publishing is also the slowest action
            here, so it is the one that most needs to say it is working. */}
        <span role="status" className="text-ink-muted text-[13px] empty:hidden">
          {pending ? 'Сохраняем…' : status}
        </span>
        <span role="alert" className="text-danger text-[13px] empty:hidden">
          {error}
        </span>
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
  onRun: (
    action: () => Promise<{ ok: boolean; error?: string }>,
    options: { key?: string; success?: string },
  ) => void;
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
              {formatDateTime(revision.createdAt)}
              {revision.authorName ? ` · ${revision.authorName}` : ''}
            </span>
            {revision.liveFor.length > 0 ? (
              <span className="bg-success-surface text-success-ink rounded-[--radius-btn] px-2 py-0.5 text-[11px] uppercase">
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
                      {
                        key: `${revision.id}-${code}`,
                        success: `Версия ${revision.revisionNumber} восстановлена (${code.toUpperCase()})`,
                      },
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
