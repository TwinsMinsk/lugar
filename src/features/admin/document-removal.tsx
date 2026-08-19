'use client';

import {
  archiveDocument,
  purgeDocument,
  restoreDocument,
} from '@/app/(admin)/admin/_actions/removal';
import { buttonClasses } from '@/components/ui/button';
import { ConfirmButton, InlineConfirm } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useAction } from './use-action';

/** Only what this screen says better than the shared vocabulary. */
const ERRORS = {
  not_found: 'Запись не найдена — возможно, её уже убрали.',
  system_document: 'Это одна из постоянных страниц сайта: её можно только снять с сайта.',
  not_archived: 'Сначала уберите запись в архив.',
  was_published: 'Запись была на сайте, поэтому её история сохраняется. Она остаётся в архиве.',
};

// Full sentences per kind rather than a noun slotted into one template: the
// two words have different genders, and "проект убрана" is the kind of detail
// that makes an interface feel machine-written.
const WORDING = {
  project: {
    accusative: 'проект',
    archived: 'Проект убран в архив и снят с сайта.',
    restored: 'Проект вернулся в список. На сайт не вернулся — опубликуйте отдельно.',
    purged: 'Проект удалён навсегда.',
    purgeBody: 'Проект и все его черновики будут стёрты из базы. Отменить это нельзя.',
  },
  page: {
    accusative: 'страницу',
    archived: 'Страница убрана в архив и снята с сайта.',
    restored: 'Страница вернулась в список. На сайт не вернулась — опубликуйте отдельно.',
    purged: 'Страница удалена навсегда.',
    purgeBody: 'Страница и все её черновики будут стёрты из базы. Отменить это нельзя.',
  },
} as const;

/**
 * Removal controls for one document, in either list.
 *
 * The two levels are deliberately never offered at once: "убрать" lives on the
 * working list, "удалить навсегда" only inside the archive. A record that has
 * been on the site shows the reason in place of the second button rather than
 * a disabled control — a greyed-out button that never explains itself just gets
 * clicked repeatedly.
 */
export function DocumentRemoval({
  documentId,
  kind,
  isSystem,
  archived,
  everPublished,
}: {
  documentId: string;
  kind: 'page' | 'project';
  isSystem: boolean;
  archived: boolean;
  everPublished: boolean;
}) {
  const { isBusy, error, status, run } = useAction(ERRORS);
  const wording = WORDING[kind];

  return (
    <span className="flex flex-wrap items-center justify-end gap-2">
      {isSystem ? (
        <span className="text-ink-faint text-[12px]">постоянная страница</span>
      ) : archived ? (
        <>
          <button
            type="button"
            disabled={isBusy()}
            onClick={() => run(() => restoreDocument(documentId), { success: wording.restored })}
            className={cn(buttonClasses('ghost', 'sm'), 'text-[12px]')}
          >
            Вернуть
          </button>

          {everPublished ? (
            <span className="text-ink-faint text-[12px]">была на сайте — остаётся в архиве</span>
          ) : (
            <ConfirmButton
              label="Удалить навсегда"
              title="Удалить навсегда?"
              description={
                <>{wording.purgeBody} Адрес освободится, и его можно будет занять заново.</>
              }
              disabled={isBusy()}
              onConfirm={() => run(() => purgeDocument(documentId), { success: wording.purged })}
            />
          )}
        </>
      ) : (
        <InlineConfirm
          label="Убрать"
          question={`Убрать ${wording.accusative} из списка?`}
          confirmLabel="Убрать"
          disabled={isBusy()}
          onConfirm={() => run(() => archiveDocument(documentId), { success: wording.archived })}
        />
      )}

      {/* Always mounted: an area inserted together with its text is not
          announced by screen readers. */}
      <span role="status" className="text-ink-muted text-[12px]">
        {status}
      </span>
      <span role="alert" className="text-[12px] text-[oklch(0.52_0.17_25)]">
        {error}
      </span>
    </span>
  );
}
