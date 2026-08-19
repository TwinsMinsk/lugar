'use client';

import { useState } from 'react';

import {
  changeUserRole,
  inviteUser,
  revokeInvitation,
  setUserBanned,
} from '@/app/(admin)/admin/_actions/users';
import { buttonClasses } from '@/components/ui/button';
import { ConfirmButton, InlineConfirm } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useAction } from './use-action';

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

/** Only what this screen says better than the shared vocabulary. */
const ERRORS = {
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
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<string>('content_editor');
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [emailed, setEmailed] = useState(false);
  const { isBusy, error, status, run } = useAction(ERRORS);

  return (
    <div className="flex flex-col gap-6">
      <form
        className="border-line bg-surface flex flex-col gap-4 rounded-[--radius-card] border p-4"
        onSubmit={(event) => {
          event.preventDefault();
          setInviteUrl(null);
          run(
            async () => {
              const result = await inviteUser({ email, role: role as 'owner' });
              if (result.ok) {
                setInviteUrl(result.inviteUrl ?? null);
                setEmailed(Boolean(result.emailed));
                setEmail('');
              }
              return result;
            },
            { key: 'invite' },
          );
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

          <button
            type="submit"
            disabled={isBusy('invite')}
            className={buttonClasses('primary', 'sm')}
          >
            {isBusy('invite') ? 'Отправляем…' : 'Пригласить'}
          </button>
        </div>

        <p className="text-ink-faint text-[12px]">{ROLE_HELP[role]}</p>

        {/* Both areas stay mounted: one inserted together with its text is not
            announced by a screen reader. */}
        <p role="alert" className="text-danger text-[13px] empty:hidden">
          {error}
        </p>
        <p role="status" className="text-ink-muted text-[13px] empty:hidden">
          {status}
        </p>

        {inviteUrl ? (
          <div className="border-success-line bg-success-surface rounded-[--radius-card] border p-3">
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
                  <span className="bg-danger-surface text-danger-ink rounded-[--radius-btn] px-1.5 py-0.5 text-[11px]">
                    срок истёк
                  </span>
                ) : null}
                <InlineConfirm
                  label="Отозвать"
                  question="Отозвать приглашение?"
                  confirmLabel="Отозвать"
                  disabled={isBusy(row.id)}
                  onConfirm={() =>
                    run(() => revokeInvitation(row.id), {
                      key: row.id,
                      success: 'Приглашение отозвано.',
                    })
                  }
                  className="ml-auto"
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="border-line bg-surface rounded-[--radius-card] border p-4">
        <h2 className="font-display mb-3 text-[19px]">Сотрудники</h2>
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

              <RoleControl
                user={row}
                pending={isBusy(row.id)}
                onApply={(newRole) =>
                  run(() => changeUserRole({ userId: row.id, role: newRole }), {
                    key: row.id,
                    success: 'Роль изменена.',
                  })
                }
              />

              {row.id === currentUserId ? null : row.banned ? (
                <button
                  type="button"
                  disabled={isBusy(row.id)}
                  onClick={() =>
                    run(() => setUserBanned(row.id, false), {
                      key: row.id,
                      success: 'Доступ восстановлен.',
                    })
                  }
                  className={cn(buttonClasses('ghost', 'sm'), 'text-[12px]')}
                >
                  Вернуть доступ
                </button>
              ) : (
                <ConfirmButton
                  label="Отключить доступ"
                  title="Отключить доступ?"
                  description={`${row.email} перестанет входить в панель. Учётная запись и всё, что этот человек сделал, сохраняются — доступ можно вернуть.`}
                  disabled={isBusy(row.id)}
                  onConfirm={() =>
                    run(() => setUserBanned(row.id, true), {
                      key: row.id,
                      success: 'Доступ отключён.',
                    })
                  }
                />
              )}

              {row.banned ? (
                <span className="bg-danger-surface text-danger-ink rounded-[--radius-btn] px-1.5 py-0.5 text-[11px]">
                  доступ отключён
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/**
 * Changing someone's role.
 *
 * A bare `<select onChange>` was worse than it looked: an arrow key demotes
 * the owner, and wrapping *that* in a confirmation would open a dialog on
 * every keystroke. So the select edits local state and nothing happens until
 * "Применить" — which is also what gives the confirmation something concrete
 * to say, rather than asking about a change the reader has already made.
 */
function RoleControl({
  user,
  pending,
  onApply,
}: {
  user: { id: string; email: string; role: string };
  pending: boolean;
  onApply: (role: 'owner') => void;
}) {
  const [role, setRole] = useState(user.role);
  const changed = role !== user.role;

  return (
    <span className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`role-${user.id}`}>
        Роль для {user.email}
      </label>
      <select
        id={`role-${user.id}`}
        value={role}
        disabled={pending}
        onChange={(event) => setRole(event.target.value)}
        className="border-line-strong rounded-[--radius-btn] border px-2 py-1 text-[13px]"
      >
        {Object.keys(ROLE_LABEL).map((value) => (
          <option key={value} value={value}>
            {ROLE_LABEL[value]}
          </option>
        ))}
      </select>

      {changed ? (
        <ConfirmButton
          label="Применить"
          title="Сменить роль?"
          description={`${user.email} станет — ${ROLE_LABEL[role] ?? role}. ${ROLE_HELP[role] ?? ''}`}
          confirmLabel="Сменить роль"
          disabled={pending}
          onConfirm={() => onApply(role as 'owner')}
        />
      ) : null}
    </span>
  );
}
