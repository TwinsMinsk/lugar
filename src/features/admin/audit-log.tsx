import Link from 'next/link';

import type { AuditEntry } from '@/data/admin/audit';
import { buttonClasses } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/format';

/**
 * The audit trail, rendered.
 *
 * A server component with a plain GET form and plain links — no client
 * JavaScript. Filtering and paging end up in the URL, which means an owner can
 * bookmark "everything Ivan published" or paste it to someone else, and a log
 * that must be readable during an incident does not depend on a bundle loading.
 */

const ACTION_LABEL: Record<string, string> = {
  'content.draft_saved': 'Черновик сохранён',
  'content.published': 'Страница опубликована',
  'content.rolled_back': 'Откат к прежней версии',
  'content.slug_changed': 'Изменён адрес страницы',
  'content.unpublished': 'Страница снята с публикации',
  'content.seo_updated': 'Изменены заголовок и описание для поиска',
  'document.archived': 'Убрано из списка',
  'document.restored': 'Возвращено из архива',
  'document.purged': 'Удалено навсегда',
  'media.uploaded': 'Загружен файл',
  'media.replaced': 'Файл заменён',
  'media.meta_updated': 'Изменены описание или фокус',
  'media.deleted': 'Изображение убрано',
  'media.restored': 'Изображение возвращено',
  'media.purged': 'Изображение удалено навсегда',
  'portfolio.created': 'Создан проект',
  'portfolio.meta_updated': 'Изменён проект',
  'portfolio.archived': 'Проект снят с сайта',
  'redirect.created': 'Создан редирект',
  'redirect.enabled': 'Редирект включён',
  'redirect.disabled': 'Редирект выключен',
  'redirect.deleted': 'Редирект удалён',
  'navigation.updated': 'Изменено меню',
  'settings.updated': 'Изменены настройки',
  'users.invited': 'Отправлено приглашение',
  'users.invitation_revoked': 'Приглашение отозвано',
  'users.invitation_accepted': 'Приглашение принято',
  'users.role_changed': 'Изменена роль',
  'users.banned': 'Доступ отключён',
  'users.unbanned': 'Доступ восстановлен',
  'lead.deleted': 'Заявка удалена',
  'crm.exported': 'Выгрузка заявок',
  'pipeline.stage_created': 'Этап воронки создан',
  'pipeline.stage_updated': 'Этап воронки изменён',
  'pipeline.stage_archived': 'Этап воронки убран',
  'pipeline.stage_restored': 'Этап воронки возвращён',
  'pipeline.entry_changed': 'Изменена точка входа заявок',
};

const ENTITY_LABEL: Record<string, string> = {
  document: 'страница',
  media: 'файл',
  media_asset: 'изображение',
  project: 'проект',
  redirect: 'редирект',
  navigation: 'меню',
  settings: 'настройки',
  user: 'сотрудник',
  invitation: 'приглашение',
  lead: 'заявка',
  lead_status: 'этап воронки',
};

export type AuditFilterValues = {
  action?: string;
  actor?: string;
  entity?: string;
  cursor?: string;
};

function buildHref(values: AuditFilterValues): string {
  const params = new URLSearchParams();
  if (values.action) params.set('action', values.action);
  if (values.actor) params.set('actor', values.actor);
  if (values.entity) params.set('entity', values.entity);
  if (values.cursor) params.set('cursor', values.cursor);
  const query = params.toString();
  return query ? `/admin/audit?${query}` : '/admin/audit';
}

/** Operational dates are read in Madrid, whatever the server's clock says. */
/**
 * A compact one-line summary of a recorded value.
 *
 * The trail stores summaries, not payloads, so this only ever has a handful of
 * keys to show. Anything unexpected is stringified and truncated rather than
 * dumped — an audit row must never become a wall of JSON that hides the next
 * row.
 */
function summarize(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') return String(value);

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return null;

  return entries
    .map(([key, item]) => {
      const rendered = Array.isArray(item)
        ? `${item.length}`
        : typeof item === 'object' && item !== null
          ? JSON.stringify(item)
          : String(item);
      return `${key}: ${rendered.length > 60 ? `${rendered.slice(0, 60)}…` : rendered}`;
    })
    .join(', ');
}

export function AuditLog({
  entries,
  nextCursor,
  actions,
  actors,
  filters,
}: {
  entries: AuditEntry[];
  nextCursor: string | null;
  actions: string[];
  actors: Array<{ id: string; email: string }>;
  filters: AuditFilterValues;
}) {
  const entityTypes = [...new Set(Object.keys(ENTITY_LABEL))];
  const hasFilters = Boolean(filters.action || filters.actor || filters.entity);

  return (
    <div className="flex flex-col gap-6">
      <form
        method="get"
        action="/admin/audit"
        className="border-line bg-surface flex flex-wrap items-end gap-3 rounded-[--radius-card] border p-4"
      >
        <div className="min-w-[200px]">
          <label
            htmlFor="audit-action"
            className="text-ink-muted mb-1 block text-[12px] font-medium"
          >
            Действие
          </label>
          <select
            id="audit-action"
            name="action"
            defaultValue={filters.action ?? ''}
            className="border-line-strong bg-surface w-full rounded-[--radius-btn] border px-3 py-2 text-[14px]"
          >
            <option value="">Любое</option>
            {actions.map((action) => (
              <option key={action} value={action}>
                {ACTION_LABEL[action] ?? action}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-[200px]">
          <label
            htmlFor="audit-actor"
            className="text-ink-muted mb-1 block text-[12px] font-medium"
          >
            Кто
          </label>
          <select
            id="audit-actor"
            name="actor"
            defaultValue={filters.actor ?? ''}
            className="border-line-strong bg-surface w-full rounded-[--radius-btn] border px-3 py-2 text-[14px]"
          >
            <option value="">Все</option>
            {actors.map((actor) => (
              <option key={actor.id} value={actor.id}>
                {actor.email}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-[180px]">
          <label
            htmlFor="audit-entity"
            className="text-ink-muted mb-1 block text-[12px] font-medium"
          >
            Объект
          </label>
          <select
            id="audit-entity"
            name="entity"
            defaultValue={filters.entity ?? ''}
            className="border-line-strong bg-surface w-full rounded-[--radius-btn] border px-3 py-2 text-[14px]"
          >
            <option value="">Любой</option>
            {entityTypes.map((type) => (
              <option key={type} value={type}>
                {ENTITY_LABEL[type]}
              </option>
            ))}
          </select>
        </div>

        <button type="submit" className={buttonClasses('primary', 'sm')}>
          Показать
        </button>

        {hasFilters ? (
          <Link href="/admin/audit" className={cn(buttonClasses('ghost', 'sm'), 'text-[13px]')}>
            Сбросить
          </Link>
        ) : null}
      </form>

      <section className="border-line bg-surface rounded-[--radius-card] border">
        {entries.length === 0 ? (
          <p className="text-ink-faint p-4 text-[13px]">
            {hasFilters ? 'Ничего не найдено по этим условиям.' : 'Записей пока нет.'}
          </p>
        ) : (
          <ul className="divide-line divide-y">
            {entries.map((entry) => {
              const before = summarize(entry.before);
              const after = summarize(entry.after);
              return (
                <li key={entry.id} className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3">
                  <time
                    dateTime={entry.occurredAt.toISOString()}
                    className="text-ink-faint w-[130px] flex-none font-mono text-[12px]"
                  >
                    {formatDateTime(entry.occurredAt)}
                  </time>

                  <div className="min-w-[260px] flex-1">
                    <div className="text-ink text-[14px]">
                      {ACTION_LABEL[entry.action] ?? entry.action}
                      {entry.result !== 'ok' ? (
                        <span className="bg-danger-surface text-danger-ink ml-2 rounded-[--radius-btn] px-1.5 py-0.5 text-[11px]">
                          {entry.result}
                        </span>
                      ) : null}
                    </div>

                    {before || after ? (
                      <div className="text-ink-faint mt-0.5 font-mono text-[12px] break-words">
                        {before ? <span className="line-through">{before}</span> : null}
                        {before && after ? <span className="mx-1.5">→</span> : null}
                        {after ? <span>{after}</span> : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="text-ink-faint w-[220px] flex-none text-[12px]">
                    <div>{entry.actorEmail ?? 'аккаунт удалён'}</div>
                    <div>
                      {ENTITY_LABEL[entry.entityType] ?? entry.entityType}
                      {entry.ipAddress ? ` · ${entry.ipAddress}` : ''}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

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
