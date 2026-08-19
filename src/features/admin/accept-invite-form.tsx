'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { acceptInvitation } from '@/app/(admin)/admin/_actions/users';
import { buttonClasses } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { messagesFor } from './messages';

/** Only what this screen says better than the shared vocabulary. */
const message = messagesFor({
  // One message for every token failure: expired, revoked, already used or
  // simply wrong. Distinguishing them would let someone probe for valid tokens.
  invalid_invitation: 'Приглашение недействительно или срок его действия истёк.',
  password_too_short: 'Пароль должен быть не короче 12 символов.',
  already_a_user: 'Пользователь с таким адресом уже существует — просто войдите.',
  invalid_input: 'Проверьте заполненные поля.',
});

const inputClass = cn(
  'border-line-strong bg-surface w-full rounded-[--radius-btn] border px-3.5 py-3 text-[15px]',
  'focus:border-accent outline-none transition-colors duration-[--duration-fast]',
);

export function AcceptInviteForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <div>
        <p className="text-ink text-[15px]">Готово. Теперь войдите с этим паролем.</p>
        <button
          type="button"
          onClick={() => router.push('/admin/login')}
          className={buttonClasses('primary', 'lg', 'mt-5 w-full')}
        >
          Перейти ко входу
        </button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(async () => {
          setError(null);
          const result = await acceptInvitation({
            token,
            name: String(formData.get('name') ?? ''),
            password: String(formData.get('password') ?? ''),
          });
          if (result.ok) setDone(true);
          else setError(message(result.error));
        });
      }}
    >
      <div>
        <label
          htmlFor="invite-name"
          className="text-ink-muted mb-1.5 block text-[13px] font-medium"
        >
          Как вас зовут
        </label>
        <input id="invite-name" name="name" required autoComplete="name" className={inputClass} />
      </div>

      <div>
        <label
          htmlFor="invite-password"
          className="text-ink-muted mb-1.5 block text-[13px] font-medium"
        >
          Пароль
        </label>
        <input
          id="invite-password"
          name="password"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          className={inputClass}
        />
        <p className="text-ink-faint mt-1 text-[12px]">Не короче 12 символов.</p>
      </div>

      {error ? (
        <p role="alert" className="text-danger text-[13px]">
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className={buttonClasses('primary', 'lg', 'mt-1')}>
        {pending ? 'Создаём доступ…' : 'Завершить'}
      </button>
    </form>
  );
}
