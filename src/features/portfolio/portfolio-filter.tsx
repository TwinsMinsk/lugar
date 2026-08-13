'use client';

import { useId, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import { track } from '@/features/analytics/analytics';
import { cn } from '@/lib/utils';

export type FilterOption = { slug: string; label: string };

/**
 * Portfolio category filter.
 *
 * Every project card is rendered server-side and present in the initial HTML;
 * this component only hides the ones that do not match. That keeps every
 * project URL crawlable — a filter implemented as a server round trip per
 * category would either fragment the index across query strings or hide
 * projects from crawlers entirely.
 *
 * Accessibility details that are easy to get wrong and are handled here:
 *  - the buttons form a labelled group with `aria-pressed`, so a screen reader
 *    announces which filter is active rather than just reading nine words;
 *  - the result count is announced via `aria-live`, so a keyboard or screen
 *    reader user gets feedback that something changed — the visual grid update
 *    is not perceivable to them;
 *  - filtering never removes the focused element from the document, so focus is
 *    never silently lost to `<body>`.
 */
export function PortfolioFilter({
  categories,
  children,
  counts,
  total,
}: {
  categories: FilterOption[];
  /** Server-rendered cards, keyed by category slug for filtering. */
  children: React.ReactNode;
  counts: Record<string, number>;
  /** Distinct project count. Summing `counts` would double-count a project
      that legitimately belongs to two categories. */
  total: number;
}) {
  const t = useTranslations('portfolio');
  const [active, setActive] = useState<string | null>(null);

  const select = (slug: string | null) => {
    setActive(slug);
    track({ name: 'portfolio_filter_change', category: slug ?? 'all' });
  };

  const gridId = useId().replace(/[^a-zA-Z0-9-]/g, '');

  const shown = useMemo(() => (active ? (counts[active] ?? 0) : total), [active, counts, total]);

  return (
    <>
      <div
        role="group"
        aria-label={t('filterLabel')}
        className="border-line mb-[clamp(24px,3vw,40px)] flex flex-wrap gap-2 border-b pb-[clamp(24px,3vw,36px)]"
      >
        <FilterButton active={active === null} onClick={() => select(null)}>
          {t('filterAll')}
        </FilterButton>
        {categories.map((category) => (
          <FilterButton
            key={category.slug}
            active={active === category.slug}
            onClick={() => select(category.slug)}
          >
            {category.label}
          </FilterButton>
        ))}
      </div>

      <p aria-live="polite" className="sr-only">
        {t('showing', { count: shown, total })}
      </p>

      {shown === 0 ? (
        <p className="text-ink-soft py-10 text-[16px]">{t('empty')}</p>
      ) : (
        <>
          {/* Cards carry data-categories; the active filter hides non-matches
              in CSS. A generated Tailwind class cannot express this because the
              category is only known at runtime, and Tailwind scans source at
              build time — a dynamic class name would simply never be emitted. */}
          {active ? (
            <style>{`[data-pf="${gridId}"] > [data-categories]:not([data-categories~="${active}"]){display:none}`}</style>
          ) : null}
          <div
            data-pf={gridId}
            className="grid gap-[clamp(10px,1.2vw,18px)]"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}
          >
            {children}
          </div>
        </>
      )}
    </>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'cursor-pointer rounded-[--radius-btn] border px-[18px] py-[11px] text-[13.5px] tracking-[0.01em]',
        'transition-colors duration-[--duration-fast]',
        active
          ? 'bg-accent border-accent text-white'
          : 'border-line-chip text-ink-filter hover:border-accent hover:text-accent bg-transparent',
      )}
    >
      {children}
    </button>
  );
}
