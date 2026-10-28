# admin

**Parent context:** `../../AGENTS.md`
**Generated:** 2026-10-28 · **Updated:** 2026-10-28

## Purpose

The back office under `/admin`, in Russian. A separate root layout from the public site. Three
unauthenticated entry screens (login, invite, password reset) and the authenticated `(panel)` route
group, whose `layout.tsx` provides the navigation shell. All mutations are server actions in `_actions/`.

## Key Files

| File | Description |
|------|-------------|
| `layout.tsx` | Admin **root** layout: `<html lang="ru">`, imports `globals.css`, `bg-surface-muted` body, `robots: noindex, nofollow, nocache`. |
| `login/page.tsx`, `login/login-form.tsx` | Sign-in screen; redirects to `/admin` if already signed in. Client form calls `authClient.signIn.email`; one identical error for unknown user and wrong password; `?next=` honoured only if it starts with `/` and not `//`. No sign-up link. |
| `reset-password/page.tsx`, `reset-form.tsx` | Two-step form via `authClient.requestPasswordReset` and `authClient.resetPassword` (token from the emailed link). Public in `proxy.ts`. |
| `invite/[token]/page.tsx` | Renders `AcceptInviteForm` (`features/admin`) which calls `acceptInvitation` in `_actions/users.ts`. Intentionally does **not** validate the token while rendering (no token oracle). Public in `proxy.ts`. |
| `(panel)/layout.tsx` | `requireUser()`, then builds the nav from `NAV_GROUPS`, hiding items by `can(capability)` (groups with no visible items vanish); shows the "N settings awaiting real values" banner to `settings.write` holders (`getSiteSettings().pendingReview`); `export const instant = false`. |
| `(panel)/page.tsx` | Dashboard (`/admin`). |
| `_actions/` | Server actions — see `_actions/AGENTS.md`. |

### Panel routes (`(panel)/`, URL = `/admin/...`)

Leaf route folders carry no AGENTS.md of their own. "Guard" is what the page itself calls; pages marked
*data layer* rely on the `requireCapability` that every export in `src/data/admin/*` runs first.

| Route | What it does | Guard | Modules used |
|-------|--------------|-------|--------------|
| `/admin` (`page.tsx`) | Dashboard: today's enquiries (CRM summary), launch checklist (unpublished changes, placeholder media, settings awaiting values). Each block gated per capability. | `requireUser` + `can('crm.read' / 'content.write' / 'settings.write')` | `data/admin/documents` `listDocuments`, `data/admin/leads` `getCrmSummary`, `data/admin/media` `countPlaceholderMedia`, `data/public/settings`, `features/admin/page-labels` |
| `audit` | Filterable audit log (action / actor / entity, cursor paging). | `audit.read` | `data/admin/audit` (`listAuditEntries`, `listAuditActions`, `listAuditActors`), `features/admin/audit-log` |
| `contacts` | Client list with search, archive/delete controls. | `crm.read`; `can('crm.delete')` | `data/admin/contacts` `listContacts`, `features/admin/contact-removal` |
| `contacts/[id]` | One client: edit name/email/city/notes, merge duplicates, remove. `notFound()` if missing. | `crm.read`; `can('crm.delete')` | `data/admin/contacts` `getContact`, `features/admin/contact-editor`, `contact-merge`, `contact-removal` |
| `leads` | Lead inbox: status/assignee/search filters, archived view, CSV export link. | `crm.read`; `can('crm.export')`, `can('crm.delete')` | `data/admin/leads` (`listLeads`, `listLeadStatuses`, `countLeadsByStatus`, `listAssignees`, `countArchivedLeads`), `features/admin/leads-table` |
| `leads/[id]` | Lead card: timeline, status/assignee/notes/tasks, WhatsApp thread, archive/remove. | `crm.read`; `can('whatsapp.send')`, `can('whatsapp.requeue')`, `can('crm.delete')` | `data/admin/leads` `getLead`, `data/admin/whatsapp` (`getWhatsAppThread`, `getWindowState`, `getPendingMessages`, `listApprovedTemplates`), `features/admin/lead-actions`, `whatsapp-panel`, `lead-removal` |
| `leads/board` | Kanban by pipeline stage. | `crm.read` | `data/admin/leads` `getLeadBoard`, `listAssignees`, `features/admin/lead-board` |
| `media` | Photo library: upload, alt text, replace, archive/restore/purge, "placeholder only" filter, pagination. Builds URLs from `publicEnv.mediaBaseUrl` or `/api/media/{key}`. | *data layer* (`media.read`); `can('media.delete')` | `data/admin/media` `listMedia`, `features/admin/media-manager` |
| `navigation` | Header/footer menu editor. | `navigation.write` | `data/admin/navigation` (`listNavigation`, `listNavigationTargets`), `features/admin/navigation-editor` |
| `pages` | List of `page` documents (active and archived) with per-locale status. | *data layer* (`content.read`); `can('content.delete')` | `data/admin/documents` `listDocuments`, `features/admin/document-removal`, `page-labels` |
| `pages/[id]` | Page editor: block editor, SEO, slugs per locale, revision list / rollback, preview link. | *data layer* (`content.read`) | `data/admin/documents` (`getDocumentForEditing`, `listRevisions`), `data/admin/portfolio` `listPickableAssets`, `features/admin/block-editor`, `seo-editor`, `address-editor` |
| `pipeline` | Lead-stage editor (create, rename, reorder, default entry, archive/restore). | `settings.write` (owner-only) | `data/admin/lead-statuses` (`listPipeline`, `listArchivedStages`), `features/admin/pipeline-editor` |
| `portfolio` | Project list with category cards, create-project form, removal. | *data layer* (`content.read`); `can('content.delete')` | `data/admin/documents` `listDocuments`, `data/admin/portfolio` (`listProjectCards`, `listCategoriesForAdmin`), `features/admin/portfolio-forms`, `document-removal` |
| `portfolio/[id]` | Project editor: project meta (cover, category, featured, order) plus the same block/SEO/revision editors as pages. 404 if the document is not a `project`. | *data layer* (`content.read`) | `data/admin/documents`, `data/admin/portfolio` (`getProjectMeta`, `listCategoriesForAdmin`, `listPickableAssets`), `data/admin/navigation` `getPortfolioIndexSlugs`, `features/admin/portfolio-forms` `ProjectMetaForm`, `block-editor`, `seo-editor`, `address-editor` |
| `profile` | Own account: change password (any role). | `requireUser` only (no capability) | `features/admin/change-password-form` |
| `redirects` | Manual 301/302 rules (auto-created ones are labelled). | `seo.write` | `data/admin/redirects` `listRedirects`, `features/admin/redirects-editor` |
| `settings` | Site-wide settings form driven by `content/settings-registry`; shows count of keys still `needs_review`. | *data layer* (`settings.write` via `listRawSettings`) | `data/admin/settings`, `data/admin/portfolio` `listPickableAssets`, `content/settings-registry`, `features/admin/settings-form` |
| `users` | Staff list, invitations (shows invite URL), role/ban/password controls. | `users.manage` | `data/admin/users` (`listUsers`, `listPendingInvitations`), `features/admin/users-manager` |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `_actions/` | The 14 server-action files behind every panel mutation — see `_actions/AGENTS.md` |

## For AI Agents

### Working In This Directory

- **Every page here is dynamic.** `export const instant = false` is set on `(panel)/layout.tsx` and on the
  login, reset-password and invite pages (a documented Cache Components opt-out; the admin root layout
  does not set it). New session-reading pages should sit under `(panel)/` and inherit it; a page outside
  that layout needs its own export.
- **Guard in the page *and* the data layer.** `(panel)/layout.tsx` guards only the shell. A new screen
  must call `requireCapability(...)` (or call only `src/data/admin/*` functions, which do) and a new
  mutation must re-check inside its action. Capability failure calls `notFound()` (404, not 403) by design.
- **Menu visibility follows `NAV_GROUPS` in `(panel)/layout.tsx`.** Adding a screen means a new nav
  entry with the same capability the page enforces; otherwise the menu and the page disagree
  (this is what `content.read` for managers used to cause).
- Public admin paths are hard-coded in `src/proxy.ts` (`/admin/login`, `/admin/invite`,
  `/admin/reset-password`). A new unauthenticated admin route must be added there *and* must carry its own
  authorisation (a token), as invite and reset do.
- Hide controls by `can(...)` computed once in the page and passed as a prop; the server still refuses.
- Error text: actions return codes, never sentences; wording lives in `features/admin/messages.ts`
  (`BASE_ERRORS`, `messagesFor`) plus per-screen overrides.

### Testing Requirements

E2E (Playwright `admin` project; needs `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD`; `auth.setup.ts` stores
a session): `admin.spec.ts` (login, dashboard, page editor, preview), `leads.spec.ts`,
`contacts.spec.ts`, `pipeline.spec.ts`, `media.spec.ts`, `block-media.spec.ts`, `navigation.spec.ts`,
`portfolio.spec.ts`, `redirects.spec.ts`, `removal.spec.ts`, `settings.spec.ts`, `users.spec.ts`
(invite flow), `accessibility-admin.spec.ts` (axe over every screen). Capability matrix:
`tests/unit/guards.test.ts`. Publish/rollback logic: `tests/integration/publishing.test.ts`.

### Common Patterns

- Page shape: `export const metadata = { title }` → `await requireCapability(...)` → `Promise.all` of data
  reads and `can()` flags → render a feature component from `src/features/admin/*` passing data and flags.
- `searchParams` are Promises; repeated query parameters are collapsed with a `first()` helper (a repeat
  is "a probe, not a filter").
- Client components run actions through the `useAction` hook (`features/admin/use-action.ts`), which
  catches the `notFound()` that `requireCapability` throws and does not `router.refresh()` on failure.

## Dependencies

### Internal

- `@/data/admin/*`, `@/data/public/settings`, `@/features/admin/*`, `@/lib/auth/guards`,
  `@/lib/auth/client` (login/reset forms), `@/components/layout/logo`, `@/components/ui/button`.

### External

- better-auth client (`authClient`), Next.js navigation (`redirect`, `notFound`).

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
