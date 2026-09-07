'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

import { buttonClasses } from '@/components/ui/button';
import { authClient } from '@/lib/auth/client';
import { cn } from '@/lib/utils';

const MIN_LENGTH = 12;

const inputClass = cn(
  'border-line-strong bg-surface w-full rounded-[--radius-btn] border px-3.5 py-3 text-[15px]',
  'focus:border-accent outline-none transition-colors duration-[--duration-fast]',
);

/**
 * Forgotten password, both steps.
 *
 * One component for two states because they are two halves of one errand and
 * the visitor arrives at the second by following the link from the first: no
 * token in the URL means "ask for the email", a token means "set the new
 * password". better-auth's endpoint redirects here with `?token=`, or with
 * `?error=INVALID_TOKEN` when the link has expired or been used.
 *
 * The confirmation after requesting a link never says whether the address
 * exists. This form is public, so a message that distinguishes the two turns
 * it into a way to enumerate the studio's staff accounts — the same reason the
 * sign-in form gives one message for a wrong password and an unknown user.
 */
export function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token');
  const linkError = params.get('error');

  const [sent, setSent] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function requestLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const email = String(new FormData(event.currentTarget).get('email') ?? '').trim();
    setPending(true);
    setError(null);

    // `redirectTo` is where better-auth sends the visitor after it has checked
    // the token — this same page, which then shows the second step.
    const result = await authClient.requestPasswordReset({
      email,
      redirectTo: '/admin/reset-password',
    });
    setPending(false);

    if (result.error) {
      setError('Не удалось отправить письмо. Попробуйте позже.');
      return;
    }
    setSent(true);
  }

  async function setNewPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !token) return;

    const data = new FormData(event.currentTarget);
    const newPassword = String(data.get('newPassword') ?? '');
    const repeat = String(data.get('repeatPassword') ?? '');

    setError(null);
    if (newPassword.length < MIN_LENGTH) {
      setError(`Пароль должен быть не короче ${MIN_LENGTH} символов.`);
      return;
    }
    if (newPassword !== repeat) {
      setError('Пароли не совпадают.');
      return;
    }

    setPending(true);
    const result = await authClient.resetPassword({ newPassword, token });
    setPending(false);

    if (result.error) {
      setError('Ссылка больше не действует. Запросите новую.');
      return;
    }

    setDone(true);
    router.refresh();
  }

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="text-[14px]">
          Пароль изменён. Теперь войдите с новым паролем.
        </p>
        <Link href="/admin/login" className={buttonClasses('primary', 'lg', 'w-full')}>
          Войти
        </Link>
      </div>
    );
  }

  if (token) {
    return (
      <form onSubmit={setNewPassword} className="flex flex-col gap-4">
        <div>
          <label
            htmlFor="newPassword"
            className="text-ink-muted mb-1.5 block text-[13px] font-medium"
          >
            Новый пароль
          </label>
          <input
            id="newPassword"
            name="newPassword"
            type="password"
            required
            minLength={MIN_LENGTH}
            autoComplete="new-password"
            autoFocus
            className={inputClass}
          />
          <p className="text-ink-faint mt-1.5 text-[12px]">Не короче {MIN_LENGTH} символов.</p>
        </div>

        <div>
          <label
            htmlFor="repeatPassword"
            className="text-ink-muted mb-1.5 block text-[13px] font-medium"
          >
            Повторите пароль
          </label>
          <input
            id="repeatPassword"
            name="repeatPassword"
            type="password"
            required
            minLength={MIN_LENGTH}
            autoComplete="new-password"
            className={inputClass}
          />
        </div>

        {error ? (
          <p role="alert" className="text-danger text-[13px]">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className={buttonClasses('primary', 'lg', 'mt-2 w-full')}
        >
          {pending ? 'Сохраняем…' : 'Задать пароль'}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={requestLink} className="flex flex-col gap-4">
      {linkError ? (
        <p role="alert" className="text-danger text-[13px]">
          Ссылка недействительна или уже использована. Запросите новую.
        </p>
      ) : null}

      <div>
        <label htmlFor="email" className="text-ink-muted mb-1.5 block text-[13px] font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          autoFocus
          className={inputClass}
        />
      </div>

      {error ? (
        <p role="alert" className="text-danger text-[13px]">
          {error}
        </p>
      ) : null}

      {sent ? (
        <p role="status" className="text-ink-muted text-[13px]">
          Если такая учётная запись существует, письмо со ссылкой уже отправлено. Ссылка действует
          один час.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || sent}
        className={buttonClasses('primary', 'lg', 'mt-2 w-full')}
      >
        {pending ? 'Отправляем…' : 'Прислать ссылку'}
      </button>

      <Link href="/admin/login" className="text-ink-faint hover:text-accent text-[13px]">
        ← Ко входу
      </Link>
    </form>
  );
}
