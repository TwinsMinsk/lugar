'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import {
  archiveLead,
  deleteLead,
  restoreLead,
  type LeadResult,
} from '@/app/(admin)/admin/_actions/leads';
import { buttonClasses } from '@/components/ui/button';
import { ConfirmButton, InlineConfirm } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const ERRORS: Record<string, string> = {
  invalid_input: 'Не удалось разобрать запрос. Обновите страницу и попробуйте снова.',
  not_found: 'Заявка не найдена — возможно, её уже убрали.',
  not_archived: 'Сначала уберите заявку в архив.',
  unexpected: 'Не получилось. Попробуйте ещё раз.',
};

/**
 * Removal controls for one lead.
 *
 * Archiving is `crm.write` — putting a finished enquiry aside is ordinary daily
 * work. Deleting is owner-only and lives in the archive, and even then it only
 * hides the row: the contact, the timeline and the consent records that
 * reference it all stay, because they are the business record.
 */
export function LeadRemoval({
  leadId,
  archived,
  canDelete,
}: {
  leadId: string;
  archived: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState('');

  function run(action: () => Promise<LeadResult>, success: string) {
    setMessage('');
    startTransition(async () => {
      let result: LeadResult;
      try {
        result = await action();
      } catch {
        setMessage(ERRORS.unexpected!);
        return;
      }
      if (!result.ok) {
        setMessage(ERRORS[result.error] ?? ERRORS.unexpected!);
        return;
      }
      setMessage(success);
      router.refresh();
    });
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      {archived ? (
        <>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => restoreLead(leadId), 'Заявка вернулась в работу.')}
            className={cn(buttonClasses('ghost', 'sm'), 'text-[12px]')}
          >
            Вернуть
          </button>
          {canDelete ? (
            <ConfirmButton
              label="Удалить"
              title="Удалить заявку?"
              description={
                <>
                  Заявка исчезнет из CRM. Клиент, переписка и согласия сохранятся — на них ссылается
                  история, и стирать их нельзя.
                </>
              }
              disabled={pending}
              onConfirm={() => run(() => deleteLead(leadId), 'Заявка удалена.')}
            />
          ) : null}
        </>
      ) : (
        <InlineConfirm
          label="Убрать"
          question="Убрать заявку в архив?"
          confirmLabel="Убрать"
          disabled={pending}
          onConfirm={() => run(() => archiveLead(leadId), 'Заявка убрана в архив.')}
        />
      )}

      <span role="status" className="text-ink-muted text-[12px]">
        {message}
      </span>
    </span>
  );
}
