# data

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-28 · **Updated:** 2026-10-28

## Purpose

The data-access layer: every read the pages and admin screens perform, plus the cache-tag vocabulary
and the helpers that expire those tags after a mutation. The directory is split in two on purpose, and
the split is a security boundary, not a tidiness choice. With no RLS (architecture §1), the only things
standing between a visitor and a draft or a lead are these modules:

- `public/` holds anonymous, cached, published-only reads. No function there calls
  `requireCapability`, and none returns CRM data.
- `admin/` holds private, uncached reads. Every export (with two noted exceptions) begins with
  `await requireCapability(...)`.

Mutations are **not** here. They live in Server Actions (`src/app/(admin)/admin/_actions/*.ts`,
`src/features/leads/actions.ts`), which import from here only to read and to expire caches.

## Key Files

| File | Description |
|------|-------------|
| `cache-tags.ts` | `tags` object (the only place a tag string is spelled) and `PUBLIC_CACHE_PROFILE = 'minutes'`. Tags: `path:{kind}:{locale}:{slug}`, `doc:{id}:{locale}`, `revision:{id}`, `projects-index:{locale}`, `nav:{locale}`, `settings`, `media:{assetId}`, `taxonomy`, `redirects`. Not `server-only`; imported by both public readers and admin actions. |
| `cache-invalidation.ts` | Per-document expiry. `readDocumentLocaleRefs(documentId)` snapshots `(locale, slug, kind)` rows; `invalidateDocumentRefs(documentId, refs)` calls `updateTag` for `path`, `document`, `projectsIndex`, `navigation` per ref; `invalidateDocument(documentId)` does both. Used by `_actions/content.ts` (five call sites: the publishing-state mutations) and `_actions/removal.ts`. |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `public/` | Cached published-only reads for the public site (see `public/AGENTS.md`) |
| `admin/` | Capability-guarded, uncached reads for the back office (see `admin/AGENTS.md`) |

## For AI Agents

### Working In This Directory

- **Never import `admin/*` from a public page or `public/*` internals into an admin screen to "reuse a
  query".** The one sanctioned cross-import is type-only: `admin/documents.ts` imports `DocumentMeta`
  from `../public/documents`. Everything else duplicates the query deliberately (compare
  `public/navigation.ts` `getNavigation` with `admin/navigation.ts` `listNavigation`: the public one
  silently drops unpublished targets, the admin one reports which locales hide an item).
- **There are two cache-invalidation modules.** This one is document-scoped; `src/lib/cache-invalidation.ts`
  is site-wide (`invalidatePublicPages`). See `src/lib/AGENTS.md` for when to use which. Neither covers
  `revision:*`, `media:*`, `redirects` or `taxonomy`: media, portfolio and redirect actions call
  `updateTag(tags.…)` inline. Nothing in `src` calls `updateTag(tags.taxonomy())`, so taxonomy changes
  only reach the site when the `minutes` profile expires.
- `updateTag` is valid only inside a Server Action. `invalidateDocument*` therefore must not be called
  from a Route Handler or a Server Component.
- Take the `readDocumentLocaleRefs` snapshot **before** the transaction when the mutation deletes
  `document_locales` rows (`_actions/removal.ts` does); afterwards there is nothing left to read.
- Add new tags to `cache-tags.ts` only. A tag string typed inline in a reader and an action will drift
  and present as "publishing doesn't work".
- Do not raise `PUBLIC_CACHE_PROFILE` to `'max'` while the web service is single-replica with the
  default per-instance cache handler (architecture §5).
- Tag names in `docs/architecture.md` §5 must match `tags` in `cache-tags.ts`; update both together.

### Testing Requirements

- `tests/integration/publishing.test.ts` mocks `next/cache` (`updateTag` spy) and `@/lib/auth/guards`,
  runs the real actions against Postgres and asserts `path:page:ru:<slug>` and `doc:<id>:ru` are
  expired on publish.
- `tests/unit/content.test.ts` pins `coerceSettingString` (`public/settings.ts`);
  `tests/unit/structured-data.test.ts` uses the `SiteSettings` type.
- Cached readers are only exercised end to end: `tests/e2e/admin.spec.ts` (edit, publish, rollback,
  draft preview), `navigation.spec.ts`, `settings.spec.ts`, `redirects.spec.ts`, `removal.spec.ts`,
  `portfolio.spec.ts`, `public-site.spec.ts`.

### Common Patterns

- Every file starts with `import 'server-only'` (except `cache-tags.ts`).
- Public reader: `'use cache'` → `cacheLife(PUBLIC_CACHE_PROFILE)` → one or more `cacheTag(tags.…)`
  → query. Tag every cached function with the exact tag its invalidating action expires.
- Admin reader: `await requireCapability('<cap>')` as the first statement, then a query.
- Keyset pagination with a `"<iso>|<id>"` cursor and a row-value comparison `(col, id) < (…)`
  (`admin/audit.ts`, `contacts.ts`, `leads.ts`); `limit + 1` rows to detect a next page.
- JSONB label columns are cast on the way out: `(row.label ?? {}) as LocalizedText`.

## Dependencies

### Internal

- `@/db/client`, `@/db/schema` — Drizzle `db` and tables
- `@/lib/auth/guards` — `requireCapability` (admin only)
- `@/i18n/routing` — `Locale`, `LOCALES`
- `@/content/blocks/union` — `anyBlockSchema` for per-block validation on read
- `@/lib/redirects` — `followRedirect` shared by public and admin redirect readers

### External

- `next/cache` — `cacheLife`, `cacheTag`, `updateTag`; `next/headers` — `draftMode`
- `drizzle-orm`

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
