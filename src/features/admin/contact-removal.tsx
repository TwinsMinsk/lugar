'use client';

import {
  archiveContact,
  deleteContact,
  restoreContact,
} from '@/app/(admin)/admin/_actions/contacts';
import { buttonClasses } from '@/components/ui/button';
import { ConfirmButton, InlineConfirm } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useAction } from './use-action';

/** Only what this screen says better than the shared vocabulary. */
const ERRORS = {
  not_found: 'Клиент не найден — возможно, его уже убрали.',
  not_archived: 'Сначала уберите клиента в архив.',
  has_active_leads: 'У клиента есть заявки в работе. Уберите сначала их.',
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
  const { isBusy, error, status, run } = useAction(ERRORS);

  return (
    <span className="flex flex-wrap items-center justify-end gap-2">
      {archived ? (
        <>
          <button
            type="button"
            disabled={isBusy()}
            onClick={() =>
              run(() => restoreContact(contactId), { success: 'Клиент вернулся в список.' })
            }
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
              disabled={isBusy()}
              onConfirm={() => run(() => deleteContact(contactId), { success: 'Клиент удалён.' })}
            />
          ) : null}
        </>
      ) : (
        <InlineConfirm
          label="Убрать"
          question="Убрать клиента в архив?"
          confirmLabel="Убрать"
          disabled={isBusy()}
          onConfirm={() =>
            run(() => archiveContact(contactId), { success: 'Клиент убран в архив.' })
          }
        />
      )}

      <span role="status" className="text-ink-muted text-[12px]">
        {status}
      </span>
      <span role="alert" className="text-danger text-[12px]">
        {error}
      </span>
    </span>
  );
}
