import { Suspense } from 'react';

import { Logo } from '@/components/layout/logo';
import { ResetPasswordForm } from './reset-form';

/**
 * Reachable without a session — see `proxy.ts`, where this path is public for
 * the same reason `/admin/invite` is: someone who cannot sign in cannot be
 * asked to sign in first. The token in the link is the authorisation.
 */
export const instant = false;

export const metadata = {
  title: 'Сброс пароля',
  robots: { index: false, follow: false },
};

export default function AdminResetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-16">
      <div className="w-full max-w-[380px]">
        <div className="mb-9 flex flex-col items-start gap-3">
          <Logo />
          <p className="text-ink-soft text-[14px]">Сброс пароля</p>
        </div>
        <Suspense fallback={null}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </main>
  );
}
