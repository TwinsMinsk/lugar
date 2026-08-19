'use client';

import { archiveLead, deleteLead, restoreLead } from '@/app/(admin)/admin/_actions/leads';
import { buttonClasses } from '@/components/ui/button';
import { ConfirmButton, InlineConfirm } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useAction } from './use-action';

/** Only what this screen says better than the shared vocabulary. */
const ERRORS = {
  not_found: 'Заявка не найдена — возможно, её уже убрали.',
  not_archived: 'Сначала уберите заявку в архив.',
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
  const { isBusy, error, status, run } = useAction(ERRORS);

  return (
    <span className="flex flex-wrap items-center gap-2">
      {archived ? (
        <>
          <button
            type="button"
            disabled={isBusy()}
            onClick={() =>
              run(() => restoreLead(leadId), { success: 'Заявка вернулась в работу.' })
            }
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
              disabled={isBusy()}
              onConfirm={() => run(() => deleteLead(leadId), { success: 'Заявка удалена.' })}
            />
          ) : null}
        </>
      ) : (
        <InlineConfirm
          label="Убрать"
          question="Убрать заявку в архив?"
          confirmLabel="Убрать"
          disabled={isBusy()}
          onConfirm={() => run(() => archiveLead(leadId), { success: 'Заявка убрана в архив.' })}
        />
      )}

      <span role="status" className="text-ink-muted text-[12px]">
        {status}
      </span>
      <span role="alert" className="text-[12px] text-[oklch(0.52_0.17_25)]">
        {error}
      </span>
    </span>
  );
}
