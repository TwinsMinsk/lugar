import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getContact } from '@/data/admin/contacts';
import { ContactEditor } from '@/features/admin/contact-editor';
import { requireCapability } from '@/lib/auth/guards';
import { telLink } from '@/lib/routes';

export const metadata = { title: 'Клиент' };

const PURPOSE_LABEL: Record<string, string> = {
  personal_data: 'Обработка персональных данных',
  whatsapp_contact: 'Переписка в WhatsApp',
  marketing: 'Маркетинговые сообщения',
};

const STAGE_LABEL: Record<string, string> = {
  measuring: 'Замер',
  design: 'Проектирование',
  production: 'Производство',
  installation: 'Монтаж',
  done: 'Завершён',
};

const dateTime = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Madrid',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const dateOnly = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Madrid',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCapability('crm.read');

  const { id } = await params;
  const contact = await getContact(id);
  if (!contact) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/contacts" className="text-ink-faint hover:text-accent text-[13px]">
          ← Все клиенты
        </Link>
        <h1 className="font-display mt-1 text-[32px] leading-tight">
          {contact.fullName ?? 'Без имени'}
        </h1>
        <p className="text-ink-faint mt-1 text-[13px]">
          <a href={telLink(contact.phoneE164)} className="hover:text-accent font-mono">
            {contact.phoneE164}
          </a>
          {' · '}
          язык обращения {contact.preferredLocale.toUpperCase()}
          {' · '}в базе с {dateOnly.format(contact.createdAt)}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-6">
          <section className="border-line bg-surface rounded-[--radius-card] border p-4">
            <h2 className="font-display mb-3 text-[19px]">
              Обращения <span className="text-ink-faint text-[15px]">{contact.leads.length}</span>
            </h2>

            {contact.leads.length === 0 ? (
              <p className="text-ink-faint text-[13px]">Заявок нет.</p>
            ) : (
              <ul className="divide-line divide-y">
                {contact.leads.map((lead) => (
                  <li key={lead.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                    <Link
                      href={`/admin/leads/${lead.id}`}
                      className="text-ink hover:text-accent font-mono text-[13px]"
                    >
                      {lead.publicId}
                    </Link>
                    <span className="text-ink-faint w-[130px] text-[12px]">
                      {dateOnly.format(lead.createdAt)}
                    </span>
                    <span className="text-ink-soft min-w-[140px] flex-1 text-[13px]">
                      {lead.service ?? '—'}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-[13px]">
                      <span
                        aria-hidden
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: lead.statusColor }}
                      />
                      {lead.statusLabel.ru ?? '—'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {contact.projects.length > 0 ? (
            <section className="border-line bg-surface rounded-[--radius-card] border p-4">
              <h2 className="font-display mb-3 text-[19px]">Проекты</h2>
              <ul className="divide-line divide-y">
                {contact.projects.map((project) => (
                  <li key={project.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <span className="text-ink-faint font-mono text-[12px]">{project.code}</span>
                    <span className="text-ink min-w-[160px] flex-1 text-[14px]">
                      {project.title}
                    </span>
                    <span className="text-ink-soft text-[13px]">
                      {STAGE_LABEL[project.stage] ?? project.stage}
                    </span>
                    {project.contractValueEur !== null ? (
                      <span className="text-ink-soft text-[13px]">
                        {project.contractValueEur.toLocaleString('ru-RU')} €
                      </span>
                    ) : null}
                    {project.dueAt ? (
                      <span className="text-ink-faint text-[12px]">
                        срок {dateOnly.format(project.dueAt)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="border-line bg-surface rounded-[--radius-card] border p-4">
            <h2 className="font-display mb-3 text-[19px]">Данные клиента</h2>
            <ContactEditor
              contactId={contact.id}
              fullName={contact.fullName}
              email={contact.email}
              city={contact.city}
              notes={contact.notes}
            />
            <p className="text-ink-faint mt-3 text-[12px] leading-snug">
              Телефон изменить нельзя: по нему система узнаёт человека и связывает с ним входящие
              сообщения. Если номер другой — это другой клиент.
            </p>
          </section>
        </div>

        <div className="flex flex-col gap-6">
          <section className="border-line bg-surface rounded-[--radius-card] border p-4">
            <h2 className="font-display mb-3 text-[19px]">WhatsApp</h2>
            <p className="text-ink-soft text-[13px]">
              {contact.waOptIn
                ? 'Клиент согласился на переписку.'
                : 'Согласия на переписку нет — можно позвонить или написать на email.'}
            </p>
            <p className="text-ink-faint mt-2 text-[12px]">
              Сообщений в истории: {contact.messageCount}
              {contact.lastInboundAt
                ? ` · последнее от клиента ${dateTime.format(contact.lastInboundAt)}`
                : ' · входящих не было'}
            </p>
            {contact.leads.length > 0 ? (
              <Link
                href={`/admin/leads/${contact.leads[0]!.id}`}
                className="text-accent mt-2 inline-block text-[13px] underline underline-offset-2"
              >
                Открыть переписку в последней заявке
              </Link>
            ) : null}
          </section>

          <section className="border-line bg-surface rounded-[--radius-card] border p-4">
            <h2 className="font-display mb-3 text-[19px]">Согласия</h2>
            {/*
              The whole trail, not a current flag.

              Under GDPR the question is what this person agreed to, when, and
              against which version of the text. A single checkbox cannot answer
              that, and it is not editable here at any level: a withdrawal is a
              new record, never an edit of an old one.
            */}
            {contact.consents.length === 0 ? (
              <p className="text-ink-faint text-[13px]">Записей нет.</p>
            ) : (
              <ul className="divide-line divide-y">
                {contact.consents.map((consent) => (
                  <li key={consent.id} className="py-2">
                    <div className="text-ink text-[13px]">
                      {PURPOSE_LABEL[consent.purpose] ?? consent.purpose}
                      <span
                        className={
                          consent.granted
                            ? 'ml-2 text-[11px] text-[oklch(0.42_0.08_150)]'
                            : 'ml-2 text-[11px] text-[oklch(0.52_0.17_25)]'
                        }
                      >
                        {consent.granted ? 'дано' : 'отозвано'}
                      </span>
                    </div>
                    <div className="text-ink-faint text-[12px]">
                      {dateTime.format(consent.createdAt)} · редакция {consent.policyVersion}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
