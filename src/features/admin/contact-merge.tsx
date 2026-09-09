'use client';

import { useState } from 'react';

import { mergeContacts } from '@/app/(admin)/admin/_actions/contacts';
import { buttonClasses } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useAction } from './use-action';

/** Only what this screen says better than the shared vocabulary. */
const ERRORS = {
  phone_invalid: 'Проверьте номер — он должен быть настоящим телефонным номером.',
  merge_not_found: 'Клиента с таким номером нет. Проверьте номер на второй карточке.',
  same_contact: 'Это тот же самый клиент.',
  not_found: 'Карточка не найдена — возможно, её уже убрали.',
};

/**
 * Merging a duplicate into this card.
 *
 * The phone number is what the owner types, because it is what they are
 * looking at on the other card and what this CRM joins on. A picker listing
 * every contact would be the wrong shape for something done rarely against a
 * list that only grows.
 *
 * Deliberately a dialog with a confirmation sentence naming both sides: the
 * merge moves a person's whole history and soft-deletes the other card, and
 * there is no undo button for it. Naming the direction — what is kept, what
 * disappears — is the difference between a confirmation and a speed bump.
 */
export function ContactMerge({ contactId, phone }: { contactId: string; phone: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const { busy, error, status, run } = useAction(ERRORS);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(buttonClasses('ghost', 'sm'), 'text-[13px]')}
      >
        Объединить дубль
      </button>

      {/* Both areas stay mounted: one inserted together with its text is not
          announced by a screen reader. */}
      <span role="status" className="text-ink-muted text-[13px] empty:hidden">
        {status}
      </span>
      <span role="alert" className="text-danger text-[13px] empty:hidden">
        {error}
      </span>

      {open ? (
        <Modal label="Объединить дубль" onClose={() => setOpen(false)} className="max-w-[460px]">
          <form
            className="flex flex-col gap-3 p-5"
            onSubmit={(event) => {
              event.preventDefault();
              run(() => mergeContacts({ keepId: contactId, mergePhone: value }), {
                success: 'Карточки объединены.',
                onDone: () => {
                  setOpen(false);
                  setValue('');
                },
              });
            }}
          >
            <h2 className="font-display text-[19px]">Объединить дубль</h2>
            <p className="text-ink-soft text-[13px]">
              Заявки, переписка, задачи, проекты и согласия второй карточки перейдут сюда, на номер{' '}
              <span className="font-mono">{phone}</span>. Вторая карточка уйдёт из списка клиентов —
              вернуть её обратно нельзя.
            </p>

            <label htmlFor="merge-phone" className="text-ink-muted text-[13px] font-medium">
              Номер второй карточки
            </label>
            <input
              id="merge-phone"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="+34 600 00 00 00"
              required
              className={cn(
                'border-line-strong bg-surface w-full rounded-[--radius-btn] border px-3 py-2 font-mono text-[14px]',
                'focus:border-accent outline-none',
              )}
            />

            <div className="mt-1 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className={buttonClasses('ghost', 'sm')}
              >
                Отмена
              </button>
              <button type="submit" disabled={busy} className={buttonClasses('primary', 'sm')}>
                Объединить
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
