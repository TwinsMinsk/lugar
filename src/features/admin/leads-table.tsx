import Link from 'next/link';

import { buttonClasses } from '@/components/ui/button';
import type { LeadListRow, LeadStatusRow } from '@/data/admin/leads';
import { cn } from '@/lib/utils';

/**
 * The lead inbox.
 *
 * Server-rendered with a plain GET form, so every filter is in the URL: a
 * manager can bookmark "my open leads" and paste it to a colleague, and nothing
 * depends on a bundle loading before the day's enquiries are readable.
 */

export type LeadFilterValues = {
  status?: string;
  assignee?: string;
  q?: string;
  cursor?: string;
};

const dateFormat = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Madrid',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

function buildHref(values: LeadFilterValues): string {
  const params = new URLSearchParams();
  if (values.status) params.set('status', values.status);
  if (values.assignee) params.set('assignee', values.assignee);
  if (values.q) params.set('q', values.q);
  if (values.cursor) params.set('cursor', values.cursor);
  const query = params.toString();
  return query ? `/admin/leads?${query}` : '/admin/leads';
}

export function LeadsTable({
  rows,
  nextCursor,
  statuses,
  counts,
  assignees,
  filters,
  canExport,
}: {
  rows: LeadListRow[];
  nextCursor: string | null;
  statuses: LeadStatusRow[];
  counts: Record<string, number>;
  assignees: Array<{ id: string; email: string; name: string }>;
  filters: LeadFilterValues;
  canExport: boolean;
}) {
  const exportParams = new URLSearchParams();
  if (filters.status) exportParams.set('status', filters.status);
  if (filters.assignee) exportParams.set('assignee', filters.assignee);
  const exportHref = `/api/admin/leads/export${exportParams.toString() ? `?${exportParams}` : ''}`;

  return (
    <div className="flex flex-col gap-5">
      <nav aria-label="Фильтр по статусу" className="flex flex-wrap gap-2">
        <Link
          href={buildHref({ ...filters, status: undefined, cursor: undefined })}
          aria-current={filters.status ? undefined : 'true'}
          className={cn(
            'rounded-[--radius-btn] border px-2.5 py-1 text-[13px] transition-colors',
            filters.status
              ? 'border-line text-ink-muted hover:border-line-strong'
              : 'border-accent text-accent',
          )}
        >
          Все
        </Link>
        {statuses.map((status) => (
          <Link
            key={status.id}
            href={buildHref({ ...filters, status: status.id, cursor: undefined })}
            aria-current={filters.status === status.id ? 'true' : undefined}
            className={cn(
              'rounded-[--radius-btn] border px-2.5 py-1 text-[13px] transition-colors',
              filters.status === status.id
                ? 'border-accent text-accent'
                : 'border-line text-ink-muted hover:border-line-strong',
            )}
          >
            <span
              aria-hidden
              className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
              style={{ backgroundColor: status.color }}
            />
            {status.label.ru ?? status.slug}
            <span className="text-ink-faint ml-1.5">{counts[status.id] ?? 0}</span>
          </Link>
        ))}
      </nav>

      <form
        method="get"
        action="/admin/leads"
        className="border-line bg-surface flex flex-wrap items-end gap-3 rounded-[--radius-card] border p-4"
      >
        {/* Keeps the chip selection when the text filter is submitted. */}
        {filters.status ? <input type="hidden" name="status" value={filters.status} /> : null}

        <div className="min-w-[240px] flex-1">
          <label htmlFor="lead-q" className="text-ink-muted mb-1 block text-[12px] font-medium">
            Поиск
          </label>
          <input
            id="lead-q"
            name="q"
            defaultValue={filters.q ?? ''}
            placeholder="Имя, телефон или номер заявки"
            className="border-line-strong bg-surface w-full rounded-[--radius-btn] border px-3 py-2 text-[14px]"
          />
        </div>

        <div className="min-w-[200px]">
          <label
            htmlFor="lead-assignee"
            className="text-ink-muted mb-1 block text-[12px] font-medium"
          >
            Ответственный
          </label>
          <select
            id="lead-assignee"
            name="assignee"
            defaultValue={filters.assignee ?? ''}
            className="border-line-strong bg-surface w-full rounded-[--radius-btn] border px-3 py-2 text-[14px]"
          >
            <option value="">Все</option>
            <option value="none">Без ответственного</option>
            {assignees.map((person) => (
              <option key={person.id} value={person.id}>
                {person.email}
              </option>
            ))}
          </select>
        </div>

        <button type="submit" className={buttonClasses('primary', 'sm')}>
          Показать
        </button>

        {filters.q || filters.assignee || filters.status ? (
          <Link href="/admin/leads" className={cn(buttonClasses('ghost', 'sm'), 'text-[13px]')}>
            Сбросить
          </Link>
        ) : null}

        {canExport ? (
          <a
            href={exportHref}
            className={cn(buttonClasses('outline', 'sm'), 'ml-auto text-[13px]')}
            // A download, not a navigation — and it carries the whole customer
            // list, so the audit log records every one.
            download
          >
            Выгрузить CSV
          </a>
        ) : null}
      </form>

      <div className="border-line bg-surface overflow-x-auto rounded-[--radius-card] border">
        {rows.length === 0 ? (
          <p className="text-ink-faint p-4 text-[13px]">
            {filters.q || filters.status || filters.assignee
              ? 'По этим условиям заявок нет.'
              : 'Заявок пока нет. Они появятся здесь сразу после отправки формы на сайте.'}
          </p>
        ) : (
          <table className="w-full min-w-[860px] text-left text-[14px]">
            <thead className="border-line text-ink-faint border-b text-[12px] tracking-wide uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Заявка</th>
                <th className="px-4 py-3 font-medium">Клиент</th>
                <th className="px-4 py-3 font-medium">Что нужно</th>
                <th className="px-4 py-3 font-medium">Статус</th>
                <th className="px-4 py-3 font-medium">Ответственный</th>
                <th className="px-4 py-3 font-medium">Источник</th>
              </tr>
            </thead>
            <tbody className="divide-line divide-y">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-surface-muted/40">
                  <td className="px-4 py-3 align-top">
                    <Link
                      href={`/admin/leads/${row.id}`}
                      className="text-ink hover:text-accent font-mono text-[13px] font-medium"
                    >
                      {row.publicId}
                    </Link>
                    <div className="text-ink-faint text-[12px]">
                      {dateFormat.format(row.createdAt)}
                    </div>
                    {row.isDuplicateHint ? (
                      <div
                        title="Похоже на повторное обращение того же человека"
                        className="mt-1 inline-block rounded-[--radius-btn] bg-[oklch(0.95_0.05_85)] px-1.5 py-0.5 text-[11px] text-[oklch(0.45_0.10_85)]"
                      >
                        возможно повтор
                      </div>
                    ) : null}
                  </td>

                  <td className="px-4 py-3 align-top">
                    <div className="text-ink">{row.contactName ?? '—'}</div>
                    <a
                      href={`tel:${row.contactPhone}`}
                      className="text-ink-faint hover:text-accent font-mono text-[12px]"
                    >
                      {row.contactPhone}
                    </a>
                  </td>

                  <td className="text-ink-soft px-4 py-3 align-top text-[13px]">
                    <div>{row.service ?? '—'}</div>
                    {row.city ? <div className="text-ink-faint text-[12px]">{row.city}</div> : null}
                  </td>

                  <td className="px-4 py-3 align-top">
                    <span className="inline-flex items-center gap-1.5 text-[13px]">
                      <span
                        aria-hidden
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: row.statusColor }}
                      />
                      {row.statusLabel.ru ?? '—'}
                    </span>
                  </td>

                  <td className="text-ink-soft px-4 py-3 align-top text-[13px]">
                    {row.assigneeEmail ?? (
                      <span className="text-[oklch(0.55_0.13_60)]">не назначен</span>
                    )}
                  </td>

                  <td className="text-ink-faint px-4 py-3 align-top text-[12px]">
                    {row.utmSource ?? 'прямой заход'}
                    <div className="uppercase">{row.locale}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {nextCursor || filters.cursor ? (
        <div className="flex items-center gap-3">
          {filters.cursor ? (
            <Link
              href={buildHref({ ...filters, cursor: undefined })}
              className={cn(buttonClasses('ghost', 'sm'), 'text-[13px]')}
            >
              К самым свежим
            </Link>
          ) : null}
          {nextCursor ? (
            <Link
              href={buildHref({ ...filters, cursor: nextCursor })}
              className={cn(buttonClasses('outline', 'sm'), 'text-[13px]')}
            >
              Более ранние
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
