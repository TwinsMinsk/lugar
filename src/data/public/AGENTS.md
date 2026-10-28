# public

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-28 · **Updated:** 2026-10-28

## Purpose

Anonymous, cached reads that feed the public trilingual site. This is the only data module visitors'
requests touch, so it is built to be incapable of returning unpublished content in normal mode:

- Normal mode: `document_locales.status = 'published'` **and** `published_revision_id IS NOT NULL`
  are hard-coded in every document query. No exported resolver accepts a revision id from a URL or
  form; the revision id comes from the row `resolvePage`/`resolveProject` just found.
- Preview mode: gated by Next's `draftMode()`, read through `previewState()`. Entering draft mode
  requires a signed token or an admin session (`src/app/api/preview/route.ts`,
  `src/lib/preview.ts`); this module only reacts to the flag.
- Archived documents (`documents.archived_at`) are excluded in **both** modes, so a removed page cannot
  be reached through a preview link that was already shared.

No function here calls `requireCapability` and none reads CRM tables.

## Key Files

| File | Description |
|------|-------------|
| `documents.ts` | Core reads. `previewState()`, `getPortfolioIndexSlug(locale)`, `resolvePreviewTarget` (uncached), `resolvePage`, `resolveProject`, `getRevision(revisionId)` (validates blocks one by one, drops invalid and `hidden` blocks, returns `invalidCount`), `getPublishedDocument`, `getLocaleAlternates` (hreflang), `listPublishedPaths` (sitemap). Types `PublishedRef`, `DocumentMeta`, `PublishedDocument`. |
| `page-loader.ts` | `loadPage(locale, segments)`: path shape → document → revision → batched dependencies (settings, projects, alternates, service categories, media, linked-document slugs) → `RenderContext` with `mode: 'public'`. `[]` is home, one segment a page, two segments a project only if the first equals this locale's portfolio-index slug; anything else is `null` (404). Not itself cached; composed of cached parts. |
| `navigation.ts` | `getNavigation(menu, locale)` (drops items whose target is unpublished in that locale) and `getDocumentSlug(documentId, locale)` (preview-aware; resolves CTA/teaser targets). |
| `portfolio.ts` | `getPortfolioCategories`, `getServiceCategories(direction)` (tag `taxonomy`), `listPublishedProjects(locale)` (title from the published revision's `meta.title`), plus uncached derivations `getProjectsByIds`, `getRelatedProjects`, `getProjectCategorySlugs`. |
| `media.ts` | `getMediaAssets(ids)`: dedupes and sorts ids, then one cached `inArray` query tagged `media:{id}` per id. |
| `settings.ts` | `getSiteSettings()` shapes `site_settings` into `SiteSettings`; `coerceSettingString` (JSONB digits come back as numbers). Nulls stay null; `pendingReview` lists `needs_review` keys. |
| `redirects.ts` | `resolveRedirect(path)` over one cached map (`getRedirectMap`, tag `redirects`) — only consulted after a path failed to resolve to a document. |

## For AI Agents

### Working In This Directory

- **Cached function recipe** (copy exactly):
  `'use cache'; cacheLife(PUBLIC_CACHE_PROFILE); cacheTag(tags.x(...));`. Profile is `'minutes'`, not
  `'max'`; do not change it while the app runs one replica (`../cache-tags.ts`).
- **Never read `cookies()`/`headers()` in a cached function**; `draftMode().isEnabled` is the one
  request-dependent input Next allows inside `use cache`, and while draft mode is on nothing under such
  a scope is written to the cache. That is what keeps a preview render out of the next visitor's page.
- **Do not use a cached function to resolve the first preview hop.** The preview route enables draft
  mode on its *response*, so within that request `previewState()` still answers `false`.
  `resolvePreviewTarget` is deliberately uncached for this reason. Reuse it, don't replace it with
  `getDocumentSlug`.
- Preview widens status to `published OR draft` and picks `draftRevisionId ?? publishedRevisionId`;
  it never widens past `archived_at IS NULL`. The same predicate is repeated in `resolvePage`,
  `resolveProject`, `getDocumentSlug`, `getPortfolioIndexSlug` and `resolvePreviewTarget`; change them
  together.
- `getRevision` is exported and takes a revision id: call it only with an id taken from a `PublishedRef`.
  Don't add a route or action that forwards a request-supplied id (docs say no such function exists;
  this one is the closest, protected only by its callers).
- Tag choice must match invalidation: `getLocaleAlternates` tags `doc:{id}:{locale}` for all locales;
  `listPublishedPaths` tags `projects-index` and `nav` for all locales; `getSiteSettings` tags
  `settings`. Nothing expires `taxonomy` today (see `../AGENTS.md`).
- The redirect map is intentionally one entry. Never key a cache entry by the requested path.
- `getMediaAssets` does not filter `deleted_at`: referenced assets still render on live pages.
- `loadPage` fans out with `Promise.all` and the cached parts take only primitive/sorted args so cache
  keys stay stable (`getMediaAssets` sorts ids). Preserve that when adding batched loaders.
- The outbox worker (`src/worker/outbox-worker.ts`) runs outside the Next compiler, so it must not
  import anything in this directory (it issues a plain query for `contact.email` instead of calling
  `getSiteSettings`).

### Testing Requirements

- Unit: `tests/unit/content.test.ts` (`coerceSettingString`), `tests/unit/redirects.test.ts`
  (`followRedirect`, used by `redirects.ts`), `tests/unit/structured-data.test.ts` (`SiteSettings`).
- Integration: no direct import. `tests/integration/publishing.test.ts` runs publish/rollback/unpublish
  against real Postgres and asserts the expired tag names that these readers use.
- E2E: `tests/e2e/public-site.spec.ts` (locale routing, hreflang, 404), `admin.spec.ts` ("a draft edit
  does not reach the public site until published", "draft preview" suite), `navigation.spec.ts`,
  `settings.spec.ts`, `redirects.spec.ts`, `portfolio.spec.ts`, `removal.spec.ts`.

### Common Patterns

- Per-block validation with `anyBlockSchema.safeParse`: fail toward dropping the block, never the page.
- Left-joins to `document_locales` carry the published predicate in the `ON` clause (`getNavigation`),
  so the join yields `null` instead of a draft slug.
- Labels and settings are JSONB; always `(x ?? {}) as LocalizedText` and treat absence as "render
  nothing".

## Dependencies

### Internal

- `../cache-tags` (`tags`, `PUBLIC_CACHE_PROFILE`), `@/db/client`, `@/db/schema`
- `@/content/blocks/union`, `@/content/blocks/media-usage` (`referencedAssetIds`),
  `@/content/blocks/render/context` (`RenderContext`), `@/lib/redirects`, `@/i18n/routing`

### External

- `next/cache` (`cacheLife`, `cacheTag`), `next/headers` (`draftMode`), `drizzle-orm`

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
