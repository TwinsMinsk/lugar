# admin

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-28 · **Updated:** 2026-10-28

## Purpose

The UI half of the back office: forms, editors, boards and tables that `src/app/(admin)/admin/**`
pages mount. These components hold no authority. Every mutation calls a server action in
`src/app/(admin)/admin/_actions/*` (which runs `requireCapability()`), and every read arrives as props
from `src/data/admin/*`. The panel is Russian-only and does not use `messages/*.json`; action failures
come back as **codes** that `messages.ts` words.

## Key Files

### Shared plumbing

| File | Description |
|------|-------------|
| `use-action.ts` | Client hook `useAction(overrides)` → `{ busy, isBusy(key), error, status, blockedBy, run(action, { key, success, onDone }) }`. Catches thrown actions (e.g. `requireCapability` → `notFound()`), words error codes via `messagesFor`, refreshes the route only on success. Use it instead of hand-rolled `useTransition`. |
| `messages.ts` | `BASE_ERRORS` (code → Russian sentence) and `messagesFor(overrides)` resolver; unknown codes fall back to `unexpected` (+ dev console warning). |
| `localized-fields.ts` | `collectLocalizedFields` (finds `{ru,es,en}` string leaves by shape), `setAtPath` (immutable `a.b[0].c` set), `getAtPath`. Drives the generic block text editor. |
| `media-fields.ts` | `collectMediaSlots(schema, data)`: walks the **Zod schema** for `mediaRef` (`meta().media === true`) so empty optional slots still get a picker; does not descend into unions. |
| `page-labels.ts` | `pageLabel(seedKey, fallback)`: Russian names for the ten seeded system pages (`page.home`, `page.kontakty`, …). |
| `sign-out-button.tsx` | Client; `authClient` sign-out. Used by the panel layout. |

### Pages editor (content CMS)

| File | Description |
|------|-------------|
| `block-editor.tsx` | Client `BlockEditor({ documentId, initialBlocks, revisions, publishedLocales, assets, template, isSystem })`: palette (`blocksAllowedOn`, `maxPerPage`, `blockNeedsMedia`), keyboard-first reorder, hide, remove (structural blocks on system pages are not removable), per-locale text fields, media pickers, `saveDraft` / `publishDocument` / `unpublishDocument` / `rollbackDocument`, revision history. |
| `seo-editor.tsx` | Client; title (≤70) and description (≤180) per locale via `updateSeo`. |
| `address-editor.tsx` | Client; per-locale slug via `updateSlug` (published rename writes a 301 automatically). |
| `redirects-editor.tsx` | Client; add / enable / delete redirect rules (`_actions/redirects`), loop and external-destination errors. |
| `document-removal.tsx` | Client; archive → restore → purge for pages and projects (`_actions/removal`), wording per kind. |
| `portfolio-forms.tsx` | Client; `CreateProjectForm` and `ProjectMetaForm` (slug derived from the Russian title, categories) via `_actions/portfolio`. |

### Media library

| File | Description |
|------|-------------|
| `media-manager.tsx` | Client library screen: upload (alt text required), edit alt/focal point, replace, remove / restore / purge (`media.delete` gates the archive section). |
| `media-picker.tsx` | Client modal `MediaPicker` + exported `PickableAsset`; lists placeholders too; can upload inline via `uploadMedia`. Used by `block-editor` and `settings-form`. |
| `file-drop.tsx` | Client `FileDropField`: styled, drag-aware wrapper that keeps a real `sr-only` file input. Used by manager and picker. |

### CRM: leads, contacts, WhatsApp, pipeline

| File | Description |
|------|-------------|
| `leads-table.tsx` | **Server component** (no JS): inbox as a GET form + links; filters (`status`, `assignee`, `q`, `cursor`, `view=archived`) live in the URL via `buildHref`. |
| `lead-board.tsx` | Client Kanban board; moving a card is a labelled `<select>` calling `changeLeadStatus` (keyboard-first). |
| `lead-actions.tsx` | Client: status, assignee, note and tasks on one lead (`_actions/leads`). |
| `lead-removal.tsx` | Client: archive (`crm.write`), restore, delete (owner-only, hides row only). |
| `whatsapp-panel.tsx` | Client: thread, pending/failed outbox items, 24-hour window state, free-text vs template send, requeue / cancel outbox messages, phone hand-off link (`_actions/whatsapp`). |
| `contact-editor.tsx` | Client; editable half of a contact (phone is shown, not editable: it is the join key). |
| `contact-merge.tsx` | Client; merge a duplicate by typing its phone, with a confirmation naming both sides. |
| `contact-removal.tsx` | Client; archive / delete a client (blocked while it has active leads). |
| `pipeline-editor.tsx` | Client; funnel stages: create, edit label/colour/outcome (open / won / lost), reorder (`moveStage`), `setDefaultEntry`, archive with lead migration and restore; entry stage and last stage protected. |

### Navigation, settings, users, audit

| File | Description |
|------|-------------|
| `navigation-editor.tsx` | Client; the `header` / `footer_primary` / `footer_legal` menus; item targets `document` / `external` / `anchor`; create, update, delete, keyboard `nudge` and `move` reorder. |
| `settings-form.tsx` | Client; renders `SettingField[]` from `content/settings-registry` grouped, with `MediaPicker` for `media` kinds; submits through `updateSettings` (validation is server-side). |
| `users-manager.tsx` | Client; invite by email, `changeUserRole`, `setUserBanned`, `setUserPassword` (owner sets one for a user), `revokeInvitation`; last-owner and self-ban guarded (`_actions/users`). |
| `accept-invite-form.tsx` | Client; set a password from an invitation token (single generic `invalid_invitation` message on purpose). |
| `change-password-form.tsx` | Client; goes through `authClient` (better-auth's rate limiter), revokes other sessions, then records an audit row via `_actions/account`. |
| `audit-log.tsx` | **Server component**; filters and paging in the URL; `ACTION_LABEL` maps audit action keys to Russian labels. |

## For AI Agents

### Working In This Directory

- **No authorization lives here.** Hiding a button is cosmetic; the matching action must call
  `requireCapability()` (`src/lib/auth/guards.ts`). When you add a screen, add the capability check to
  the action and the data reader, not the component.
- **Actions return codes, not prose.** Add a new code's Russian sentence to `BASE_ERRORS` (shared) or
  to the screen's own `ERRORS`/`messagesFor({...})`, and resolve through `useAction` / `messagesFor`.
  Never print `Ошибка: ${code}`; `tests/unit/error-vocabulary.test.ts` greps this directory for it and
  fails on English phrases.
- Mutations: `const { run, isBusy, error, status } = useAction(ERRORS)` and pass a per-row `key`.
  Do not refresh the route yourself on failure.
- **Reorder / move controls must work from the keyboard** (select + up/down buttons, `aria-live`
  announcements). Drag-and-drop may be layered on top, never alone.
- Destructive actions use `ConfirmButton` / `InlineConfirm` from `@/components/ui/dialog`, with the
  archive → purge two-step used throughout.
- **Block editing is generic** (`localized-fields.ts`, `media-fields.ts`): a new block's strings and
  images appear automatically, but rich text, enums, booleans and numbers do not. See
  `src/content/blocks/AGENTS.md` before adding fields.
- `leads-table.tsx` and `audit-log.tsx` are Server Components on purpose (filters in the URL,
  readable without a bundle). Do not add `'use client'` or state to them.
- Props crossing the server→client boundary must be serialisable: dates become ISO strings
  (`SerializedColumn.createdAt`), Zod schemas are stripped (`settingFields()`).
- UI copy is Russian and hard-coded here; do not move it into `messages/`.

### Testing Requirements

- Unit: `tests/unit/error-vocabulary.test.ts` (`messages.ts`, source scan of this folder),
  `tests/unit/media-fields.test.ts` (`collectMediaSlots`).
- E2E (`tests/e2e/`): `admin.spec.ts` (edit → publish → live → rollback, draft preview),
  `block-media.spec.ts`, `portfolio.spec.ts`, `media.spec.ts`, `navigation.spec.ts`,
  `pipeline.spec.ts`, `leads.spec.ts`, `contacts.spec.ts`, `redirects.spec.ts`, `removal.spec.ts`,
  `settings.spec.ts`, `users.spec.ts`, `accessibility-admin.spec.ts`. Admin specs need
  `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD`.

### Common Patterns

- `inputClass = cn('border-line-strong bg-surface …')` is repeated per file; keep tokens, not new
  colours.
- `ERRORS` object at the top of each file → `messagesFor(ERRORS)` / `useAction(ERRORS)`.
- Status/error live regions: `<span role="status">` and `<span role="alert" className="empty:hidden">`
  stay mounted so screen readers announce changes.

## Dependencies

### Internal

- `@/app/(admin)/admin/_actions/*` (`content`, `contacts`, `leads`, `media`, `navigation`, `pipeline`,
  `portfolio`, `redirects`, `removal`, `settings`, `users`, `whatsapp`, `account`)
- `@/data/admin/*` (types: `leads`, `lead-statuses`, `audit`, `whatsapp`), `@/content/blocks/*`,
  `@/content/settings-registry`, `@/components/ui/{button,dialog}`, `@/lib/auth/client`,
  `@/lib/{format,utils}`, `@/i18n/routing`
- Mounted by `src/app/(admin)/admin/(panel)/**` and `.../invite/[token]`

### External

- `react` 19, `next/navigation` (`useRouter`), `zod` (types only in `media-fields.ts`), `better-auth` client

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
