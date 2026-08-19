'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import {
  archiveProject,
  createProject,
  updateProjectMeta,
} from '@/app/(admin)/admin/_actions/portfolio';
import { buttonClasses } from '@/components/ui/button';
import { InlineConfirm } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { MediaPicker, type PickableAsset } from './media-picker';
import { messagesFor } from './messages';

/** Only what this screen says better than the shared vocabulary. */
const message = messagesFor({
  slug_format: 'Адрес может содержать только строчные латинские буквы, цифры и дефис.',
  slug_taken: 'Такой адрес уже занят другим проектом.',
  slug_taken_archived:
    'Такой адрес занят убранным проектом. Верните его из списка «Убранные проекты» или удалите насовсем — либо возьмите другой адрес.',
  invalid_input: 'Проверьте заполненные поля.',
});

const inputClass = cn(
  'border-line-strong bg-surface w-full rounded-[--radius-btn] border px-3 py-2 text-[14px]',
  'focus:border-accent outline-none transition-colors duration-[--duration-fast]',
);

/** Derives a URL-safe slug from a Russian title. */
function transliterate(input: string): string {
  const map: Record<string, string> = {
    а: 'a',
    б: 'b',
    в: 'v',
    г: 'g',
    д: 'd',
    е: 'e',
    ё: 'e',
    ж: 'zh',
    з: 'z',
    и: 'i',
    й: 'y',
    к: 'k',
    л: 'l',
    м: 'm',
    н: 'n',
    о: 'o',
    п: 'p',
    р: 'r',
    с: 's',
    т: 't',
    у: 'u',
    ф: 'f',
    х: 'h',
    ц: 'c',
    ч: 'ch',
    ш: 'sh',
    щ: 'sch',
    ъ: '',
    ы: 'y',
    ь: '',
    э: 'e',
    ю: 'yu',
    я: 'ya',
  };
  return input
    .toLowerCase()
    .split('')
    .map((char) => map[char] ?? char)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

export function CreateProjectForm({
  categories,
}: {
  categories: Array<{ id: string; slug: string; label: string }>;
}) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [city, setCity] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const effectiveSlug = slugTouched ? slug : transliterate(title);

  return (
    <form
      className="border-line bg-surface flex flex-col gap-4 rounded-[--radius-card] border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          setError(null);
          const result = await createProject({
            title,
            slug: effectiveSlug,
            city: city || undefined,
            categorySlugs: chosen,
          });
          if (result.ok && result.documentId) {
            // The action returns the id rather than redirecting: redirect()
            // throws a control-flow exception, which a catch inside the action
            // would swallow and report as a failure that never happened.
            router.push(`/admin/portfolio/${result.documentId}`);
          } else if (!result.ok) {
            setError(message(result.error));
          }
        });
      }}
    >
      <h2 className="font-display text-[19px]">Новый проект</h2>

      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}
      >
        <div>
          <label
            htmlFor="project-title"
            className="text-ink-muted mb-1 block text-[12px] font-medium"
          >
            Название
          </label>
          <input
            id="project-title"
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Кухня в Марбелье"
            className={inputClass}
          />
        </div>

        <div>
          <label
            htmlFor="project-slug"
            className="text-ink-muted mb-1 block text-[12px] font-medium"
          >
            Адрес страницы
          </label>
          <input
            id="project-slug"
            required
            value={effectiveSlug}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(event.target.value);
            }}
            className={cn(inputClass, 'font-mono text-[13px]')}
          />
          <p className="text-ink-faint mt-1 text-[11px]">/raboty/{effectiveSlug || '…'}</p>
        </div>

        <div>
          <label
            htmlFor="project-city"
            className="text-ink-muted mb-1 block text-[12px] font-medium"
          >
            Город
          </label>
          <input
            id="project-city"
            value={city}
            onChange={(event) => setCity(event.target.value)}
            placeholder="Марбелья"
            className={inputClass}
          />
        </div>
      </div>

      <fieldset>
        <legend className="text-ink-muted mb-1.5 text-[12px] font-medium">Категории</legend>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((category) => {
            const active = chosen.includes(category.slug);
            return (
              <button
                key={category.id}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  setChosen(
                    active
                      ? chosen.filter((slugValue) => slugValue !== category.slug)
                      : [...chosen, category.slug],
                  )
                }
                className={cn(
                  'rounded-[--radius-btn] border px-2.5 py-1 text-[13px]',
                  active
                    ? 'bg-accent border-accent text-white'
                    : 'border-line-chip text-ink-filter hover:border-accent',
                )}
              >
                {category.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {error ? (
        <p role="alert" className="text-[13px] text-[oklch(0.52_0.17_25)]">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClasses('primary', 'sm')}>
          {pending ? 'Создаём…' : 'Создать проект'}
        </button>
        <span className="text-ink-faint text-[12px]">
          Проект создаётся черновиком — на сайт он попадёт только после публикации.
        </span>
      </div>
    </form>
  );
}

export function ProjectMetaForm({
  documentId,
  assets,
  categories,
  initial,
}: {
  documentId: string;
  assets: PickableAsset[];
  categories: Array<{ id: string; label: string }>;
  initial: {
    coverAssetId: string | null;
    categoryIds: string[];
    city: string | null;
    isFeatured: boolean;
    sortOrder: number;
  };
}) {
  const router = useRouter();
  const [cover, setCover] = useState(initial.coverAssetId);
  const [categoryIds, setCategoryIds] = useState(initial.categoryIds);
  const [city, setCity] = useState(initial.city ?? '');
  const [isFeatured, setIsFeatured] = useState(initial.isFeatured);
  const [sortOrder, setSortOrder] = useState(initial.sortOrder);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="border-line bg-surface flex flex-col gap-4 rounded-[--radius-card] border p-4">
      <h2 className="font-display text-[19px]">Карточка проекта</h2>
      <p className="text-ink-faint -mt-2 text-[12px]">
        Эти поля управляют тем, как проект выглядит и сортируется в разделе «Наши работы».
      </p>

      <MediaPicker assets={assets} value={cover} onChange={setCover} label="Обложка" />

      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}
      >
        <div>
          <label htmlFor="meta-city" className="text-ink-muted mb-1 block text-[12px] font-medium">
            Город
          </label>
          <input
            id="meta-city"
            value={city}
            onChange={(event) => setCity(event.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="meta-sort" className="text-ink-muted mb-1 block text-[12px] font-medium">
            Порядок (меньше — выше)
          </label>
          <input
            id="meta-sort"
            type="number"
            min={0}
            max={9999}
            value={sortOrder}
            onChange={(event) => setSortOrder(Number(event.target.value))}
            className={inputClass}
          />
        </div>
      </div>

      <fieldset>
        <legend className="text-ink-muted mb-1.5 text-[12px] font-medium">Категории</legend>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((category) => {
            const active = categoryIds.includes(category.id);
            return (
              <button
                key={category.id}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  setCategoryIds(
                    active
                      ? categoryIds.filter((id) => id !== category.id)
                      : [...categoryIds, category.id],
                  )
                }
                className={cn(
                  'rounded-[--radius-btn] border px-2.5 py-1 text-[13px]',
                  active
                    ? 'bg-accent border-accent text-white'
                    : 'border-line-chip text-ink-filter hover:border-accent',
                )}
              >
                {category.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <label className="text-ink-muted flex items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          checked={isFeatured}
          onChange={(event) => setIsFeatured(event.target.checked)}
          className="accent-accent h-4 w-4"
        />
        Избранный проект (попадает в подборки на других страницах)
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await updateProjectMeta({
                documentId,
                coverAssetId: cover,
                categoryIds,
                city: city || null,
                isFeatured,
                sortOrder,
              });
              setStatus(result.ok ? 'Карточка сохранена.' : `Ошибка: ${result.error}`);
              router.refresh();
            })
          }
          className={buttonClasses('outline', 'sm')}
        >
          Сохранить карточку
        </button>

        {/* The editor below has a per-locale «Снять с сайта RU/ES/EN». This one
            does all three at once, and says so — two controls whose names only
            differ by a suffix would be read as the same button. */}
        <InlineConfirm
          label="Снять со всех языков"
          question="Снять проект с сайта во всех языках?"
          confirmLabel="Снять"
          disabled={pending}
          onConfirm={() =>
            startTransition(async () => {
              const result = await archiveProject(documentId);
              setStatus(result.ok ? 'Проект снят с сайта.' : `Ошибка: ${result.error}`);
              router.refresh();
            })
          }
        />

        {status ? (
          <span role="status" className="text-ink-muted text-[13px]">
            {status}
          </span>
        ) : null}
      </div>
    </section>
  );
}
