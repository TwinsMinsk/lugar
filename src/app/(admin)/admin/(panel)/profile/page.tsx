import { ChangePasswordForm } from '@/features/admin/change-password-form';
import { requireUser } from '@/lib/auth/guards';

export const metadata = { title: 'Мой доступ' };

const ROLE_LABEL: Record<string, string> = {
  owner: 'Владелец',
  manager: 'Менеджер',
  content_editor: 'Редактор',
};

/**
 * Your own account.
 *
 * Guarded by `requireUser`, not by a capability: a panel where some role
 * cannot change its own password is a panel with a credential nobody can
 * rotate. Before this screen existed there was no way to change a password
 * anywhere — the bootstrap script told the operator to do it "in the panel",
 * and the panel could not.
 */
export default async function AdminProfilePage() {
  const { user, role } = await requireUser();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[32px] leading-tight">Мой доступ</h1>
        <p className="text-ink-soft mt-2 max-w-[72ch] text-[14px]">
          {user.email} · {ROLE_LABEL[role] ?? role}. Роль меняет владелец — здесь только пароль.
        </p>
      </div>

      <ChangePasswordForm />
    </div>
  );
}
