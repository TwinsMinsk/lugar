import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getLead, listAssignees, listLeadStatuses } from '@/data/admin/leads';
import { getSiteSettings } from '@/data/public/settings';
import { LeadActions } from '@/features/admin/lead-actions';
import { requireCapability } from '@/lib/auth/guards';
import { telLink, whatsappLink } from '@/lib/routes';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Заявка' };

const ACTIVITY_LABEL: Record<string, string> = {
  form_submitted: 'Заявка с сайта',
  status_changed: 'Статус изменён',
  assigned: 'Назначен ответственный',
  note: 'Заметка',
  task_created: 'Задача создана',
  task_completed: 'Задача выполнена',
  file_added: 'Файл добавлен',
  wa_out: 'WhatsApp — исходящее',
  wa_in: 'WhatsApp — входящее',
  wa_status: 'WhatsApp — статус',
  email_out: 'Письмо отправлено',
  call: 'Звонок',
  exported: 'Выгружено',
};

const dateTime = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Madrid',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div>
      <dt className="text-ink-faint text-[12px]">{label}</dt>
      <dd className="text-ink text-[14px]">{value}</dd>
    </div>
  );
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCapability('crm.read');

  const { id } = await params;
  const lead = await getLead(id);
  if (!lead) notFound();

  const [statuses, assignees, settings] = await Promise.all([
    listLeadStatuses(),
    listAssignees(),
    getSiteSettings(),
  ]);

  const attribution = Object.entries({
    Источник: lead.attribution.utmSource,
    Канал: lead.attribution.utmMedium,
    Кампания: lead.attribution.utmCampaign,
    Объявление: lead.attribution.utmContent,
    'Ключевое слово': lead.attribution.utmTerm,
    Реферер: lead.attribution.referrer,
    'Первая страница': lead.attribution.landingFirst,
    'Последняя страница': lead.attribution.landingLast,
    'Откуда отправлено': lead.pageContext,
    Блок: lead.blockContext,
    Проект: lead.projectSlug,
  }).filter(([, value]) => value);

  const greeting = `Здравствуйте! Вы оставили заявку на сайте LUGAR (${lead.publicId}).`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/leads" className="text-ink-faint hover:text-accent text-[13px]">
          ← Все заявки
        </Link>
        <h1 className="font-display mt-1 text-[32px] leading-tight">
          {lead.contact.fullName ?? 'Без имени'}
          <span className="text-ink-faint ml-3 font-mono text-[18px]">{lead.publicId}</span>
        </h1>
        <p className="text-ink-faint mt-1 text-[13px]">
          Поступила {dateTime.format(lead.createdAt)} · язык обращения {lead.locale.toUpperCase()}
        </p>
      </div>

      {lead.duplicateOf ? (
        <p className="rounded-[--radius-card] border border-[oklch(0.86_0.09_85)] bg-[oklch(0.97_0.04_85)] px-3 py-2 text-[13px]">
          Похоже на повторное обращение.{' '}
          <Link
            href={`/admin/leads/${lead.duplicateOf.id}`}
            className="text-accent underline underline-offset-2"
          >
            Предыдущая заявка {lead.duplicateOf.publicId}
          </Link>
          . Заявки намеренно не объединяются автоматически — решайте сами.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-6">
          <section className="border-line bg-surface rounded-[--radius-card] border p-4">
            <h2 className="font-display mb-3 text-[19px]">Обращение</h2>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Field label="Что нужно" value={lead.service} />
              <Field label="Город" value={lead.city} />
              <Field label="Бюджет" value={lead.budgetBand} />
            </dl>
            {lead.comment ? (
              <div className="mt-3">
                <div className="text-ink-faint text-[12px]">Комментарий клиента</div>
                <p className="text-ink mt-1 text-[14px] whitespace-pre-wrap">{lead.comment}</p>
              </div>
            ) : null}
            {lead.files.length > 0 ? (
              <div className="mt-3">
                <div className="text-ink-faint text-[12px]">Файлы</div>
                <ul className="text-ink mt-1 text-[13px]">
                  {lead.files.map((file) => (
                    <li key={file.id}>
                      {file.originalFilename ?? file.id} · {Math.round(file.sizeBytes / 1024)} КБ
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          <section className="border-line bg-surface rounded-[--radius-card] border p-4">
            <h2 className="font-display mb-3 text-[19px]">История</h2>
            <ul className="divide-line divide-y">
              {lead.activities.map((activity) => (
                <li key={activity.id} className="flex flex-wrap gap-x-3 gap-y-1 py-2.5">
                  <time
                    dateTime={activity.occurredAt.toISOString()}
                    className="text-ink-faint w-[130px] flex-none font-mono text-[12px]"
                  >
                    {dateTime.format(activity.occurredAt)}
                  </time>
                  <div className="min-w-[200px] flex-1">
                    <div className="text-ink text-[13px]">
                      {ACTIVITY_LABEL[activity.kind] ?? activity.kind}
                    </div>
                    {activity.body ? (
                      <p className="text-ink-soft mt-0.5 text-[13px] whitespace-pre-wrap">
                        {activity.body}
                      </p>
                    ) : null}
                    {activity.payload && Object.keys(activity.payload).length > 0 ? (
                      <p className="text-ink-faint mt-0.5 font-mono text-[12px]">
                        {Object.entries(activity.payload as Record<string, unknown>)
                          .filter(([, value]) => value !== null && value !== undefined)
                          .map(([key, value]) => `${key}: ${String(value)}`)
                          .join(', ')}
                      </p>
                    ) : null}
                  </div>
                  <span className="text-ink-faint w-[180px] flex-none text-[12px]">
                    {activity.actorEmail ?? (activity.actorType === 'system' ? 'система' : '')}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="flex flex-col gap-6">
          <section className="border-line bg-surface rounded-[--radius-card] border p-4">
            <h2 className="font-display mb-3 text-[19px]">Клиент</h2>
            <dl className="flex flex-col gap-3">
              <Field
                label="Телефон"
                value={
                  <a href={telLink(lead.contact.phoneE164)} className="hover:text-accent font-mono">
                    {lead.contact.phoneE164}
                  </a>
                }
              />
              <Field label="Email" value={lead.contact.email} />
              <Field label="Город" value={lead.contact.city} />
            </dl>

            <div className="mt-4 flex flex-col gap-2">
              {settings.contact.whatsappNumber ? (
                <a
                  href={whatsappLink(lead.contact.phoneE164.replace(/\D/g, ''), greeting)}
                  target="_blank"
                  rel="noopener"
                  className={cn(
                    'border-line-strong hover:border-accent hover:text-accent rounded-[--radius-btn] border px-3 py-2 text-center text-[13px]',
                  )}
                >
                  Написать в WhatsApp ↗
                </a>
              ) : null}

              {/*
                Consent is shown as a fact, not as a switch. Whether this person
                agreed to be contacted on WhatsApp was decided by them, on the
                form, and staff must not be able to flip it here.
              */}
              <p className="text-ink-faint text-[12px] leading-snug">
                {lead.contact.waOptIn
                  ? 'Клиент согласился на переписку в WhatsApp.'
                  : 'Согласия на WhatsApp нет — можно только позвонить или написать на email.'}
              </p>
            </div>
          </section>

          <section className="border-line bg-surface rounded-[--radius-card] border p-4">
            <h2 className="font-display mb-3 text-[19px]">Работа с заявкой</h2>
            <LeadActions
              leadId={lead.id}
              statusId={lead.statusId}
              assignedToId={lead.assignedToId}
              statuses={statuses}
              assignees={assignees}
              tasks={lead.tasks.map((task) => ({
                id: task.id,
                title: task.title,
                dueAt: task.dueAt?.toISOString() ?? null,
                completedAt: task.completedAt?.toISOString() ?? null,
                assigneeEmail: task.assigneeEmail,
              }))}
            />
          </section>

          {attribution.length > 0 ? (
            <section className="border-line bg-surface rounded-[--radius-card] border p-4">
              <h2 className="font-display mb-3 text-[19px]">Откуда пришёл</h2>
              <dl className="flex flex-col gap-2">
                {attribution.map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-ink-faint text-[12px]">{label}</dt>
                    <dd className="text-ink font-mono text-[12px] break-all">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
