import { Logo } from '@/components/layout/logo';
import { AcceptInviteForm } from '@/features/admin/accept-invite-form';

export const metadata = {
  title: 'Приглашение',
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Accepting an invitation.
 *
 * Reachable without a session — the token is the authorisation. The page
 * deliberately does not check the token before rendering: doing so would turn
 * it into an oracle that reveals which tokens exist. Validation happens on
 * submit, where every failure returns the same message.
 */
export const instant = false;

export default async function AcceptInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-16">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex flex-col items-start gap-3">
          <Logo />
          <p className="text-ink-soft text-[14px]">
            Вас пригласили в панель управления сайтом. Придумайте пароль, чтобы завершить.
          </p>
        </div>
        <AcceptInviteForm token={token} />
      </div>
    </main>
  );
}
