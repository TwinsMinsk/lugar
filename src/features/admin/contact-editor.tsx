'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { updateContact } from '@/app/(admin)/admin/_actions/contacts';
import { buttonClasses } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
  const router = useRouter();
  const [values, setValues] = useState({
    fullName: fullName ?? '',
    email: email ?? '',
    city: city ?? '',
    notes: notes ?? '',
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function field(key: keyof typeof values) {
    return {
      value: values[key],
      onChange: (event: { target: { value: string } }) => {
        setValues((current) => ({ ...current, [key]: event.target.value }));
        setSaved(false);
      },
    };
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          setError(null);
          const result = await updateContact({ id: contactId, ...values });
          if (!result.ok) {
            setError(
              result.error === 'invalid_input'
                ? 'Проверьте адрес электронной почты.'
                : 'Контакт не найден.',
            );
            return;
          }
          setSaved(true);
          router.refresh();
        });
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

      {error ? (
        <p role="alert" className="text-danger text-[13px]">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClasses('primary', 'sm')}>
          {pending ? 'Сохраняем…' : 'Сохранить'}
        </button>
        <span aria-live="polite" className="text-ink-faint text-[13px]">
          {saved ? 'Сохранено.' : ''}
        </span>
      </div>
    </form>
  );
}
