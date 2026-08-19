import Link from 'next/link';

import { buttonClasses } from '@/components/ui/button';
import { listContacts } from '@/data/admin/contacts';
import { ContactRemoval } from '@/features/admin/contact-removal';
import { can, requireCapability } from '@/lib/auth/guards';
import { cn } from '@/lib/utils';
import { formatShortDate } from '@/lib/format';

export const metadata = { title: 'Клиенты' };

const SOURCE_LABEL: Record<string, string> = {
  web_form: 'форма на сайте',
  whatsapp_inbound: 'написал в WhatsApp',
  manual: 'добавлен вручную',
  import: 'импорт',
  phone_call: 'звонок',
};

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : (value ?? undefined);
}

export default async function ContactsPage({ searchParams }: PageProps) {
  await requireCapability('crm.read');

  const params = await searchParams;
  const q = first(params.q);
  const cursor = first(params.cursor);
  const archived = first(params.view) === 'archived';
  const [page, canDelete] = await Promise.all([
    listContacts({ q, cursor, archived }),
    can('crm.delete'),
  ]);

  const href = (next?: string, view: boolean = archived) => {
    const search = new URLSearchParams();
    if (q) search.set('q', q);
    if (next) search.set('cursor', next);
    if (view) search.set('view', 'archived');
    return search.toString() ? `/admin/contacts?${search}` : '/admin/contacts';
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[32px] leading-tight">Клиенты</h1>
        <p className="text-ink-soft mt-2 max-w-[72ch] text-[14px]">
          Один человек — одна карточка, сколько бы заявок он ни оставил. Записи не склеиваются
          автоматически: номер телефона — единственное, по чему система узнаёт человека.
        </p>
      </div>

      <nav aria-label="Что показывать" className="flex flex-wrap gap-2">
        <Link
          href={href(undefined, false)}
          aria-current={archived ? undefined : 'true'}
          className={cn(
            'rounded-[--radius-btn] border px-2.5 py-1 text-[13px] transition-colors',
            archived
              ? 'border-line text-ink-muted hover:border-line-strong'
              : 'border-accent text-accent',
          )}
        >
          Активные
        </Link>
        <Link
          href={href(undefined, true)}
          aria-current={archived ? 'true' : undefined}
          className={cn(
            'rounded-[--radius-btn] border px-2.5 py-1 text-[13px] transition-colors',
            archived
              ? 'border-accent text-accent'
              : 'border-line text-ink-muted hover:border-line-strong',
          )}
        >
          Убранные
        </Link>
      </nav>

      <form
        method="get"
        action="/admin/contacts"
        className="border-line bg-surface flex flex-wrap items-end gap-3 rounded-[--radius-card] border p-4"
      >
        <div className="min-w-[240px] flex-1">
          <label htmlFor="contact-q" className="text-ink-muted mb-1 block text-[12px] font-medium">
            Поиск
          </label>
          <input
            id="contact-q"
            name="q"
            defaultValue={q ?? ''}
            placeholder="Имя, телефон или email"
            className="border-line-strong bg-surface w-full rounded-[--radius-btn] border px-3 py-2 text-[14px]"
          />
        </div>
        {archived ? <input type="hidden" name="view" value="archived" /> : null}
        <button type="submit" className={buttonClasses('primary', 'sm')}>
          Показать
        </button>
        {q ? (
          <Link href="/admin/contacts" className={cn(buttonClasses('ghost', 'sm'), 'text-[13px]')}>
            Сбросить
          </Link>
        ) : null}
      </form>

      <div className="border-line bg-surface overflow-x-auto rounded-[--radius-card] border">
        {page.rows.length === 0 ? (
          <p className="text-ink-faint p-4 text-[13px]">
            {archived
              ? 'В архиве пусто.'
              : q
                ? 'Никого не нашлось.'
                : 'Клиентов пока нет — они появятся с первой заявкой.'}
          </p>
        ) : (
          <table className="w-full min-w-[900px] text-left text-[14px]">
            <caption className="sr-only">{archived ? 'Убранные клиенты' : 'Клиенты'}</caption>
            <thead className="border-line text-ink-faint border-b text-[12px] tracking-wide uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Клиент</th>
                <th className="px-4 py-3 font-medium">Обращений</th>
                <th className="px-4 py-3 font-medium">Последнее</th>
                <th className="px-4 py-3 font-medium">Откуда</th>
                <th className="px-4 py-3 font-medium">WhatsApp</th>
                <th className="px-4 py-3 text-right font-medium">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-line divide-y">
              {page.rows.map((row) => (
                <tr key={row.id} className="hover:bg-surface-muted/40">
                  <td className="px-4 py-3 align-top">
                    <Link
                      href={`/admin/contacts/${row.id}`}
                      className="text-ink hover:text-accent font-medium"
                    >
                      {row.fullName ?? 'Без имени'}
                    </Link>
                    <div className="text-ink-faint font-mono text-[12px]">{row.phoneE164}</div>
                    {row.email ? (
                      <div className="text-ink-faint text-[12px]">{row.email}</div>
                    ) : null}
                  </td>
                  <td className="text-ink-soft px-4 py-3 align-top">{row.leadCount}</td>
                  <td className="text-ink-soft px-4 py-3 align-top text-[13px]">
                    {row.lastLeadAt ? formatShortDate(row.lastLeadAt) : '—'}
                  </td>
                  <td className="text-ink-faint px-4 py-3 align-top text-[12px]">
                    {SOURCE_LABEL[row.source] ?? row.source}
                    {row.city ? <div>{row.city}</div> : null}
                  </td>
                  <td className="px-4 py-3 align-top text-[12px]">
                    {row.waOptIn ? (
                      <span className="text-success">согласие есть</span>
                    ) : (
                      <span className="text-ink-faint">без согласия</span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <ContactRemoval contactId={row.id} archived={archived} canDelete={canDelete} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {page.nextCursor || cursor ? (
        <div className="flex items-center gap-3">
          {cursor ? (
            <Link href={href()} className={cn(buttonClasses('ghost', 'sm'), 'text-[13px]')}>
              К самым свежим
            </Link>
          ) : null}
          {page.nextCursor ? (
            <Link
              href={href(page.nextCursor)}
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
