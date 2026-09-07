import 'server-only';

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin as adminPlugin } from 'better-auth/plugins';
import { createAccessControl } from 'better-auth/plugins/access';
import { adminAc, defaultStatements } from 'better-auth/plugins/admin/access';

import { db } from '@/db/client';
import { account, session, user, verification } from '@/db/schema/auth';
import { env, publicEnv } from '@/env';
import { logger } from '@/lib/logger';

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
/**
 * Origins allowed to submit credentials.
 *
 * better-auth rejects a request whose Origin does not match `baseURL`, and the
 * client surfaces that rejection as a generic sign-in failure — so a
 * `BETTER_AUTH_URL` that does not exactly match the deployed origin presents as
 * "wrong password" for every user, with the real cause visible only in the
 * server log. That is a genuinely expensive misconfiguration to diagnose.
 *
 * Listing both configured URLs covers the deploy. Anything else — a preview
 * domain, or the port the E2E suite serves on — is opt-in through
 * BETTER_AUTH_TRUSTED_ORIGINS rather than inferred from NODE_ENV: a production
 * build is exactly what `next start` and the E2E run use, so a NODE_ENV check
 * would silently do nothing there while appearing to work.
 */
function trustedOrigins(): string[] {
  const origins = new Set<string>();
  const candidates = [
    env.BETTER_AUTH_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    ...(env.BETTER_AUTH_TRUSTED_ORIGINS ?? '').split(','),
  ];
  for (const candidate of candidates) {
    const trimmed = candidate?.trim().replace(/\/$/, '');
    if (trimmed) origins.add(trimmed);
  }
  return [...origins];
}

export const auth = betterAuth({
  appName: 'LUGAR',
  baseURL: env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: trustedOrigins(),

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
    /**
     * The way back in when nobody else can let you in.
     *
     * An owner who forgets their password is otherwise stuck: there is no
     * sign-up, `auth:bootstrap` refuses to run once an owner exists, and the
     * one person who could set a password for them is themselves. This is the
     * only path that does not need a second administrator.
     *
     * Without this function better-auth's reset endpoint refuses outright
     * ("Reset password isn't enabled"), so the flag that turns the feature on
     * *is* the presence of the sender. It is therefore always defined — the
     * Resend keys being absent is handled below, by declining to send, which
     * keeps the failure in the logs rather than in the visitor's face: the
     * endpoint answers the same way whether or not the address exists, and
     * that answer must not change because a key is missing either.
     *
     * The link points at the panel's own page, not at better-auth's endpoint.
     * `/api/auth/reset-password/<token>` redirects there with the token as a
     * query parameter, which is what `redirectTo` on the request carries.
     */
    sendResetPassword: async ({ user: recipient, url }) => {
      if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
        logger.warn(
          { userId: recipient.id },
          'password reset requested but RESEND_API_KEY / EMAIL_FROM are not set',
        );
        return;
      }
      try {
        const { Resend } = await import('resend');
        const resend = new Resend(env.RESEND_API_KEY);
        await resend.emails.send({
          from: env.EMAIL_FROM,
          to: recipient.email,
          subject: 'Сброс пароля в панели LUGAR',
          text:
            `Кто-то запросил сброс пароля для этой учётной записи в панели LUGAR.\n\n` +
            `Ссылка действует один час и сработает один раз:\n${url}\n\n` +
            `Если это были не вы — ничего делать не нужно, пароль остаётся прежним.\n`,
        });
      } catch (error) {
        logger.error({ err: error, userId: recipient.id }, 'password reset email failed to send');
      }
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      /**
       * Short cache to avoid a DB round trip on every request.
       *
       * This used to claim that authorization decisions re-read the session
       * server-side regardless. They did not: `getSession` answers from this
       * cookie payload unless the caller asks it not to, which made `banned`
       * and `role` up to `maxAge` seconds stale everywhere the panel checks
       * them. The guards in `auth/guards.ts` now pass `disableCookieCache`
       * for exactly that reason, so what this setting still buys is the
       * non-authorization reads — better-auth's own endpoints included.
       */
      enabled: true,
      maxAge: 60,
    },
  },

  advanced: {
    /**
     * Derived from the site's own URL, not from NODE_ENV.
     *
     * A Secure cookie is simply not sent over http, so tying this to NODE_ENV
     * means a production build served on http — which is exactly what
     * `next start` and the end-to-end suite do — cannot hold a session at all.
     * The scheme of NEXT_PUBLIC_APP_URL is the thing that actually decides
     * whether Secure is correct, so it is what decides here. Deploying over
     * https keeps the flag on; there is no configuration in which this is
     * weaker than the NODE_ENV check was.
     */
    useSecureCookies: publicEnv.appUrl.startsWith('https://'),
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
