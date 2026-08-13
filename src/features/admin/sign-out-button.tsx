'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { authClient } from '@/lib/auth/client';

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await authClient.signOut();
        // refresh() clears the cached RSC payload, so the shell cannot briefly
        // render with the previous user's navigation after signing out.
        router.push('/admin/login');
        router.refresh();
      }}
      className="text-ink-faint hover:text-accent cursor-pointer text-[13px] transition-colors duration-[--duration-fast]"
    >
      {pending ? 'Выходим…' : 'Выйти'}
    </button>
  );
}
