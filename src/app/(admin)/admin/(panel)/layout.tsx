import Link from 'next/link';

import { Logo } from '@/components/layout/logo';
import { getSiteSettings } from '@/data/public/settings';
import { SignOutButton } from '@/features/admin/sign-out-button';
import { can, requireUser, type Capability } from '@/lib/auth/guards';

/**
 * Authenticated admin shell.
 *
 * `requireUser()` runs here, but that is convenience, not security: it stops an
 * unauthenticated visitor seeing a shell flash before being bounced. Every
 * query and mutation underneath re-checks the session and the specific
 * capability it needs, because a layout guard protects the *layout*, not the
 * data — a route handler or server action reached directly never renders it.
 */
type NavItem = {
  href: string;
  label: string;
  capability: Capability | null;
};

const NAV: NavItem[] = [
  { href: '/admin', label: 'Обзор', capability: null },
  { href: '/admin/pages', label: 'Страницы', capability: 'content.read' },
  { href: '/admin/portfolio', label: 'Портфолио', capability: 'content.read' },
  { href: '/admin/media', label: 'Медиа', capability: 'media.read' },
  { href: '/admin/leads', label: 'Заявки', capability: 'crm.read' },
  { href: '/admin/settings', label: 'Настройки', capability: 'settings.write' },
  { href: '/admin/users', label: 'Пользователи', capability: 'users.manage' },
];

const ROLE_LABEL: Record<string, string> = {
  owner: 'Владелец',
  manager: 'Менеджер',
  content_editor: 'Редактор',
};

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const { user, role } = await requireUser();

  const visible: NavItem[] = [];
  for (const item of NAV) {
    if (item.capability === null || (await can(item.capability))) visible.push(item);
  }

  const settings = await getSiteSettings();
  const pending = settings.pendingReview.length;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-line bg-surface sticky top-0 z-40 border-b">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3.5 lg:px-8">
          <Link href="/admin" className="flex-none">
            <Logo size="sm" />
          </Link>

          <nav aria-label="Разделы админки" className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {visible.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-ink-nav hover:text-accent py-1 text-[14px] transition-colors duration-[--duration-fast]"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-4">
            <Link
              href="/"
              target="_blank"
              rel="noopener"
              className="text-ink-faint hover:text-accent text-[13px]"
            >
              Открыть сайт ↗
            </Link>
            <span className="text-ink-faint hidden text-[13px] sm:inline">
              {user.email} · {ROLE_LABEL[role] ?? role}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>

      {pending > 0 ? (
        <div className="border-b border-[oklch(0.86_0.09_85)] bg-[oklch(0.96_0.05_85)] px-5 py-2.5 lg:px-8">
          <p className="text-ink-muted mx-auto max-w-[1600px] text-[13px]">
            <strong className="font-medium">{pending}</strong> настроек ждут реальных значений от
            владельца (соцсети, адрес, реквизиты, логотип, аналитика).{' '}
            <Link href="/admin/settings" className="text-accent underline underline-offset-2">
              Заполнить
            </Link>
          </p>
        </div>
      ) : null}

      <main className="mx-auto w-full max-w-[1600px] flex-1 px-5 py-8 lg:px-8">{children}</main>
    </div>
  );
}
