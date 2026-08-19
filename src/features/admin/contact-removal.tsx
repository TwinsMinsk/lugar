'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import {
  archiveContact,
  deleteContact,
  restoreContact,
  type ContactResult,
} from '@/app/(admin)/admin/_actions/contacts';
import { buttonClasses } from '@/components/ui/button';
import { ConfirmButton, InlineConfirm } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const ERRORS: Record<string, string> = {
  invalid_input: 'Не удалось разобрать запрос. Обновите страницу и попробуйте снова.',
  not_found: 'Клиент не найден — возможно, его уже убрали.',
  not_archived: 'Сначала уберите клиента в архив.',
  has_active_leads: 'У клиента есть заявки в работе. Уберите сначала их.',
  unexpected: 'Не получилось. Попробуйте ещё раз.',
};

/** Removal controls for one client. Same two levels as everywhere else. */
export function ContactRemoval({
  contactId,
  archived,
  canDelete,
}: {
  contactId: string;
  archived: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState('');

  function run(action: () => Promise<ContactResult>, success: string) {
    setMessage('');
    startTransition(async () => {
      let result: ContactResult;
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
    <span className="flex flex-wrap items-center justify-end gap-2">
      {archived ? (
        <>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => restoreContact(contactId), 'Клиент вернулся в список.')}
            className={cn(buttonClasses('ghost', 'sm'), 'text-[12px]')}
          >
            Вернуть
          </button>
          {canDelete ? (
            <ConfirmButton
              label="Удалить"
              title="Удалить клиента?"
              description={
                <>
                  Карточка исчезнет из CRM. Согласия на связь сохранятся — это запись о том, на что
                  человек согласился, и стирать её нельзя.
                </>
              }
              disabled={pending}
              onConfirm={() => run(() => deleteContact(contactId), 'Клиент удалён.')}
            />
          ) : null}
        </>
      ) : (
        <InlineConfirm
          label="Убрать"
          question="Убрать клиента в архив?"
          confirmLabel="Убрать"
          disabled={pending}
          onConfirm={() => run(() => archiveContact(contactId), 'Клиент убран в архив.')}
        />
      )}

      <span role="status" className="text-ink-muted text-[12px]">
        {message}
      </span>
    </span>
  );
}
