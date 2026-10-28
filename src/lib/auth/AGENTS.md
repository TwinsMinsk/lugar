# auth

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-28 · **Updated:** 2026-10-28

## Purpose

Authentication (better-auth, DB-backed sessions, invite-only accounts) and authorization (a single
capability matrix plus guard functions). Because the database has no RLS, `guards.ts` is the access
boundary for every private read and mutation. `proxy.ts` only checks that a session cookie *exists* and
is not a security boundary; hidden buttons are not access control either.

## Key Files

| File | Description |
|------|-------------|
| `guards.ts` | `server-only`. `CAPABILITIES` matrix, `Capability` type, `roleCan(role, cap)`, `getSession()`, `requireUser()`, `requireCapability(cap)`, `can(cap)`. |
| `server.ts` | `server-only`. `auth = betterAuth({...})`, `ROLES`, `Role`, `Session`. Drizzle adapter over `user`, `session`, `account`, `verification`; `emailAndPassword` with `disableSignUp: true`, `minPasswordLength: 12`, `requireEmailVerification: false`, `sendResetPassword` via Resend (logs a warning and returns if `RESEND_API_KEY`/`EMAIL_FROM` are unset); session `expiresIn` 7 days, `updateAge` 1 day, `cookieCache` 60 s; `useSecureCookies` derived from `publicEnv.appUrl` scheme, not `NODE_ENV`; admin plugin with `defaultRole: 'content_editor'`, `adminRoles: ['owner']`. |
| `client.ts` | `'use client'`. `authClient = createAuthClient({ plugins: [adminClient()] })`; exports `signIn`, `signOut`, `useSession`. Used only inside `/admin`. |

### Roles and capability matrix (as found in `guards.ts`)

Roles (`ROLES` in `server.ts`, mirrors the `user_role` enum): `owner`, `manager`, `content_editor`.

| Capability | owner | manager | content_editor |
|------------|:-----:|:-------:|:--------------:|
| `content.read`, `content.write`, `content.publish`, `content.rollback` | yes | no | yes |
| `content.delete` | yes | no | no |
| `media.read`, `media.write` | yes | no | yes |
| `media.delete` | yes | no | no |
| `navigation.write`, `seo.write` | yes | no | yes |
| `crm.read`, `crm.write`, `crm.export` | yes | yes | no |
| `crm.delete` | yes | no | no |
| `whatsapp.read`, `whatsapp.send` | yes | yes | no |
| `whatsapp.requeue` | yes | no | no |
| `settings.write`, `users.manage`, `audit.read` | yes | no | no |

Managers deliberately have **no** `content.*`: they once did, which exposed CMS sections they could open
but not save in. Content editors have no CRM or WhatsApp access (personal data).

## For AI Agents

### Working In This Directory

- **One answer per permission question.** Add a capability only by editing the `CAPABILITIES` table
  (`as const satisfies Record<string, readonly Role[]>`); never branch on `role === '…'` at a call site.
  (Known exception: `data/admin/leads.ts#listAssignees` filters roles in JS.)
- **Guards use `redirect()` and `notFound()`, not `unauthorized()`/`forbidden()`.** Those are gated by
  the experimental `authInterrupts` flag and silently do nothing without it (an e2e test caught
  `/admin/users` returning 200 to an editor). A failed capability yields a 404 on purpose.
- `getSession()` passes `query: { disableCookieCache: true }`. The cookie cache would make `role` and
  `banned` up to 60 s stale, which defeats bans and demotions. Don't "optimise" it away; it costs one
  query per admin request.
- `requireUser()` redirects unauthenticated users to `/admin/login` and returns 404 for banned users
  (a ban is enforced on read, not only at sign-in).
- `can()` is for building UI only. Never use it to protect data; pair with `requireCapability` in the
  data layer (`src/data/admin/*`) or the Server Action.
- Call `requireCapability` at the **top of every Server Action and admin reader**; a Server Action
  reached directly bypasses layouts. The action's returned `user` is the actor for `recordAudit`.
- `server.ts`'s `ac`/`roles` govern only better-auth's own user-management API (who may ban,
  impersonate, list accounts): only `owner` gets `adminAc.statements`. It is **not** the application
  permission model.
- `BETTER_AUTH_URL` must exactly match the deployed origin (`trustedOrigins` is built from it,
  `NEXT_PUBLIC_APP_URL` and `BETTER_AUTH_TRUSTED_ORIGINS`), otherwise sign-in fails and looks like a
  wrong password. Opt extra origins in via env; don't infer from `NODE_ENV`.
- Never change `user`/`session`/`account`/`verification` table or column names; the adapter expects them.

### Invite-only flow

1. **No public sign-up**: `disableSignUp: true`. Accounts come from exactly two paths.
2. **Bootstrap** (`npm run auth:bootstrap` → `scripts/bootstrap-owner.ts`): a CLI, no HTTP surface.
   Needs `INITIAL_OWNER_EMAIL`; refuses if any owner exists; uses `INITIAL_OWNER_PASSWORD` (≥ 12 chars) or
   prints a generated password once. Creates the user via `auth.$context.internalAdapter`.
3. **Invitation** (`src/app/(admin)/admin/_actions/users.ts`):
   - `inviteUser` (`users.manage`) generates a 32-byte base64url token, stores only its SHA-256
     (`invitation.token_hash`), TTL 72 h, revokes earlier open invitations for the same address inside
     one transaction with an audit row, returns the URL `/admin/invite/<token>` and emails it via Resend
     if configured (the link is returned either way).
   - `acceptInvitation` is unauthenticated (the token is the authorization): looks up by hash, rejects
     revoked/accepted/expired with one generic error, takes the **role from the invitation**, creates
     the user and credential account through better-auth's internal adapter, then sets `accepted_at`.
     Those steps are separate statements, not one transaction, despite what its doc comment says.
   - Other `users.manage` actions: `revokeInvitation`, `changeUserRole` (refuses to demote the last
     owner; deletes the user's sessions), `setUserBanned`, `setUserPassword`.
4. `/admin/login`, `/admin/invite*` and `/admin/reset-password*` are open in `proxy.ts`; everything else
   under `/admin` needs the `better-auth.session_token` cookie (or its `__Secure-` form) just to render.
5. Password reset by email (`sendResetPassword`) is the owner's only self-service recovery path.

### Testing Requirements

- `tests/unit/guards.test.ts` imports `CAPABILITIES`, `roleCan` from `guards.ts` and `ROLES` from
  `server.ts` and tests the matrix as data. Update it whenever a capability or role changes.
- Integration tests replace this module wholesale (`vi.mock('@/lib/auth/guards')` in
  `tests/integration/publishing.test.ts`), so they do not prove authorization; it is proven in e2e:
  `tests/e2e/users.spec.ts` (invitation tokens, last-owner demotion, role refusal, ban sign-out, password
  reset), `admin.spec.ts` (wrong password handling), `auth.setup.ts` (stored admin session, needs
  `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD`).

### Common Patterns

- `const { user: actor } = await requireCapability('x.y');` then use `actor.id` for audit.
- Capability strings are namespaced `<area>.<verb>`.

## Dependencies

### Internal

- `@/db/client`, `@/db/schema/auth`, `@/env` (`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
  `BETTER_AUTH_TRUSTED_ORIGINS`, `RESEND_API_KEY`, `EMAIL_FROM`), `@/lib/logger`
- Consumers: every `src/data/admin/*` file, `src/app/(admin)/admin/_actions/*`, `src/proxy.ts`
  (cookie names), `src/app/api/preview/route.ts` (`getSession`), `src/app/api/auth/[...all]`

### External

- `better-auth` (+ `plugins`, `plugins/access`, `adapters/drizzle`, `client`, `react`), `resend`
  (dynamic import), `next/headers`, `next/navigation`

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
