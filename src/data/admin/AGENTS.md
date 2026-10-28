# admin

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-28 · **Updated:** 2026-10-28

## Purpose

Private, uncached **read** queries for the back office (`/admin`). Each exported function begins with
`await requireCapability('<capability>')` from `src/lib/auth/guards.ts`, which is the real access
boundary: the admin layout guard only prevents a shell flashing and `proxy.ts` only checks that a
session cookie exists. A failed capability renders a 404, not a 403.

There are no mutations and no transactions in this directory. Writes (and every `db.transaction`,
each pairing the change with `recordAudit(..., tx)`) live in `src/app/(admin)/admin/_actions/*.ts`
and `src/features/leads/actions.ts`.

## Key Files

| File | Capability | Description |
|------|-----------|-------------|
| `audit.ts` | `audit.read` | `listAuditEntries` (keyset pages, filters by action/actor/entity type, max 100), `listAuditActions`, `listAuditActors`. |
| `contacts.ts` | `crm.read` | `listContacts` (search by name/email/digits of phone, archived toggle), `getContact` (leads, projects, full consent trail, WhatsApp message count). |
| `documents.ts` | `content.read` | `listDocuments(kind, {archived})`, `getDocumentForEditing` (draft revision; invalid blocks counted not dropped silently), `listRevisions` (rollback picker). |
| `lead-statuses.ts` | `crm.read` | `listPipeline`, `listArchivedStages` (with lead counts). |
| `leads.ts` | `crm.read` | `listLeads`, `countLeadsByStatus`, `countArchivedLeads`, `listLeadStatuses`, `listAssignees` (owner/manager, not banned), `getLead`, `getLeadBoard` (25 cards per column, 5-day stale flag), `getCrmSummary`. |
| `media.ts` | `media.read` | `countPlaceholderMedia`, `listMedia` (offset paging, thumbnail = smallest webp derivative, `usageCount`, `usedOnPublishedPage`). |
| `navigation.ts` | `navigation.write` / `content.read` | `listNavigation` (grouped by `MENUS`, reports `hiddenIn` locales), `listNavigationTargets` (`navigation.write`); `getPortfolioIndexSlugs` (`content.read`, used by the project editor). |
| `portfolio.ts` | `content.read` / `media.read` | `getProjectMeta`, `listCategoriesForAdmin`, `listProjectCards` (content.read); `listPickableAssets` (media.read). |
| `redirects.ts` | `seo.write` | `listRedirects` with `resolvesTo` after following chains via `followRedirect`. |
| `settings.ts` | `settings.write` | `listRawSettings` — stored values plus `needsReview`; deliberately not `getSiteSettings()`. |
| `users.ts` | `users.manage` | `listUsers`, `listPendingInvitations` (excludes accepted/revoked; flags `expired`). |
| `whatsapp.ts` | `whatsapp.read` / `whatsapp.send` | `getWhatsAppThread` (last 100), `getPendingMessages`, `getWindowState` (23h55m window); `listApprovedTemplates` (`whatsapp.send`) calls the Graph API live and returns `[]` on any failure. |

## For AI Agents

### Working In This Directory

- **First statement of every new export must be `await requireCapability(...)`.** Pick the capability
  from the matrix in `src/lib/auth/guards.ts`; do not invent a string (it is a typed union). Content
  editors have `content.*`, `media.*`, `navigation.write`, `seo.write`; managers have `crm.*` and
  `whatsapp.read/send`; only owners have `settings.write`, `users.manage`, `audit.read`.
- `listAssignees` filters on `user.role` in JS (`owner`/`manager`) instead of calling `roleCan`; if the
  CRM capability set changes, update it by hand.
- In raw `sql` subqueries, **alias the inner table and name the outer column in full**
  (`l.contact_id = contacts.id`). Interpolating the Drizzle column object renders a bare `id` that binds
  to the subquery table and silently counts 0 (documented twice: `contacts.ts`, `lead-statuses.ts`).
- Do not pass a JS `Date` into a raw `sql` fragment (driver cannot infer the type); keep the interval
  in SQL as `getCrmSummary` does.
- Soft-delete/archive semantics: lists filter `deleted_at is null` and `archived_at is null` (or
  `is not null` for archive views). Keep both predicates in step with the partial indexes in
  `src/db/schema/crm.ts` (`leads_board_idx`, `leads_archived_idx`).
- Admin readers never touch `'use cache'`; the panel must show fresh data.

### Testing Requirements

- The capability matrix itself is unit-tested as data: `tests/unit/guards.test.ts`.
- No test imports a reader from this directory directly. `tests/integration/publishing.test.ts` mocks
  `@/lib/auth/guards` and exercises the actions that sit beside these readers.
- End to end (`tests/e2e/`, need `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD`): `leads.spec.ts`,
  `contacts.spec.ts`, `pipeline.spec.ts`, `media.spec.ts`, `navigation.spec.ts`, `redirects.spec.ts`,
  `settings.spec.ts`, `users.spec.ts` (role gating, ban sign-out), `portfolio.spec.ts`, `removal.spec.ts`,
  `accessibility-admin.spec.ts`.

### Common Patterns

- `export async function listX(filter = {}) { await requireCapability('…'); … }`.
- Cursor pagination helpers `encodeCursor`/`decodeCursor` are copy-pasted per file (audit, contacts,
  leads); a malformed cursor decodes to `null` and shows page one rather than failing.
- Search terms escape `%`, `_`, `\` before `ilike`; phone search uses digits only and needs 4+.
- Result shapes are plain exported types (`AuditEntry`, `LeadListRow`, `AdminDocumentSummary`, …);
  `bigserial` ids are stringified (`String(row.id)`) before leaving the layer.

## Dependencies

### Internal

- `@/lib/auth/guards` (`requireCapability`), `@/db/client`, `@/db/schema`
- `@/lib/redirects` (`followRedirect`), `@/lib/whatsapp` (`whatsapp()`), `@/env`, `@/content/blocks/union`
- `../public/documents` (type `DocumentMeta` only), `@/features/admin/media-picker` (type `PickableAsset`)

### External

- `drizzle-orm` only (plus a `fetch` to `graph.facebook.com` in `whatsapp.ts`)

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
