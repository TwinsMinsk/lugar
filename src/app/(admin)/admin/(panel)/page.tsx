import Link from 'next/link';

import { listDocuments } from '@/data/admin/documents';
import { getCrmSummary } from '@/data/admin/leads';
import { getSiteSettings } from '@/data/public/settings';
import { can, requireUser } from '@/lib/auth/guards';
import { countPlaceholderMedia } from '@/data/admin/media';

export const metadata = { title: 'Обзор' };

/**
 * Dashboard.
 *
 * Deliberately shows what is *unfinished* rather than vanity totals. Before
 * launch the useful questions are "what still has a placeholder in it" and
 * "what have I edited but not published" — not how many pages exist.
 */
export default async function AdminDashboard() {
  const { user } = await requireUser();

  const [pages, projects, settings, placeholders] = await Promise.all([
    listDocuments('page'),
    listDocuments('project'),
    getSiteSettings(),
    countPlaceholderMedia(),
  ]);

  const unpublished = pages
    .concat(projects)
    .filter((doc) => doc.locales.some((locale) => locale.hasUnpublishedChanges));

  const canSeeLeads = await can('crm.read');
  const crm = canSeeLeads ? await getCrmSummary(user.id) : null;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-[32px] leading-tight">Обзор</h1>
        <p className="text-ink-soft mt-2 text-[14px]">
          Что нужно доделать перед публичным запуском.
        </p>
      </div>

      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}
      >
        <Stat
          label="Изображений-заглушек"
          value={placeholders}
          tone={placeholders > 0 ? 'warn' : 'ok'}
          href="/admin/media?filter=placeholder"
          hint="Их видно на сайте розовой штриховкой"
        />
        <Stat
          label="Настроек без значения"
          value={settings.pendingReview.length}
          tone={settings.pendingReview.length > 0 ? 'warn' : 'ok'}
          href="/admin/settings"
          hint="Соцсети, адрес, реквизиты, аналитика"
        />
        <Stat
          label="Страниц с неопубликованными правками"
          value={unpublished.length}
          tone={unpublished.length > 0 ? 'info' : 'ok'}
          href="/admin/pages"
        />
        <Stat
          label="Проектов в портфолио"
          value={projects.length}
          tone={projects.length === 0 ? 'warn' : 'ok'}
          href="/admin/portfolio"
          hint={projects.length === 0 ? 'Раздел «Наши работы» пока пуст' : undefined}
        />
      </div>

      <section>
        <h2 className="font-display mb-3 text-[20px]">Страницы</h2>
        <ul className="border-line divide-line bg-surface divide-y rounded-[--radius-card] border">
          {pages.map((page) => (
            <li key={page.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Link
                href={`/admin/pages/${page.id}`}
                className="text-ink hover:text-accent flex-1 text-[15px] font-medium"
              >
                {page.seedKey?.replace('page.', '') ?? page.template}
              </Link>
              <div className="flex gap-1.5">
                {page.locales.map((locale) => (
                  <span
                    key={locale.locale}
                    title={`${locale.locale}: ${locale.status}`}
                    className={
                      'rounded-[--radius-btn] px-2 py-0.5 text-[11px] tracking-wide uppercase ' +
                      (locale.status === 'published'
                        ? locale.hasUnpublishedChanges
                          ? 'bg-[oklch(0.94_0.07_85)] text-[oklch(0.42_0.10_85)]'
                          : 'bg-[oklch(0.94_0.05_150)] text-[oklch(0.38_0.08_150)]'
                        : 'bg-[oklch(0.93_0.005_85)] text-[oklch(0.5_0.006_85)]')
                    }
                  >
                    {locale.locale}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {crm ? (
        <section>
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <h2 className="font-display text-[20px]">Заявки</h2>
            <Link href="/admin/leads" className="text-ink-faint hover:text-accent text-[13px]">
              Списком
            </Link>
            <Link
              href="/admin/leads/board"
              className="text-ink-faint hover:text-accent text-[13px]"
            >
              Воронкой
            </Link>
          </div>

          {/*
            What needs attention, not what looks good. An unworked enquiry and
            an overdue callback are the two ways this studio actually loses a
            customer, so they lead — and they are warnings only when the number
            is not zero.
          */}
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}
          >
            <Stat
              label="Без ответственного"
              value={crm.unassigned}
              tone={crm.unassigned > 0 ? 'warn' : 'ok'}
              href="/admin/leads?assignee=none"
              hint="Заявка, за которую никто не взялся"
            />
            <Stat
              label="Без движения больше 5 дней"
              value={crm.stale}
              tone={crm.stale > 0 ? 'warn' : 'ok'}
              href="/admin/leads/board"
            />
            <Stat
              label="Просроченных задач"
              value={crm.overdueTasks}
              tone={crm.overdueTasks > 0 ? 'warn' : 'ok'}
              href="/admin/leads"
            />
            <Stat
              label="Новых за неделю"
              value={crm.newThisWeek}
              tone="info"
              href="/admin/leads"
              hint={`Сегодня — ${crm.newToday}`}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  href,
  tone,
}: {
  label: string;
  value: number;
  hint?: string;
  href: string;
  tone: 'ok' | 'warn' | 'info';
}) {
  const tones = {
    ok: 'border-line',
    warn: 'border-[oklch(0.86_0.09_85)] bg-[oklch(0.98_0.03_85)]',
    info: 'border-[oklch(0.86_0.05_240)] bg-[oklch(0.98_0.02_240)]',
  } as const;

  return (
    <Link
      href={href}
      className={`bg-surface hover:border-accent block rounded-[--radius-card] border p-4 transition-colors duration-[--duration-fast] ${tones[tone]}`}
    >
      <div className="font-display text-[32px] leading-none">{value}</div>
      <div className="text-ink-muted mt-2 text-[13px] leading-snug">{label}</div>
      {hint ? <div className="text-ink-faint mt-1 text-[12px] leading-snug">{hint}</div> : null}
    </Link>
  );
}
