'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import {
  cancelOutboxMessage,
  requeueOutboxMessage,
  sendWhatsAppTemplate,
  sendWhatsAppText,
} from '@/app/(admin)/admin/_actions/whatsapp';
import { buttonClasses } from '@/components/ui/button';
import { InlineConfirm } from '@/components/ui/dialog';
import type { ApprovedTemplate } from '@/data/admin/whatsapp';
import { cn } from '@/lib/utils';

export type ThreadItem = {
  id: string;
  direction: 'inbound' | 'outbound';
  body: string | null;
  messageType: string;
  templateName: string | null;
  status: string | null;
  occurredAt: string;
};

export type PendingItem = {
  id: string;
  status: string;
  bodyText: string | null;
  templateName: string | null;
  lastErrorMessage: string | null;
  attemptCount: number;
};

const ERRORS: Record<string, string> = {
  window_closed: 'Окно 24 часа закрылось, пока сообщение набиралось. Выберите шаблон.',
  no_consent: 'Клиент не давал согласия на переписку в WhatsApp.',
  not_configured: 'WhatsApp не подключён — доступна только ссылка для ответа с телефона.',
  not_found: 'Заявка не найдена.',
  not_dead: 'Это сообщение ещё в очереди — повторять не нужно.',
  invalid_input: 'Проверьте текст сообщения.',
};

const PENDING_LABEL: Record<string, string> = {
  pending: 'в очереди',
  claimed: 'отправляется',
  failed_retryable: 'повтор после ошибки',
  blocked_window: 'вне окна — нужен шаблон',
  needs_review: 'требует проверки',
  dead: 'не доставлено',
};

const time = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Madrid',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export function WhatsAppPanel({
  leadId,
  thread,
  pending,
  windowOpen,
  closesAt,
  canSend,
  canRequeue,
  templates,
  handoffUrl,
  waOptIn,
}: {
  leadId: string;
  thread: ThreadItem[];
  pending: PendingItem[];
  windowOpen: boolean;
  closesAt: string | null;
  canSend: boolean;
  canRequeue: boolean;
  templates: ApprovedTemplate[];
  handoffUrl: string;
  waOptIn: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [templateName, setTemplateName] = useState(templates[0]?.name ?? '');
  const [busy, startTransition] = useTransition();

  const chosen = templates.find((template) => template.name === templateName);

  function run(action: () => Promise<{ ok: boolean; error?: string }>, onDone?: () => void) {
    startTransition(async () => {
      setError(null);
      const result = await action();
      if (!result.ok) {
        setError(ERRORS[result.error ?? ''] ?? result.error ?? 'Ошибка');
        return;
      }
      onDone?.();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {thread.length === 0 && pending.length === 0 ? (
        <p className="text-ink-faint text-[13px]">Переписки пока нет.</p>
      ) : (
        <ul className="flex max-h-[320px] flex-col gap-2 overflow-y-auto">
          {thread.map((message) => (
            <li
              key={message.id}
              className={cn(
                'rounded-[--radius-card] border p-2.5 text-[13px]',
                message.direction === 'inbound'
                  ? 'border-line bg-surface-muted/60'
                  : 'border-[oklch(0.88_0.05_150)] bg-[oklch(0.98_0.02_150)]',
              )}
            >
              <div className="text-ink-faint mb-0.5 flex items-center gap-2 text-[11px]">
                <span>{message.direction === 'inbound' ? 'Клиент' : 'Мы'}</span>
                <span>{time.format(new Date(message.occurredAt))}</span>
                {message.status ? <span>{message.status}</span> : null}
              </div>
              <div className="text-ink whitespace-pre-wrap">
                {message.body ??
                  (message.templateName
                    ? `Шаблон: ${message.templateName}`
                    : `[${message.messageType}]`)}
              </div>
            </li>
          ))}
        </ul>
      )}

      {pending.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {pending.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center gap-2 rounded-[--radius-btn] border border-[oklch(0.88_0.06_85)] bg-[oklch(0.98_0.02_85)] px-2 py-1.5 text-[12px]"
            >
              <span className="text-ink-muted">
                {PENDING_LABEL[item.status] ?? item.status}
                {item.attemptCount > 0 ? ` · попыток ${item.attemptCount}` : ''}
              </span>
              <span className="text-ink-faint flex-1 truncate">
                {item.bodyText ?? item.templateName ?? ''}
              </span>
              {item.lastErrorMessage ? (
                <span className="text-ink-faint w-full">{item.lastErrorMessage}</span>
              ) : null}
              {canRequeue && (item.status === 'dead' || item.status === 'blocked_window') ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run(() => requeueOutboxMessage(item.id))}
                    className={cn(buttonClasses('ghost', 'sm'), 'text-[12px]')}
                  >
                    Повторить
                  </button>
                  {/* The other half of the decision. Until now the only way out
                      of this state was to retry a message that should not go —
                      the customer was already called, or the alert is stale. */}
                  <InlineConfirm
                    label="Не отправлять"
                    question="Отменить отправку?"
                    confirmLabel="Не отправлять"
                    disabled={busy}
                    onConfirm={() => run(() => cancelOutboxMessage(item.id))}
                  />
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p role="alert" className="text-[13px] text-[oklch(0.52_0.17_25)]">
          {error}
        </p>
      ) : null}

      {!waOptIn ? (
        <p className="text-ink-faint text-[12px] leading-snug">
          Клиент не давал согласия на переписку в WhatsApp. Позвоните или напишите на email.
        </p>
      ) : !canSend ? (
        <div className="flex flex-col gap-2">
          <p className="text-ink-faint text-[12px] leading-snug">
            WhatsApp Business API не подключён. Ответить можно со своего телефона — история
            переписки тогда не попадёт в карточку.
          </p>
          <a
            href={handoffUrl}
            target="_blank"
            rel="noopener"
            className={cn(buttonClasses('outline', 'sm'), 'text-center text-[13px]')}
          >
            Открыть в WhatsApp ↗
          </a>
        </div>
      ) : windowOpen ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            run(
              () => sendWhatsAppText({ leadId, body }),
              () => setBody(''),
            );
          }}
        >
          <label htmlFor="wa-body" className="text-ink-muted text-[12px] font-medium">
            Ответ в WhatsApp
          </label>
          <textarea
            id="wa-body"
            required
            rows={3}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className="border-line-strong bg-surface focus:border-accent w-full resize-y rounded-[--radius-btn] border px-3 py-2 text-[14px] outline-none"
          />
          {closesAt ? (
            <p className="text-ink-faint text-[11px]">
              Свободный текст можно отправлять до {time.format(new Date(closesAt))} — 24 часа с
              последнего сообщения клиента.
            </p>
          ) : null}
          <button
            type="submit"
            disabled={busy || body.trim() === ''}
            className={buttonClasses('primary', 'sm')}
          >
            {busy ? 'Ставим в очередь…' : 'Отправить'}
          </button>
        </form>
      ) : (
        /*
          The composer is replaced, not disabled.

          A greyed-out textarea invites the operator to write a message they
          cannot send and gives no way forward. Outside the window an approved
          template is the only legal option, so that is what the panel offers —
          alongside the link to answer from a personal phone.
        */
        <div className="flex flex-col gap-2">
          <p className="text-ink-muted text-[12px] leading-snug">
            Прошло больше 24 часов с последнего сообщения клиента. Свободный текст Meta не пропустит
            — можно отправить только одобренный шаблон.
          </p>

          {templates.length === 0 ? (
            <p className="text-ink-faint text-[12px] leading-snug">
              Одобренных шаблонов нет. Их создают и подают на проверку в кабинете Meta; пока их нет,
              ответить можно со своего телефона.
            </p>
          ) : (
            <form
              className="flex flex-col gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!chosen) return;
                run(() =>
                  sendWhatsAppTemplate({
                    leadId,
                    name: chosen.name,
                    language: chosen.language,
                  }),
                );
              }}
            >
              <label htmlFor="wa-template" className="text-ink-muted text-[12px] font-medium">
                Шаблон
              </label>
              <select
                id="wa-template"
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                className="border-line-strong bg-surface w-full rounded-[--radius-btn] border px-3 py-2 text-[14px]"
              >
                {templates.map((template) => (
                  <option key={`${template.name}:${template.language}`} value={template.name}>
                    {template.name} ({template.language})
                  </option>
                ))}
              </select>

              {/* What will actually be sent, so nobody sends a template blind. */}
              {chosen ? (
                <p className="text-ink-faint rounded-[--radius-btn] border border-dashed px-2 py-1.5 text-[12px] whitespace-pre-wrap">
                  {chosen.body}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={busy || !chosen || chosen.variableCount > 0}
                className={buttonClasses('primary', 'sm')}
              >
                {busy ? 'Ставим в очередь…' : 'Отправить шаблон'}
              </button>

              {chosen && chosen.variableCount > 0 ? (
                <p className="text-ink-faint text-[11px] leading-snug">
                  В этом шаблоне есть подстановки — отправка таких пока не поддерживается здесь.
                </p>
              ) : null}
            </form>
          )}

          <a
            href={handoffUrl}
            target="_blank"
            rel="noopener"
            className={cn(buttonClasses('outline', 'sm'), 'text-center text-[13px]')}
          >
            Ответить со своего телефона ↗
          </a>
        </div>
      )}
    </div>
  );
}
