# _actions

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-28 · **Updated:** 2026-10-28

## Purpose

Every state-changing operation of the admin panel, as `'use server'` modules. The leading underscore
keeps the folder out of routing. Client components in `src/features/admin/*` import these directly,
mostly through the `useAction` hook (`media-manager`, `settings-form`, `change-password-form` and
`accept-invite-form` call them without it). Reads do not live here —
they are `src/data/admin/*`.

## Key Files

| File | Description |
|------|-------------|
| `_result.ts` | Not a `'use server'` file. `ActionOutcome` / `ActionFailure` types, `codeFromZod()` and `failFromZod()`: a Zod issue becomes an error **code** if its message matches `/^[a-z0-9_]+$/` (schemas carry codes such as `'slug_format'`), otherwise `invalid_input`. |
| `account.ts` | `recordPasswordChange()` — guard `requireUser`; writes audit `users.password_changed` for a change the browser already made through better-auth. Never records the password or its length. |
| `contacts.ts` | `updateContact` (`crm.write`; name/email/city/notes only — phone and consent are deliberately not editable), `mergeContacts` (`crm.delete`; moves leads, submissions, activities, tasks, projects, WhatsApp rows and consent records to the kept contact in one transaction, soft-deletes the other), `archiveContact` / `restoreContact` (`crm.write`), `deleteContact` (`crm.delete`, soft). All audit via the local `auditContact` helper, which records field *names*, never values. |
| `content.ts` | CMS core: `saveDraft` (`content.write`, strict `blocksSchema`, resyncs `media_usage`), `publishDocument` (`content.publish`; freezes the draft, points chosen locales at it, clones a new draft, in one transaction), `rollbackDocument` (`content.rollback`; pointer move to a non-draft revision of the same document), `unpublishDocument` (`content.publish`; refuses `isSystem` documents), `updateSlug` (`content.write`; rejects empty slug and moving the home page, auto-writes a 301 into `redirects` when the locale was published), `updateSeo` (`seo.write`; merges per-locale title/description into the draft revision's `meta`). |
| `leads.ts` | `changeLeadStatus`, `assignLead`, `addLeadNote`, `createLeadTask`, `completeLeadTask`, `reopenLeadTask`, `deleteLeadTask`, `archiveLead`, `restoreLead` (all `crm.write`), `deleteLead` (`crm.delete`; soft, only from the archive). Each writes a `lead_activities` row in the same transaction; only `deleteLead` writes to the audit log. |
| `media.ts` | `uploadMedia` / `replaceMedia` (`media.write`; FormData, `processUpload` makes derivatives, `alt_required`, dedupes by SHA-256), `updateMediaMeta` (`media.write`), `deleteMedia` (`media.delete`; soft, refuses with `blockedBy` pages if used by a published revision), `restoreMedia`, `purgeMedia` (`media.delete`; only if never referenced by any revision; storage emptied after the row, failure tolerated). |
| `navigation.ts` | `createNavigationItem`, `updateNavigationItem`, `moveNavigationItem`, `nudgeNavigationItem`, `deleteNavigationItem` (`navigation.write`). Target is a discriminated union (document / external http(s) / anchor); `ru` label required. |
| `pipeline.ts` | `createStage`, `updateStage`, `setDefaultEntry`, `moveStage`, `archiveStage` (needs a destination for existing leads), `restoreStage` — all `settings.write`. Sort order in steps of 100. |
| `portfolio.ts` | `createProject` (`content.write`; seeds a block skeleton, unpublished in every locale), `updateProjectMeta` (`content.write`), `archiveProject` (`content.publish`). Returns ids; the caller navigates (never `redirect()` inside the try/catch). |
| `redirects.ts` | `createRedirect`, `setRedirectActive`, `deleteRedirect` (`seo.write`); `wouldLoop()` guards cycles against the active map. |
| `removal.ts` | Document removal in two levels, all `content.delete`: `archiveDocument` (unpublishes and hides), `restoreDocument`, `purgeDocument` (real DELETE, only for something never published; returns `blockedBy` otherwise). |
| `settings.ts` | `updateSettings` (`settings.write`) — validates each key against `SETTINGS_BY_KEY`; unknown key → `unknown_setting`; empty value → `null` + `needs_review = true`; audit stores keys only. Returns `{ok:false, errors: Record<key, code>}`, a different shape from the rest. |
| `users.ts` | `inviteUser`, `revokeInvitation`, `changeUserRole`, `setUserBanned`, `setUserPassword` (all `users.manage`), and `acceptInvitation` (**unauthenticated**; the token is the credential, stored as SHA-256 hash, 72 h TTL, role comes from the invitation). Guards: not yourself, never the last owner. `changeUserRole`, `setUserBanned` (when banning) and `setUserPassword` delete the target's sessions. |
| `whatsapp.ts` | `sendWhatsAppText` / `sendWhatsAppTemplate` (`whatsapp.send`; both require `whatsapp().canSendProgrammatically` and the contact's `waOptIn`, then queue an outbox row + `lead_activities` row; text additionally requires an open 24 h window, re-checked here), `requeueOutboxMessage` / `cancelOutboxMessage` (`whatsapp.requeue`; audited). Nothing here calls Meta — the worker delivers. |

## For AI Agents

### Working In This Directory

**The pattern every action follows (copy it):**

1. `'use server'` first line. Export only async functions plus types; helpers and constants stay
   unexported (a `'use server'` file may not export values). Shared non-async code goes to `_result.ts`
   or `src/lib`.
2. **Authorise first**: `const { user: actor } = await requireCapability('<cap>')` (or `requireUser()`
   for self-service). Capabilities come from the one table in `src/lib/auth/guards.ts`; add new ones
   there, with unit test coverage, not as role checks in the action.
   - `requireCapability` signals refusal with `notFound()`, which **throws**. Never wrap it in
     `try/catch`; it must run before any `try`. `useAction` passes Next's control-flow exceptions through with `unstable_rethrow`.
3. **Validate with Zod** (`schema.safeParse(input)`, input typed `z.input<typeof schema>`). One id →
   `z.uuid().safeParse(id).success`, else `{ ok: false, error: 'invalid_input' }`. Put *codes* in schema
   messages (`.regex(re, 'slug_format')`) and use `failFromZod` / `codeFromZod`; most actions simply return
   `invalid_input`. Never return a sentence or a raw DB error.
4. **Check state, then write in one `db.transaction`**: look the row up (soft-deleted rows excluded:
   `isNull(deletedAt)` / `archivedAt`), return a code such as `not_found`, then mutate.
5. **Audit in the same transaction**: `recordAudit({ actorUserId, action, entityType, entityId, before?,
   after?, ...(await auditRequestContext()) }, tx)`. Call `auditRequestContext()` *inside* the action
   (request-scoped `headers()`). Store summaries/keys/ids, never personal data, passwords, or hashes
   (`summarizeBlocks` for block lists). Action names are `domain.verb` (`content.published`,
   `media.purged`, `users.role_changed`). CRM timeline changes go to `lead_activities` instead; only
   access-type events (delete, export) go to the audit log.
6. **Invalidate caches after the transaction commits** — only if the public site reads the data:
   - document content/slug/publish/rollback/unpublish → `invalidateDocument(id)`
     (`src/data/cache-invalidation.ts`); removal → `invalidateDocumentRefs(id, refs)` with a snapshot taken
     *before* a purge deletes the rows;
   - navigation/settings → `invalidatePublicPages()` (`src/lib/cache-invalidation.ts`, tags every published path);
   - media → `updateTag(tags.media(id))` (+ nav tags; `replaceMedia` also each using document);
   - redirects → `updateTag(tags.redirects())`; portfolio → `tags.projectsIndex(locale)` / `tags.document(...)`.
   Use `updateTag` (immediate), not `revalidateTag`, and tag names only from `src/data/cache-tags.ts`.
   CRM, pipeline, users, WhatsApp and `saveDraft` touch no public cache.
7. Return `{ ok: true }` or `{ ok: false, error: '<code>' }` (optionally `blockedBy`). Throw `new Error('code')`
   inside the transaction for rollback and convert with `failureCode()` (see `content.ts`, `media.ts`).
8. Add every new code to `BASE_ERRORS` in `src/features/admin/messages.ts` (per-screen dictionaries merge
   over it via `messagesFor`). `error-vocabulary.test.ts` scans this folder for `error: 'code'`,
   `errors[key] = 'code'` and `throw new Error('code')` literals and fails if a code is missing from
   `BASE_ERRORS` — so keep codes lowercase snake_case literals.

Traps:

- `redirect()` inside a `try/catch` is swallowed — return data and let the client navigate.
- `portfolio.archiveProject` (`content.publish`) and `removal.archiveDocument` (`content.delete`) overlap;
  `archiveProject` is the one `portfolio-forms.tsx` uses, `archiveDocument` serves page/project lists.
- Not every audit write is transactional: `pipeline.ts` create/update/restore, `account.ts` and
  `users.acceptInvitation` call `recordAudit` outside a transaction. Prefer the transactional form.
- `acceptInvitation` is the only action without a guard; keep it that way only because the token
  authorises it, and keep every failure returning `invalid_invitation`.
- Public/non-owner roles: destructive operations are owner-only (`*.delete`, `whatsapp.requeue`,
  `settings.write`, `users.manage`); do not downgrade one to make a button work.

### Testing Requirements

- `tests/integration/publishing.test.ts` imports `content.ts` and runs it for real against Postgres with
  `guards`, `next/headers` and `next/cache` mocked — extend it for any publish/rollback/draft change.
- `tests/unit/guards.test.ts` — the role/capability matrix (update it when adding a capability).
- `tests/unit/error-vocabulary.test.ts` — reads this folder's source text and checks every code literal found has a phrase in `BASE_ERRORS` and that phrases are not English.
- E2E per area: `leads.spec.ts`, `contacts.spec.ts`, `media.spec.ts`, `navigation.spec.ts`,
  `pipeline.spec.ts`, `portfolio.spec.ts`, `redirects.spec.ts`, `removal.spec.ts`, `settings.spec.ts`,
  `users.spec.ts`, `whatsapp-webhook.spec.ts`, `admin.spec.ts` (content, SEO, slug, publish).

### Common Patterns

- Result type per file (`LeadResult`, `ContactResult`, `PipelineResult`, …) are all
  `{ ok: true } | { ok: false; error: string }` variants; keep new ones structurally compatible with
  `useAction`'s `Outcome` (`ok`, `error?`, `blockedBy?`).
- Soft delete in two steps (archive → delete) for leads, contacts, media, documents.
- Idempotent no-ops return `{ ok: true }` early (`changeLeadStatus` to the same status, `updateSlug`
  to the same slug).

## Dependencies

### Internal

- `@/lib/auth/guards`, `@/lib/audit`, `@/lib/cache-invalidation`, `@/data/cache-invalidation`,
  `@/data/cache-tags`, `@/db/client` + `@/db/schema`, `@/content/blocks/*` (`blocksSchema`,
  `collectMediaUsage`), `@/content/settings-registry`, `@/lib/media/process`, `@/lib/storage`,
  `@/lib/whatsapp`, `@/lib/redirects`, `@/lib/auth/server` (`auth`, `ROLES`), `@/i18n/routing`.

### External

- zod 4, drizzle-orm, `next/cache` (`updateTag`), `libphonenumber-js` (contacts), `resend` (invite email).

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
