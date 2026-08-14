import 'server-only';

import { desc, isNull, and } from 'drizzle-orm';

import { db } from '@/db/client';
import { invitation, user } from '@/db/schema';
import { requireCapability } from '@/lib/auth/guards';

export type AdminUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  banned: boolean;
  createdAt: Date;
};

export type AdminInvitation = {
  id: string;
  email: string;
  role: string;
  expiresAt: Date;
  createdAt: Date;
  expired: boolean;
};

export async function listUsers(): Promise<AdminUser[]> {
  await requireCapability('users.manage');
  return db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      banned: user.banned,
      createdAt: user.createdAt,
    })
    .from(user)
    .orderBy(desc(user.createdAt));
}

/** Outstanding invitations only — accepted and revoked ones are history. */
export async function listPendingInvitations(): Promise<AdminInvitation[]> {
  await requireCapability('users.manage');

  const rows = await db
    .select({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
    })
    .from(invitation)
    .where(and(isNull(invitation.acceptedAt), isNull(invitation.revokedAt)))
    .orderBy(desc(invitation.createdAt));

  const now = Date.now();
  return rows.map((row) => ({ ...row, expired: row.expiresAt.getTime() < now }));
}
