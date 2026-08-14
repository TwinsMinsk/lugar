import Link from 'next/link';

import { buttonClasses } from '@/components/ui/button';
import { listContacts } from '@/data/admin/contacts';
import { requireCapability } from '@/lib/auth/guards';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Клиенты' };

const SOURCE_LABEL: Record<string, string> = {
  web_form: 'форма на сайте',
  whatsapp_inbound: 'написал в WhatsApp',
  manual: 'добавлен вручную',
  import: 'импорт',
  phone_call: 'звонок',
};

const dateFormat = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Madrid',
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
});

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : (value ?? undefined);
}

export default async function ContactsPage({ searchParams }: PageProps) {
  await requireCapability('crm.read');

  const params = await searchParams;
  const q = first(params.q);
  const cursor = first(params.cursor);
  const page = await listContacts({ q, cursor });

  const href = (next?: string) => {
    const search = new URLSearchParams();
    if (q) search.set('q', q);
    if (next) search.set('cursor', next);
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
            {q ? 'Никого не нашлось.' : 'Клиентов пока нет — они появятся с первой заявкой.'}
          </p>
        ) : (
          <table className="w-full min-w-[760px] text-left text-[14px]">
            <thead className="border-line text-ink-faint border-b text-[12px] tracking-wide uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Клиент</th>
                <th className="px-4 py-3 font-medium">Обращений</th>
                <th className="px-4 py-3 font-medium">Последнее</th>
                <th className="px-4 py-3 font-medium">Откуда</th>
                <th className="px-4 py-3 font-medium">WhatsApp</th>
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
                    {row.lastLeadAt ? dateFormat.format(new Date(row.lastLeadAt)) : '—'}
                  </td>
                  <td className="text-ink-faint px-4 py-3 align-top text-[12px]">
                    {SOURCE_LABEL[row.source] ?? row.source}
                    {row.city ? <div>{row.city}</div> : null}
                  </td>
                  <td className="px-4 py-3 align-top text-[12px]">
                    {row.waOptIn ? (
                      <span className="text-[oklch(0.42_0.08_150)]">согласие есть</span>
                    ) : (
                      <span className="text-ink-faint">без согласия</span>
                    )}
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
