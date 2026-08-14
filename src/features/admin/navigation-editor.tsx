'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import {
  createNavigationItem,
  deleteNavigationItem,
  moveNavigationItem,
  nudgeNavigationItem,
  updateNavigationItem,
} from '@/app/(admin)/admin/_actions/navigation';
import { buttonClasses } from '@/components/ui/button';
import { LOCALES, type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

export type NavTarget = { id: string; label: string; path: string; published: boolean };

export type NavItem = {
  id: string;
  label: Partial<Record<Locale, string>>;
  documentId: string | null;
  externalUrl: string | null;
  anchor: string | null;
  isVisible: boolean;
  targetPath: string | null;
  hiddenIn: Locale[];
};

export type MenuKey = 'header' | 'footer_primary' | 'footer_legal';

const MENU_LABEL: Record<MenuKey, string> = {
  header: 'Верхнее меню',
  footer_primary: 'Футер — разделы',
  footer_legal: 'Футер — юридические',
};

const MENU_HELP: Record<MenuKey, string> = {
  header: 'Показывается в шапке на всех страницах и в мобильном меню.',
  footer_primary: 'Основные ссылки в подвале.',
  footer_legal: 'Политика конфиденциальности, cookie, правовая информация.',
};

const ERRORS: Record<string, string> = {
  ru_required: 'Русское название обязательно — оно используется как запасное.',
  http_only: 'Ссылка должна начинаться с http:// или https://',
  anchor_format: 'Якорь выглядит так: #kontakty',
  not_found: 'Пункт не найден — возможно, его уже удалили.',
  invalid_input: 'Проверьте заполненные поля.',
};

type TargetKind = 'document' | 'external' | 'anchor';

const inputClass = cn(
  'border-line-strong bg-surface w-full rounded-[--radius-btn] border px-3 py-2 text-[14px]',
  'focus:border-accent outline-none transition-colors duration-[--duration-fast]',
);

function targetOf(item: NavItem): { kind: TargetKind; value: string } {
  if (item.externalUrl) return { kind: 'external', value: item.externalUrl };
  if (item.anchor) return { kind: 'anchor', value: item.anchor };
  return { kind: 'document', value: item.documentId ?? '' };
}

function buildTarget(kind: TargetKind, value: string) {
  if (kind === 'external') return { kind: 'external' as const, externalUrl: value };
  if (kind === 'anchor') return { kind: 'anchor' as const, anchor: value };
  return { kind: 'document' as const, documentId: value };
}

export function NavigationEditor({
  menus,
  targets,
}: {
  menus: Record<MenuKey, NavItem[]>;
  targets: NavTarget[];
}) {
  // One announcement region for the whole screen: reordering is the operation
  // whose result is invisible to a screen reader otherwise.
  const [announcement, setAnnouncement] = useState('');

  return (
    <div className="flex flex-col gap-8">
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {(Object.keys(MENU_LABEL) as MenuKey[]).map((menu) => (
        <MenuSection
          key={menu}
          menu={menu}
          items={menus[menu] ?? []}
          targets={targets}
          announce={setAnnouncement}
        />
      ))}
    </div>
  );
}

function MenuSection({
  menu,
  items,
  targets,
  announce,
}: {
  menu: MenuKey;
  items: NavItem[];
  targets: NavTarget[];
  announce: (message: string) => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
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
    <section className="border-line bg-surface rounded-[--radius-card] border p-4">
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h2 className="font-display text-[19px]">{MENU_LABEL[menu]}</h2>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setAdding((value) => !value);
            setEditingId(null);
          }}
          className={cn(buttonClasses('ghost', 'sm'), 'ml-auto text-[13px]')}
        >
          {adding ? 'Отмена' : 'Добавить пункт'}
        </button>
      </div>
      <p className="text-ink-faint mb-3 text-[12px]">{MENU_HELP[menu]}</p>

      {error ? (
        <p role="alert" className="mb-3 text-[13px] text-[oklch(0.52_0.17_25)]">
          {error}
        </p>
      ) : null}

      {adding ? (
        <ItemForm
          targets={targets}
          pending={pending}
          submitLabel="Добавить"
          onCancel={() => setAdding(false)}
          onSubmit={(label, kind, value) =>
            run(
              () => createNavigationItem({ menu, label, target: buildTarget(kind, value) }),
              () => setAdding(false),
            )
          }
        />
      ) : null}

      {items.length === 0 ? (
        <p className="text-ink-faint text-[13px]">Пунктов пока нет.</p>
      ) : (
        <ul className="divide-line divide-y">
          {items.map((item, index) => (
            <li key={item.id} className="py-3">
              {editingId === item.id ? (
                <ItemForm
                  targets={targets}
                  pending={pending}
                  submitLabel="Сохранить"
                  initial={item}
                  onCancel={() => setEditingId(null)}
                  onSubmit={(label, kind, value) =>
                    run(
                      () =>
                        updateNavigationItem({
                          id: item.id,
                          label,
                          target: buildTarget(kind, value),
                          isVisible: item.isVisible,
                        }),
                      () => setEditingId(null),
                    )
                  }
                />
              ) : (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <div className="min-w-[220px] flex-1">
                    <div
                      className={cn('text-[14px]', item.isVisible ? 'text-ink' : 'text-ink-faint')}
                    >
                      {item.label.ru ?? '(без названия)'}
                      {item.isVisible ? null : (
                        <span className="text-ink-faint ml-2 text-[11px]">скрыт</span>
                      )}
                    </div>
                    <div className="text-ink-faint font-mono text-[12px]">
                      {item.externalUrl ?? item.anchor ?? item.targetPath ?? '— цель не найдена'}
                    </div>
                    {/* The public menu drops items whose target is not published
                        in that locale. Saying so here is the only way the owner
                        finds out before a visitor does. */}
                    {item.hiddenIn.length > 0 ? (
                      <div className="mt-0.5 text-[12px] text-[oklch(0.5_0.12_85)]">
                        Не появится в меню: {item.hiddenIn.join(', ')} — страница там не
                        опубликована.
                      </div>
                    ) : null}
                  </div>

                  <label className="sr-only" htmlFor={`position-${item.id}`}>
                    Позиция пункта «{item.label.ru ?? ''}»
                  </label>
                  <select
                    id={`position-${item.id}`}
                    value={index + 1}
                    disabled={pending}
                    onChange={(event) => {
                      const position = Number(event.target.value);
                      run(
                        () => moveNavigationItem({ id: item.id, position }),
                        () =>
                          announce(
                            `${item.label.ru ?? 'Пункт'} — позиция ${position} из ${items.length}`,
                          ),
                      );
                    }}
                    className="border-line-strong rounded-[--radius-btn] border px-2 py-1 text-[13px]"
                  >
                    {items.map((_, position) => (
                      <option key={position} value={position + 1}>
                        {position + 1} из {items.length}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    disabled={pending || index === 0}
                    aria-label={`Переместить «${item.label.ru ?? ''}» выше`}
                    onClick={() =>
                      run(
                        () => nudgeNavigationItem(item.id, 'up'),
                        () =>
                          announce(
                            `${item.label.ru ?? 'Пункт'} — позиция ${index} из ${items.length}`,
                          ),
                      )
                    }
                    className={cn(buttonClasses('ghost', 'sm'), 'px-2 text-[13px]')}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={pending || index === items.length - 1}
                    aria-label={`Переместить «${item.label.ru ?? ''}» ниже`}
                    onClick={() =>
                      run(
                        () => nudgeNavigationItem(item.id, 'down'),
                        () =>
                          announce(
                            `${item.label.ru ?? 'Пункт'} — позиция ${index + 2} из ${items.length}`,
                          ),
                      )
                    }
                    className={cn(buttonClasses('ghost', 'sm'), 'px-2 text-[13px]')}
                  >
                    ↓
                  </button>

                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        updateNavigationItem({
                          id: item.id,
                          label: item.label,
                          target: buildTarget(targetOf(item).kind, targetOf(item).value),
                          isVisible: !item.isVisible,
                        }),
                      )
                    }
                    className={cn(buttonClasses('ghost', 'sm'), 'text-[12px]')}
                  >
                    {item.isVisible ? 'Скрыть' : 'Показать'}
                  </button>

                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setAdding(false);
                      setEditingId(item.id);
                    }}
                    className={cn(buttonClasses('ghost', 'sm'), 'text-[12px]')}
                  >
                    Изменить
                  </button>

                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => deleteNavigationItem(item.id))}
                    className={cn(buttonClasses('ghost', 'sm'), 'text-[12px]')}
                  >
                    Удалить
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ItemForm({
  targets,
  initial,
  pending,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  targets: NavTarget[];
  initial?: NavItem;
  pending: boolean;
  submitLabel: string;
  onSubmit: (label: Partial<Record<Locale, string>>, kind: TargetKind, value: string) => void;
  onCancel: () => void;
}) {
  const initialTarget = initial ? targetOf(initial) : { kind: 'document' as TargetKind, value: '' };
  const [label, setLabel] = useState<Partial<Record<Locale, string>>>(initial?.label ?? {});
  const [kind, setKind] = useState<TargetKind>(initialTarget.kind);
  const [value, setValue] = useState(initialTarget.value);

  return (
    <form
      className="border-line mb-3 flex flex-col gap-3 rounded-[--radius-card] border border-dashed p-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(label, kind, value);
      }}
    >
      <div className="grid gap-2 md:grid-cols-3">
        {LOCALES.map((locale) => (
          <div key={locale}>
            <label
              htmlFor={`nav-label-${locale}-${initial?.id ?? 'new'}`}
              className="text-ink-muted mb-1 block text-[12px] font-medium"
            >
              Название ({locale})
            </label>
            <input
              id={`nav-label-${locale}-${initial?.id ?? 'new'}`}
              value={label[locale] ?? ''}
              placeholder={locale === 'ru' ? '' : (label.ru ?? '')}
              onChange={(event) => setLabel({ ...label, [locale]: event.target.value })}
              className={inputClass}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[180px]">
          <label
            htmlFor={`nav-kind-${initial?.id ?? 'new'}`}
            className="text-ink-muted mb-1 block text-[12px] font-medium"
          >
            Куда ведёт
          </label>
          <select
            id={`nav-kind-${initial?.id ?? 'new'}`}
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as TargetKind);
              setValue('');
            }}
            className={inputClass}
          >
            <option value="document">На страницу сайта</option>
            <option value="anchor">На секцию текущей страницы</option>
            <option value="external">На внешний адрес</option>
          </select>
        </div>

        <div className="min-w-[260px] flex-1">
          <label
            htmlFor={`nav-target-${initial?.id ?? 'new'}`}
            className="text-ink-muted mb-1 block text-[12px] font-medium"
          >
            {kind === 'document' ? 'Страница' : kind === 'anchor' ? 'Якорь' : 'Адрес'}
          </label>
          {kind === 'document' ? (
            <select
              id={`nav-target-${initial?.id ?? 'new'}`}
              required
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className={inputClass}
            >
              <option value="">— выберите —</option>
              {targets.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.label} · {target.path}
                  {target.published ? '' : ' (не опубликована)'}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={`nav-target-${initial?.id ?? 'new'}`}
              required
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={kind === 'anchor' ? '#kontakty' : 'https://www.instagram.com/…'}
              className={cn(inputClass, 'font-mono text-[13px]')}
            />
          )}
        </div>

        <button type="submit" disabled={pending} className={buttonClasses('primary', 'sm')}>
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
