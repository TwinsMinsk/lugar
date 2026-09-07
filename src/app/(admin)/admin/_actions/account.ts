'use server';

import { auditRequestContext, recordAudit } from '@/lib/audit';
import { requireUser } from '@/lib/auth/guards';

/**
 * Your own account.
 *
 * Separate from `users.ts`, which is the owner administering *other* people
 * and is guarded by `users.manage`. Everything here is guarded by
 * `requireUser` instead: every role may change their own password, and there
 * is no capability for "acts on yourself" — nor should there be one, since a
 * capability someone could be refused would mean an account nobody can rotate.
 */

/**
 * Journal a password change the browser has already made.
 *
 * The change itself goes through better-auth's own endpoint (see
 * `change-password-form.tsx` for why it is not a server action), which knows
 * nothing about this panel's audit log. This closes that gap: the actor is
 * taken from the session rather than from an argument, so the worst a forged
 * call can do is record that you changed your own password when you did not —
 * not attribute anything to anyone else.
 *
 * The row carries no password, no hash and no length. An audit log that can
 * be read by an owner is not a place for credential material of any kind.
 */
export async function recordPasswordChange(): Promise<void> {
  const { user } = await requireUser();

  await recordAudit({
    actorUserId: user.id,
    action: 'users.password_changed',
    entityType: 'user',
    entityId: user.id,
    ...(await auditRequestContext()),
  });
}
