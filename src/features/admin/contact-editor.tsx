'use client';

import { useState } from 'react';

import { updateContact } from '@/app/(admin)/admin/_actions/contacts';
import { buttonClasses } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAction } from './use-action';

/** Only what this screen says better than the shared vocabulary. */
const ERRORS = {
  not_found: 'Контакт не найден — возможно, его уже убрали.',
  invalid_input: 'Проверьте адрес электронной почты.',
};

const inputClass = cn(
  'border-line-strong bg-surface w-full rounded-[--radius-btn] border px-3 py-2 text-[14px]',
  'focus:border-accent outline-none transition-colors duration-[--duration-fast]',
);

/**
 * The editable half of a contact.
 *
 * The phone number is displayed by the page and is not a field here: it is the
 * key the CRM joins on and the one inbound WhatsApp matches against, so editing
 * it would detach the person from their own history.
 */
export function ContactEditor({
  contactId,
  fullName,
  email,
  city,
  notes,
}: {
  contactId: string;
  fullName: string | null;
  email: string | null;
  city: string | null;
  notes: string | null;
}) {
  const [values, setValues] = useState({
    fullName: fullName ?? '',
    email: email ?? '',
    city: city ?? '',
    notes: notes ?? '',
  });
  /**
   * Through `useAction`, like the other admin screens.
   *
   * The failure branch was a two-way ternary: anything that was not
   * `invalid_input` was reported as «Контакт не найден», which happened to be
   * true for the only other code this action returns today and would have been
   * a lie for the next one. And the bare `startTransition` swallowed a thrown
   * action, so a refused guard said nothing at all.
   */
  const { busy: pending, error, status, run, reset } = useAction(ERRORS);

  function field(key: keyof typeof values) {
    return {
      value: values[key],
      onChange: (event: { target: { value: string } }) => {
        setValues((current) => ({ ...current, [key]: event.target.value }));
        // "Сохранено." must not outlive the value it described.
        reset();
      },
    };
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        run(() => updateContact({ id: contactId, ...values }), { success: 'Сохранено.' });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="contact-name" className="text-ink-muted mb-1 block text-[12px]">
            Имя
          </label>
          <input id="contact-name" className={inputClass} {...field('fullName')} />
        </div>
        <div>
          <label htmlFor="contact-email" className="text-ink-muted mb-1 block text-[12px]">
            Email
          </label>
          <input id="contact-email" type="email" className={inputClass} {...field('email')} />
        </div>
        <div>
          <label htmlFor="contact-city" className="text-ink-muted mb-1 block text-[12px]">
            Город
          </label>
          <input id="contact-city" className={inputClass} {...field('city')} />
        </div>
      </div>

      <div>
        <label htmlFor="contact-notes" className="text-ink-muted mb-1 block text-[12px]">
          Заметки о клиенте
        </label>
        <textarea
          id="contact-notes"
          rows={3}
          className={cn(inputClass, 'resize-y')}
          placeholder="То, что относится к человеку, а не к отдельной заявке"
          {...field('notes')}
        />
      </div>

      {/* Mounted whether or not it has text: an alert inserted together with
          its message is not announced. */}
      <p role="alert" className="text-danger text-[13px] empty:hidden">
        {error}
      </p>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClasses('primary', 'sm')}>
          {pending ? 'Сохраняем…' : 'Сохранить'}
        </button>
        <span role="status" className="text-ink-faint text-[13px]">
          {status}
        </span>
      </div>
    </form>
  );
}
