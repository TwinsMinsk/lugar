import { listPendingInvitations, listUsers } from '@/data/admin/users';
import { UsersManager } from '@/features/admin/users-manager';
import { requireCapability } from '@/lib/auth/guards';

export const metadata = { title: 'Пользователи' };

export default async function AdminUsersPage() {
  const { user } = await requireCapability('users.manage');
  const [users, invitations] = await Promise.all([listUsers(), listPendingInvitations()]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[32px] leading-tight">Пользователи</h1>
        <p className="text-ink-soft mt-2 max-w-[72ch] text-[14px]">
          Регистрации на сайте нет — доступ выдаётся только приглашением. Роль определяется здесь и
          проверяется на сервере при каждом действии, а не прячется в интерфейсе.
        </p>
      </div>

      <UsersManager
        users={users}
        currentUserId={user.id}
        invitations={invitations.map((row) => ({
          id: row.id,
          email: row.email,
          role: row.role,
          expiresAt: row.expiresAt.toISOString(),
          expired: row.expired,
        }))}
      />
    </div>
  );
}
