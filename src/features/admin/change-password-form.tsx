'use client';

import { useState } from 'react';

import { buttonClasses } from '@/components/ui/button';
import { authClient } from '@/lib/auth/client';
import { cn } from '@/lib/utils';

import { recordPasswordChange } from '@/app/(admin)/admin/_actions/account';

const MIN_LENGTH = 12;

/**
 * Changing your own password.
 *
 * Goes through `authClient` rather than a server action, and that is the point
 * rather than a convenience: the request then travels through better-auth's
 * mounted handler, which is where its rate limiter lives. A Next server action
 * never passes through it, so the same form written as an action would offer
 * an unlimited oracle for guessing the current password — the one field here
 * that is worth guessing.
 *
 * `revokeOtherSessions` is on. Someone changing their password because they
 * suspect it leaked would otherwise leave every other session signed in, which
 * is the opposite of what they just tried to do. This session survives:
 * better-auth reissues it for the caller.
 *
 * The audit row is written afterwards by a small server action. It records
 * that the password changed and never what it changed to — the panel's audit
 * log has never held a credential and must not start.
 */
export function ChangePasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const form = event.currentTarget;
    const data = new FormData(form);
    const currentPassword = String(data.get('currentPassword') ?? '');
    const newPassword = String(data.get('newPassword') ?? '');
    const repeat = String(data.get('repeatPassword') ?? '');

    setError(null);
    setDone(false);

    if (newPassword.length < MIN_LENGTH) {
      setError(`Новый пароль должен быть не короче ${MIN_LENGTH} символов.`);
      return;
    }
    if (newPassword !== repeat) {
      setError('Новый пароль и повтор не совпадают.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('Новый пароль совпадает со старым.');
      return;
    }

    setPending(true);
    const result = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });
    setPending(false);

    if (result.error) {
      // Deliberately one message for a wrong current password and for a
      // rejected new one: this form is reachable only with a session, so the
      // detail helps nobody except someone who took that session.
      setError('Не удалось сменить пароль. Проверьте текущий пароль и попробуйте ещё раз.');
      return;
    }

    form.reset();
    setDone(true);
    await recordPasswordChange();
  }

  const inputClass = cn(
    'border-line-strong bg-surface w-full rounded-[--radius-btn] border px-3.5 py-2.5 text-[15px]',
    'focus:border-accent outline-none transition-colors duration-[--duration-fast]',
  );

  return (
    <form onSubmit={onSubmit} className="border-line bg-surface max-w-[420px] rounded border p-5">
      <div className="flex flex-col gap-4">
        <div>
          <label
            htmlFor="currentPassword"
            className="text-ink-muted mb-1.5 block text-[13px] font-medium"
          >
            Текущий пароль
          </label>
          <input
            id="currentPassword"
            name="currentPassword"
            type="password"
            required
            autoComplete="current-password"
            className={inputClass}
          />
        </div>

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
            className={inputClass}
          />
          <p className="text-ink-faint mt-1.5 text-[12px]">Не короче {MIN_LENGTH} символов.</p>
        </div>

        <div>
          <label
            htmlFor="repeatPassword"
            className="text-ink-muted mb-1.5 block text-[13px] font-medium"
          >
            Повторите новый пароль
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

        {done ? (
          <p role="status" className="text-[13px] text-[oklch(0.5_0.12_150)]">
            Пароль изменён. Все остальные устройства, где был выполнен вход, вышли из панели.
          </p>
        ) : null}

        <button type="submit" disabled={pending} className={buttonClasses('primary', 'md', 'mt-1')}>
          {pending ? 'Сохраняем…' : 'Сменить пароль'}
        </button>
      </div>
    </form>
  );
}
