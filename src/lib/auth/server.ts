import 'server-only';

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin as adminPlugin } from 'better-auth/plugins';
import { createAccessControl } from 'better-auth/plugins/access';
import { adminAc, defaultStatements } from 'better-auth/plugins/admin/access';

import { db } from '@/db/client';
import { account, session, user, verification } from '@/db/schema/auth';
import { env } from '@/env';

export const ROLES = ['owner', 'manager', 'content_editor'] as const;
export type Role = (typeof ROLES)[number];

/**
 * Access control for better-auth's own user-management surface only.
 *
 * This governs who may create, ban, impersonate or list *accounts*. It is NOT
 * the application's permission model — that lives in `guards.ts` and covers
 * content, CRM and WhatsApp. Only `owner` gets account administration; manager
 * and content_editor are declared with no user-management statements at all.
 */
const ac = createAccessControl(defaultStatements);

const roles = {
  owner: ac.newRole(adminAc.statements),
  manager: ac.newRole({}),
  content_editor: ac.newRole({}),
};

/**
 * Authentication.
 *
 * Password hashing, session issuance and cookie handling are all delegated to
 * better-auth (scrypt + signed, httpOnly, sameSite cookies). We deliberately
 * implement none of that ourselves.
 *
 * There is **no public sign-up**: `disableSignUp` closes the public route, and
 * accounts come from exactly two places — the one-time CLI bootstrap of the
 * first owner, and invitations issued by an existing owner.
 */
export const auth = betterAuth({
  appName: 'LUGAR',
  baseURL: env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  secret: env.BETTER_AUTH_SECRET,

  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: { user, session, account, verification },
  }),

  emailAndPassword: {
    enabled: true,
    // The whole point: nobody can create themselves an account.
    disableSignUp: true,
    minPasswordLength: 12,
    requireEmailVerification: false,
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      // Short cache to avoid a DB round trip on every request. Any
      // authorization decision still re-reads the session server-side.
      enabled: true,
      maxAge: 60,
    },
  },

  advanced: {
    useSecureCookies: process.env.NODE_ENV === 'production',
    defaultCookieAttributes: { sameSite: 'lax', httpOnly: true },
  },

  plugins: [
    adminPlugin({
      ac,
      roles,
      defaultRole: 'content_editor',
      adminRoles: ['owner'],
    }),
  ],
});

export type Session = typeof auth.$Infer.Session;
