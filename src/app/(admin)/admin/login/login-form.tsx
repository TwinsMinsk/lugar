'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

import { buttonClasses } from '@/components/ui/button';
import { authClient } from '@/lib/auth/client';
import { cn } from '@/lib/utils';

/**
 * Admin sign-in.
 *
 * No sign-up link: accounts come from the one-time owner bootstrap or an
 * owner's invitation, never from this screen. There *is* a password reset,
 * which there was not when this comment first claimed otherwise — an owner who
 * forgets their password is the one person nobody else can let back in.
 *
 * The error message is deliberately identical for "no such user" and "wrong
 * password". Distinguishing them turns this form into an account enumeration
 * oracle for a panel that manages customer personal data.
 */
export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const next = searchParams.get('next');
  // Only same-origin relative paths — never an absolute URL from the query.
  const destination = next && next.startsWith('/') && !next.startsWith('//') ? next : '/admin';

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    setPending(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get('email') ?? '').trim();
    const password = String(formData.get('password') ?? '');

    const result = await authClient.signIn.email({ email, password });

    if (result.error) {
      setError('invalid');
      setPending(false);
      return;
    }

    router.push(destination);
    router.refresh();
  }

  const inputClass = cn(
    'border-line-strong bg-surface w-full rounded-[--radius-btn] border px-3.5 py-3 text-[15px]',
    'focus:border-accent outline-none transition-colors duration-[--duration-fast]',
  );

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
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

      <div>
        <label htmlFor="password" className="text-ink-muted mb-1.5 block text-[13px] font-medium">
          Пароль
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className={inputClass}
        />
      </div>

      {error ? (
        <p role="alert" className="text-danger text-[13px]">
          Неверный email или пароль.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className={buttonClasses('primary', 'lg', 'mt-2 w-full')}
      >
        {pending ? 'Входим…' : 'Войти'}
      </button>

      <Link
        href="/admin/reset-password"
        className="text-ink-faint hover:text-accent text-center text-[13px]"
      >
        Забыли пароль?
      </Link>
    </form>
  );
}
