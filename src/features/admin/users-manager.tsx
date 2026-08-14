'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import {
  changeUserRole,
  inviteUser,
  revokeInvitation,
  setUserBanned,
} from '@/app/(admin)/admin/_actions/users';
import { buttonClasses } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type UserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  banned: boolean;
};

export type InvitationRow = {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  expired: boolean;
};

const ROLE_LABEL: Record<string, string> = {
  owner: 'Владелец',
  manager: 'Менеджер',
  content_editor: 'Редактор',
};

const ROLE_HELP: Record<string, string> = {
  owner: 'Полный доступ, включая пользователей, настройки и журнал.',
  manager: 'Заявки, контакты и проекты. Без настроек и пользователей.',
  content_editor: 'Страницы, портфолио и медиа. Без доступа к заявкам.',
};

const ERRORS: Record<string, string> = {
  invalid_email: 'Проверьте адрес электронной почты.',
  already_a_user: 'Пользователь с таким адресом уже существует.',
  last_owner: 'Это последний владелец — сначала назначьте другого.',
  cannot_ban_self: 'Нельзя заблокировать самого себя.',
  not_found: 'Пользователь не найден.',
};

export function UsersManager({
  users,
  invitations,
  currentUserId,
}: {
  users: UserRow[];
  invitations: InvitationRow[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<string>('content_editor');
  const [error, setError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [emailed, setEmailed] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      setError(null);
      const result = await action();
      if (!result.ok) setError(ERRORS[result.error ?? ''] ?? result.error ?? 'Ошибка');
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        className="border-line bg-surface flex flex-col gap-4 rounded-[--radius-card] border p-4"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            setError(null);
            setInviteUrl(null);
            const result = await inviteUser({ email, role: role as 'owner' });
            if (result.ok) {
              setInviteUrl(result.inviteUrl ?? null);
              setEmailed(Boolean(result.emailed));
              setEmail('');
              router.refresh();
            } else {
              setError(ERRORS[result.error] ?? result.error);
            }
          });
        }}
      >
        <h2 className="font-display text-[19px]">Пригласить сотрудника</h2>

        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1">
            <label
              htmlFor="invite-email"
              className="text-ink-muted mb-1 block text-[12px] font-medium"
            >
              Email
            </label>
            <input
              id="invite-email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="border-line-strong bg-surface focus:border-accent w-full rounded-[--radius-btn] border px-3 py-2 text-[14px] outline-none"
            />
          </div>

          <div className="min-w-[200px]">
            <label
              htmlFor="invite-role"
              className="text-ink-muted mb-1 block text-[12px] font-medium"
            >
              Роль
            </label>
            <select
              id="invite-role"
              value={role}
              onChange={(event) => setRole(event.target.value)}
              className="border-line-strong bg-surface focus:border-accent w-full rounded-[--radius-btn] border px-3 py-2 text-[14px] outline-none"
            >
              {Object.keys(ROLE_LABEL).map((value) => (
                <option key={value} value={value}>
                  {ROLE_LABEL[value]}
                </option>
              ))}
            </select>
          </div>

          <button type="submit" disabled={pending} className={buttonClasses('primary', 'sm')}>
            {pending ? 'Отправляем…' : 'Пригласить'}
          </button>
        </div>

        <p className="text-ink-faint text-[12px]">{ROLE_HELP[role]}</p>

        {error ? (
          <p role="alert" className="text-[13px] text-[oklch(0.52_0.17_25)]">
            {error}
          </p>
        ) : null}

        {inviteUrl ? (
          <div className="rounded-[--radius-card] border border-[oklch(0.86_0.05_150)] bg-[oklch(0.98_0.02_150)] p-3">
            <p className="text-ink-muted text-[13px]">
              {emailed
                ? 'Письмо отправлено. Ссылка ниже — на случай, если оно не дойдёт:'
                : 'Почта не настроена, поэтому письмо не отправлено. Передайте ссылку сами:'}
            </p>
            <code className="text-ink mt-1.5 block text-[12px] break-all">{inviteUrl}</code>
            <p className="text-ink-faint mt-1.5 text-[11px]">
              Ссылка действует 72 часа и сработает один раз.
            </p>
          </div>
        ) : null}
      </form>

      {invitations.length > 0 ? (
        <section className="border-line bg-surface rounded-[--radius-card] border p-4">
          <h2 className="font-display mb-3 text-[19px]">Ожидают принятия</h2>
          <ul className="divide-line divide-y">
            {invitations.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className="text-ink text-[14px]">{row.email}</span>
                <span className="text-ink-faint text-[12px]">
                  {ROLE_LABEL[row.role] ?? row.role}
                </span>
                {row.expired ? (
                  <span className="rounded-[--radius-btn] bg-[oklch(0.95_0.05_25)] px-1.5 py-0.5 text-[11px] text-[oklch(0.45_0.14_25)]">
                    срок истёк
                  </span>
                ) : null}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => revokeInvitation(row.id))}
                  className={cn(buttonClasses('ghost', 'sm'), 'ml-auto text-[12px]')}
                >
                  Отозвать
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="border-line bg-surface rounded-[--radius-card] border p-4">
        <h2 className="font-display mb-3 text-[19px]">Пользователи</h2>
        <ul className="divide-line divide-y">
          {users.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-[200px] flex-1">
                <div className="text-ink text-[14px]">
                  {row.name}
                  {row.id === currentUserId ? (
                    <span className="text-ink-faint ml-2 text-[12px]">это вы</span>
                  ) : null}
                </div>
                <div className="text-ink-faint text-[12px]">{row.email}</div>
              </div>

              <label className="sr-only" htmlFor={`role-${row.id}`}>
                Роль для {row.email}
              </label>
              <select
                id={`role-${row.id}`}
                value={row.role}
                disabled={pending}
                onChange={(event) =>
                  run(() => changeUserRole({ userId: row.id, role: event.target.value as 'owner' }))
                }
                className="border-line-strong rounded-[--radius-btn] border px-2 py-1 text-[13px]"
              >
                {Object.keys(ROLE_LABEL).map((value) => (
                  <option key={value} value={value}>
                    {ROLE_LABEL[value]}
                  </option>
                ))}
              </select>

              {row.id === currentUserId ? null : (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => setUserBanned(row.id, !row.banned))}
                  className={cn(buttonClasses('ghost', 'sm'), 'text-[12px]')}
                >
                  {row.banned ? 'Разблокировать' : 'Заблокировать'}
                </button>
              )}

              {row.banned ? (
                <span className="rounded-[--radius-btn] bg-[oklch(0.95_0.05_25)] px-1.5 py-0.5 text-[11px] text-[oklch(0.45_0.14_25)]">
                  заблокирован
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
