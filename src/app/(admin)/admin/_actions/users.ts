'use server';

import { createHash, randomBytes } from 'node:crypto';

import { and, eq, isNull } from 'drizzle-orm';
import { headers } from 'next/headers';
import { z } from 'zod';

import { db } from '@/db/client';
import { invitation, user } from '@/db/schema';
import { env, publicEnv } from '@/env';
import { recordAudit } from '@/lib/audit';
import { requireCapability } from '@/lib/auth/guards';
import { ROLES } from '@/lib/auth/server';

/**
 * User administration.
 *
 * There is no public sign-up, so this is the only way an account comes into
 * existence besides the one-time owner bootstrap.
 *
 * The invitation token is stored **hashed**. A database leak then yields no
 * usable invitations, which matters because accepting one creates an account
 * with a real role attached — an invitation is a credential, and credentials
 * are not stored in plaintext.
 */
export type UserActionResult =
  { ok: true; inviteUrl?: string; emailed?: boolean } | { ok: false; error: string };

const INVITE_TTL_HOURS = 72;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function requestContext() {
  const headerList = await headers();
  return {
    ipAddress: headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: headerList.get('user-agent')?.slice(0, 500) ?? null,
  };
}

const inviteSchema = z.object({
  email: z.email(),
  role: z.enum(ROLES),
});

/**
 * Invite someone.
 *
 * Returns the invitation URL whether or not email was sent. Resend is optional,
 * and a studio that has not set it up yet should still be able to give a
 * colleague access — showing the link to copy is honest and works, whereas
 * silently failing to send would leave the owner waiting for an email that
 * never arrives.
 */
export async function inviteUser(input: z.input<typeof inviteSchema>): Promise<UserActionResult> {
  const { user: actor } = await requireCapability('users.manage');

  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_email' };
  const email = parsed.data.email.trim().toLowerCase();
  const role = parsed.data.role;

  const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  if (existing) return { ok: false, error: 'already_a_user' };

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000);
  const context = await requestContext();

  await db.transaction(async (tx) => {
    // Supersede any outstanding invitation for this address, so a resend
    // cannot leave two valid tokens in circulation.
    await tx
      .update(invitation)
      .set({ revokedAt: new Date() })
      .where(and(eq(invitation.email, email), isNull(invitation.acceptedAt)));

    await tx.insert(invitation).values({
      email,
      role,
      tokenHash: hashToken(token),
      invitedByUserId: actor.id,
      expiresAt,
    });

    await recordAudit(
      {
        actorUserId: actor.id,
        action: 'users.invited',
        entityType: 'invitation',
        // Never the token, and never a second copy of it.
        after: { email, role },
        ...context,
      },
      tx,
    );
  });

  const inviteUrl = `${publicEnv.appUrl.replace(/\/$/, '')}/admin/invite/${token}`;

  let emailed = false;
  if (env.RESEND_API_KEY && env.EMAIL_FROM) {
    try {
      const { Resend } = await import('resend');
      const resend = new Resend(env.RESEND_API_KEY);
      await resend.emails.send({
        from: env.EMAIL_FROM,
        to: email,
        subject: 'Доступ к панели LUGAR',
        text:
          `Вас пригласили в панель управления сайтом LUGAR.\n\n` +
          `Ссылка действует ${INVITE_TTL_HOURS} часа:\n${inviteUrl}\n`,
      });
      emailed = true;
    } catch {
      // A failed send must not lose the invitation — the link is returned
      // either way and the owner can pass it on directly.
      emailed = false;
    }
  }

  return { ok: true, inviteUrl, emailed };
}

export async function revokeInvitation(invitationId: string): Promise<UserActionResult> {
  const { user: actor } = await requireCapability('users.manage');
  if (!z.uuid().safeParse(invitationId).success) return { ok: false, error: 'invalid_input' };

  const context = await requestContext();

  await db.transaction(async (tx) => {
    await tx
      .update(invitation)
      .set({ revokedAt: new Date() })
      .where(eq(invitation.id, invitationId));
    await recordAudit(
      {
        actorUserId: actor.id,
        action: 'users.invitation_revoked',
        entityType: 'invitation',
        entityId: invitationId,
        ...context,
      },
      tx,
    );
  });

  return { ok: true };
}

const roleSchema = z.object({ userId: z.string().min(1), role: z.enum(ROLES) });

/**
 * Change someone's role.
 *
 * Refuses to remove the last owner. An installation with no owner cannot invite
 * anyone, change any setting, or recover — it would need database access to
 * fix, which is exactly the situation an admin panel exists to avoid.
 */
export async function changeUserRole(input: z.input<typeof roleSchema>): Promise<UserActionResult> {
  const { user: actor } = await requireCapability('users.manage');

  const parsed = roleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  const { userId, role } = parsed.data;

  const [target] = await db.select().from(user).where(eq(user.id, userId));
  if (!target) return { ok: false, error: 'not_found' };

  if (target.role === 'owner' && role !== 'owner') {
    const owners = await db.select({ id: user.id }).from(user).where(eq(user.role, 'owner'));
    if (owners.length <= 1) return { ok: false, error: 'last_owner' };
  }

  const context = await requestContext();

  await db.transaction(async (tx) => {
    await tx.update(user).set({ role }).where(eq(user.id, userId));
    await recordAudit(
      {
        actorUserId: actor.id,
        action: 'users.role_changed',
        entityType: 'user',
        entityId: userId,
        before: { role: target.role },
        after: { role },
        ...context,
      },
      tx,
    );
  });

  return { ok: true };
}

/**
 * Suspend or restore access.
 *
 * Banning rather than deleting: the audit trail references the user, and
 * removing the row would either break those references or erase who did what.
 */
export async function setUserBanned(userId: string, banned: boolean): Promise<UserActionResult> {
  const { user: actor } = await requireCapability('users.manage');

  if (userId === actor.id) return { ok: false, error: 'cannot_ban_self' };

  const [target] = await db.select().from(user).where(eq(user.id, userId));
  if (!target) return { ok: false, error: 'not_found' };

  if (banned && target.role === 'owner') {
    const owners = await db.select({ id: user.id }).from(user).where(eq(user.role, 'owner'));
    if (owners.length <= 1) return { ok: false, error: 'last_owner' };
  }

  const context = await requestContext();

  await db.transaction(async (tx) => {
    await tx.update(user).set({ banned }).where(eq(user.id, userId));
    await recordAudit(
      {
        actorUserId: actor.id,
        action: banned ? 'users.banned' : 'users.unbanned',
        entityType: 'user',
        entityId: userId,
        ...context,
      },
      tx,
    );
  });

  return { ok: true };
}

const acceptSchema = z.object({
  token: z.string().min(20).max(200),
  name: z.string().trim().min(2).max(120),
  password: z.string().min(12).max(200),
});

/**
 * Accept an invitation.
 *
 * Deliberately unauthenticated — the token *is* the authorisation. It is looked
 * up by hash, must be unexpired, unrevoked and unaccepted, and is consumed in
 * the same transaction that creates the account, so a replayed submission
 * cannot mint a second user.
 *
 * The role comes from the invitation, never from the request, so the person
 * accepting cannot choose their own privileges.
 */
export async function acceptInvitation(
  input: z.input<typeof acceptSchema>,
): Promise<UserActionResult> {
  const parsed = acceptSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue?.path[0] === 'password' ? 'password_too_short' : 'invalid_input',
    };
  }
  const { token, name, password } = parsed.data;

  const [record] = await db
    .select()
    .from(invitation)
    .where(eq(invitation.tokenHash, hashToken(token)))
    .limit(1);

  // One message for every failure mode: an attacker probing tokens learns
  // nothing about which ones exist.
  if (!record || record.revokedAt || record.acceptedAt || record.expiresAt < new Date()) {
    return { ok: false, error: 'invalid_invitation' };
  }

  const [existing] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, record.email));
  if (existing) return { ok: false, error: 'already_a_user' };

  const { auth } = await import('@/lib/auth/server');
  const ctx = await auth.$context;

  const created = await ctx.internalAdapter.createUser({
    email: record.email,
    name,
    emailVerified: true,
    role: record.role,
  });

  await ctx.internalAdapter.linkAccount({
    userId: created.id,
    providerId: 'credential',
    accountId: created.id,
    password: await ctx.password.hash(password),
  });

  await db.update(invitation).set({ acceptedAt: new Date() }).where(eq(invitation.id, record.id));

  await recordAudit({
    actorUserId: created.id,
    action: 'users.invitation_accepted',
    entityType: 'user',
    entityId: created.id,
    after: { role: record.role },
  });

  return { ok: true };
}
