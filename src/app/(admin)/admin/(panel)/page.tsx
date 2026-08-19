import Link from 'next/link';

import { listDocuments } from '@/data/admin/documents';
import { getCrmSummary } from '@/data/admin/leads';
import { countPlaceholderMedia } from '@/data/admin/media';
import { getSiteSettings } from '@/data/public/settings';
import { pageLabel } from '@/features/admin/page-labels';
import { can, requireUser } from '@/lib/auth/guards';

export const metadata = { title: 'Обзор' };

/**
 * Dashboard.
 *
 * Shows what is *unfinished* rather than vanity totals, and in the order the
 * day actually runs: today's enquiries first, the launch checklist second.
 * The reverse made sense while nothing was live and stopped making sense the
 * moment the site went up.
 *
 * Each block is gated on the capability that lets someone act on it, not on
 * their job title. The settings tile in particular linked a content editor to
 * a 404 — the screen behind it needs `settings.write`.
 */
export default async function AdminDashboard() {
  const { user } = await requireUser();

  const [canSeeLeads, canWriteContent, canWriteSettings] = await Promise.all([
    can('crm.read'),
    can('content.write'),
    can('settings.write'),
  ]);

  const [pages, projects, settings, placeholders, crm] = await Promise.all([
    canWriteContent ? listDocuments('page') : Promise.resolve([]),
    canWriteContent ? listDocuments('project') : Promise.resolve([]),
    canWriteSettings ? getSiteSettings() : Promise.resolve(null),
    canWriteContent ? countPlaceholderMedia() : Promise.resolve(0),
    canSeeLeads ? getCrmSummary(user.id) : Promise.resolve(null),
  ]);

  const unpublished = pages
    .concat(projects)
    .filter((doc) => doc.locales.some((locale) => locale.hasUnpublishedChanges));

  /**
   * "Before the launch" stops being true after the launch.
   *
   * A published page is the signal: it is the one thing that cannot be true
   * before the site is up, and it is already loaded here.
   */
  const launched = pages.some((page) =>
    page.locales.some((locale) => locale.status === 'published'),
  );

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-[32px] leading-tight">Обзор</h1>
        <p className="text-ink-soft mt-2 text-[14px]">
          {canSeeLeads
            ? 'Что требует внимания сегодня.'
            : launched
              ? 'Состояние сайта.'
              : 'Что нужно доделать перед публичным запуском.'}
        </p>
      </div>

      {crm ? (
        <section>
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <h2 className="font-display text-[20px]">Что требует внимания сегодня</h2>
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

      {canWriteContent ? (
        <section>
          <h2 className="font-display mb-3 text-[20px]">
            {launched ? 'Состояние сайта' : 'Перед запуском'}
          </h2>
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
            {settings ? (
              <Stat
                label="Настроек без значения"
                value={settings.pendingReview.length}
                tone={settings.pendingReview.length > 0 ? 'warn' : 'ok'}
                href="/admin/settings"
                hint="Соцсети, адрес, реквизиты, аналитика"
              />
            ) : null}
            <Stat
              label="Страниц с неопубликованными правками"
              value={unpublished.length}
              tone={unpublished.length > 0 ? 'info' : 'ok'}
              href="/admin/pages"
            />
            <Stat
              label="Работ в портфолио"
              value={projects.length}
              tone={projects.length === 0 ? 'warn' : 'ok'}
              href="/admin/portfolio"
              hint={projects.length === 0 ? 'Раздел «Наши работы» пока пуст' : undefined}
            />
          </div>
        </section>
      ) : null}

      {/*
        Only what has something outstanding.
        The full list of ten pages was a second, worse copy of /admin/pages, and
        the tile above already says how many are affected.
      */}
      {canWriteContent && unpublished.length > 0 ? (
        <section>
          <h2 className="font-display mb-3 text-[20px]">Ждут публикации</h2>
          <ul className="border-line divide-line bg-surface divide-y rounded-[--radius-card] border">
            {unpublished.map((doc) => (
              <li key={doc.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Link
                  href={`/admin/${doc.kind === 'project' ? 'portfolio' : 'pages'}/${doc.id}`}
                  className="text-ink hover:text-accent flex-1 text-[15px] font-medium"
                >
                  {pageLabel(
                    doc.seedKey,
                    doc.locales.find((locale) => locale.locale === 'ru')?.slug ?? doc.template,
                  )}
                </Link>
                <div className="flex gap-1.5">
                  {doc.locales
                    .filter((locale) => locale.hasUnpublishedChanges)
                    .map((locale) => (
                      <span
                        key={locale.locale}
                        title={`${locale.locale}: есть неопубликованные правки`}
                        className="bg-warning-surface text-warning-ink rounded-[--radius-btn] px-2 py-0.5 text-[11px] tracking-wide uppercase"
                      >
                        {locale.locale}
                      </span>
                    ))}
                </div>
              </li>
            ))}
          </ul>
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
    warn: 'border-warning-line bg-warning-surface',
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
