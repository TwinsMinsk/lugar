import { Suspense } from 'react';
import { redirect } from 'next/navigation';

import { Logo } from '@/components/layout/logo';
import { getSession } from '@/lib/auth/guards';
import { LoginForm } from './login-form';

export const metadata = {
  title: 'Вход',
  robots: { index: false, follow: false },
};

/**
 * The one admin route reachable without a session.
 *
 * An already-authenticated visitor is bounced to the dashboard rather than
 * shown a form they do not need — and, more importantly, so that a stale login
 * page can never be used to re-submit credentials.
 */
export default async function AdminLoginPage() {
  const session = await getSession();
  if (session?.user) redirect('/admin');

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-16">
      <div className="w-full max-w-[380px]">
        <div className="mb-9 flex flex-col items-start gap-3">
          <Logo />
          <p className="text-ink-soft text-[14px]">Панель управления сайтом</p>
        </div>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
