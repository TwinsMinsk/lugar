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
/**
 * Every admin route depends on the session, so none of it can be prerendered.
 * `instant = false` opts this subtree into blocking dynamic rendering — the
 * documented escape hatch under Cache Components — rather than scattering
 * Suspense boundaries around auth checks that have nothing to stream.
 */
export const instant = false;

type NavItem = {
  href: string;
  label: string;
  capability: Capability | null;
};

/**
 * The menu, in three groups.
 *
 * Thirteen equal links in one row gave no clue which of them belong together,
 * and the order put the CMS first — which is backwards for this studio: the
 * site is edited a few times a month, the enquiries are read every day.
 *
 * Grouped in the existing top bar rather than behind dropdowns or a sidebar.
 * Hovering to reveal a menu excludes the keyboard, and every screen being one
 * visible click away is what the accessibility specs assert.
 *
 * A group whose items are all hidden by capability disappears with its heading,
 * so a manager does not see an empty "САЙТ" label.
 */
const NAV_GROUPS: Array<{ label: string | null; items: NavItem[] }> = [
  { label: null, items: [{ href: '/admin', label: 'Обзор', capability: null }] },
  {
    label: 'Клиенты',
    items: [
      { href: '/admin/leads', label: 'Заявки', capability: 'crm.read' },
      { href: '/admin/leads/board', label: 'Воронка', capability: 'crm.read' },
      { href: '/admin/contacts', label: 'Клиенты', capability: 'crm.read' },
    ],
  },
  {
    label: 'Сайт',
    items: [
      { href: '/admin/pages', label: 'Страницы', capability: 'content.read' },
      { href: '/admin/portfolio', label: 'Наши работы', capability: 'content.read' },
      { href: '/admin/media', label: 'Фотографии', capability: 'media.read' },
      { href: '/admin/navigation', label: 'Меню', capability: 'navigation.write' },
      { href: '/admin/redirects', label: 'Переадресация', capability: 'seo.write' },
    ],
  },
  {
    label: 'Управление',
    items: [
      { href: '/admin/settings', label: 'Настройки', capability: 'settings.write' },
      { href: '/admin/pipeline', label: 'Этапы воронки', capability: 'settings.write' },
      { href: '/admin/users', label: 'Сотрудники', capability: 'users.manage' },
      { href: '/admin/audit', label: 'Журнал изменений', capability: 'audit.read' },
    ],
  },
];

const ROLE_LABEL: Record<string, string> = {
  owner: 'Владелец',
  manager: 'Менеджер',
  content_editor: 'Редактор',
};

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const { user, role } = await requireUser();

  const groups: Array<{ label: string | null; items: NavItem[] }> = [];
  for (const group of NAV_GROUPS) {
    const items: NavItem[] = [];
    for (const item of group.items) {
      if (item.capability === null || (await can(item.capability))) items.push(item);
    }
    if (items.length > 0) groups.push({ label: group.label, items });
  }

  const settings = await getSiteSettings();
  // Only surfaced to someone who can actually act on it — a content editor
  // following this link would just get a 404.
  const canEditSettings = await can('settings.write');
  const pending = canEditSettings ? settings.pendingReview.length : 0;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-line bg-surface sticky top-0 z-40 border-b">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3.5 lg:px-8">
          <Link href="/admin" className="flex-none">
            <Logo size="sm" />
          </Link>

          <nav aria-label="Разделы админки" className="flex flex-wrap items-center gap-x-5 gap-y-1">
            {groups.map((group, index) => (
              <div key={group.label ?? 'main'} className="flex flex-wrap items-center gap-x-4">
                {index > 0 ? (
                  <span aria-hidden className="text-line-strong select-none">
                    │
                  </span>
                ) : null}
                {group.label ? (
                  <span className="text-ink-ghost text-[10px] tracking-[0.14em] uppercase">
                    {group.label}
                  </span>
                ) : null}
                {group.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="text-ink-nav hover:text-accent py-1 text-[14px] transition-colors duration-[--duration-fast]"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
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
        <div className="border-warning-line bg-warning-surface border-b px-5 py-2.5 lg:px-8">
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
