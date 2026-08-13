/**
 * better-auth schema.
 *
 * Table and column names match what better-auth's Drizzle adapter expects —
 * do not rename them. The `role`, `banned`, `banReason`, `banExpires` columns
 * on `user` and `impersonatedBy` on `session` come from the admin plugin.
 *
 * There is no public sign-up. Accounts are created only by the one-time owner
 * bootstrap or by an invitation issued by an existing owner.
 */
import { boolean, index, pgEnum, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { ts, timestamps, uuid7 } from './_shared';

export const userRole = pgEnum('user_role', ['owner', 'manager', 'content_editor']);

export const user = pgTable(
  'user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),

    // admin plugin
    role: userRole('role').notNull().default('content_editor'),
    banned: boolean('banned').notNull().default(false),
    banReason: text('ban_reason'),
    banExpires: ts('ban_expires'),

    ...timestamps,
  },
  (t) => [uniqueIndex('user_email_uq').on(t.email)],
);

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    expiresAt: ts('expires_at').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    impersonatedBy: text('impersonated_by'),
    ...timestamps,
  },
  (t) => [uniqueIndex('session_token_uq').on(t.token), index('session_user_idx').on(t.userId)],
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: ts('access_token_expires_at'),
    refreshTokenExpiresAt: ts('refresh_token_expires_at'),
    scope: text('scope'),
    /** Hashed by better-auth (scrypt). Never a plaintext or self-rolled hash. */
    password: text('password'),
    ...timestamps,
  },
  (t) => [
    index('account_user_idx').on(t.userId),
    uniqueIndex('account_provider_uq').on(t.providerId, t.accountId),
  ],
);

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: ts('expires_at').notNull(),
    ...timestamps,
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
);

/** Invitations. There is no public sign-up: an account requires one of these. */
export const invitation = pgTable(
  'invitation',
  {
    id: uuid7(),
    email: text('email').notNull(),
    role: userRole('role').notNull().default('content_editor'),
    tokenHash: text('token_hash').notNull(),
    invitedByUserId: text('invited_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    expiresAt: ts('expires_at').notNull(),
    acceptedAt: ts('accepted_at'),
    revokedAt: ts('revoked_at'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('invitation_token_uq').on(t.tokenHash),
    index('invitation_email_idx').on(t.email),
  ],
);
