# lib

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-28 · **Updated:** 2026-10-28

## Purpose

Cross-cutting server and shared helpers that are not tied to a single feature: authorization and
sessions (`auth/`), WhatsApp (`whatsapp/`), object storage (`storage/`), image processing (`media/`),
audit, rate limiting, preview tokens, redirect rules, logging and error reporting, URL and date
formatting. Files marked *pure* contain no I/O and are safe in Client Components.

## Key Files

| File | Description |
|------|-------------|
| `audit.ts` | `server-only`. `recordAudit(input, tx = db)` inserts an `audit_log` row; pass the surrounding transaction so the audit entry commits atomically with the change. `auditRequestContext()` returns `{ ipAddress, userAgent }` for the current request (call inside the action, never hoisted). `summarizeBlocks()` makes compact before/after diffs. Records summaries, never payloads or secrets. |
| `cache-invalidation.ts` | `server-only`. `invalidatePublicPages()`: site-wide expiry for menu and settings changes (see "Two cache-invalidation modules" below). |
| `client-ip.ts` | `server-only`. `clientIp(headers)`: `x-real-ip` first, then leftmost `x-forwarded-for`, else `null`. Used for rate-limit keys and audit rows. The value is what the request *claimed*; Railway's proxy behaviour for `x-forwarded-for` is flagged as unresolved in the file. |
| `format.ts` | *pure.* Date/currency formatters pinned to `Europe/Madrid` and `ru-RU`: `formatDayMonth`, `formatDate`, `formatShortDate`, `formatDateTime`, `formatDayMonthTime`, `formatTime`, `formatEuro`. Use these, never `toLocaleString` ad hoc. |
| `logger.ts` | `server-only`. Shared `pino` instance (JSON lines, `LOG_LEVEL`, redacts authorization/cookie, `x-hub-signature-256`, `*.accessToken`, `*.password`, `*.token`). |
| `preview.ts` | `server-only`. HMAC-SHA256 preview tokens keyed by `PREVIEW_SECRET`: `createPreviewToken({documentId, locale}, ttl = 1h)` and `verifyPreviewToken(token)` (constant-time compare; returns claims or `null`, never says why). Consumed by `src/app/api/preview/route.ts`. |
| `rate-limit.ts` | `server-only`. Postgres fixed-window limiter: `consumeRateLimit(keys, limit, windowSeconds)` (atomic upsert per key, **fails open** on error), `pruneRateLimits()` (called hourly by the worker's maintenance), `peekRateLimit()` (tests). Table `rate_limits`. |
| `redirects.ts` | *pure.* `redirectPathSchema` (internal absolute paths only; rejects `//`, `..`, odd characters), `followRedirect(map, path)` (max `MAX_HOPS = 5`, cycle gives `null`, chain is permanent only if every hop is), `wouldLoop(map, from, to)`. Shared by `data/public/redirects.ts`, `data/admin/redirects.ts` and the admin action. |
| `report-error.ts` | Not server-only. `initErrorReporting(dsn, env)` (called from `src/instrumentation.ts` and the worker), `reportError(error, message, context)` (always logs; sends to Sentry if initialised), `flushErrorReporting`, `resetErrorReportingForTests`. Uses `@sentry/node` with `defaultIntegrations: false`, `sendDefaultPii: false`; pass ids and counts as context, never names, phones or message text. |
| `request-id.ts` | `server-only`. `REQUEST_ID_HEADER = 'x-request-id'`, `resolveRequestId(inbound)`: keeps an inbound id only if it matches `^[A-Za-z0-9_.:-]{8,64}$`, else `randomUUID()`. Used by `proxy.ts` and the webhook route. |
| `routes.ts` | *pure.* `documentPath(kind, slug, portfolioIndexSlug)`, `localePath(locale, path)` (Russian unprefixed, others `/{locale}`), `absoluteUrl`, `absoluteLocaleUrl`, `whatsappLink(digits, message?)`, `telLink`. All URL building goes here so hreflang and canonical stay consistent. |
| `utils.ts` | *pure.* `cn()` = `twMerge(clsx(...))`. Most-imported file in `src` (41 call sites). |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `auth/` | better-auth config, capability matrix, guards (see `auth/AGENTS.md`) |
| `whatsapp/` | Provider interface and implementations, Cloud API transport, webhook parsing (see `whatsapp/AGENTS.md`) |
| `media/` | `process.ts` — `server-only`. `processUpload(buffer)`: size cap `MAX_UPLOAD_BYTES` (20 MB), MIME detected by sharp not the client (`ACCEPTED_MIME`: jpeg, png, webp, avif, tiff), stores the untouched original, a ~20px webp LQIP data URL, and derivatives per `RECIPE` (`version: 1`, widths 320–2560, never upscaled, formats avif + webp). Bumping `RECIPE.version` is the reprocessing trigger (`media_assets.recipe_version`, `media_derivatives.recipe_version`). |
| `storage/` | `index.ts` — `server-only`. `storage()` returns a cached `StorageDriver` (`put`, `get`, `delete`, `signedGetUrl`, `signedPutUrl`, `publicUrl`): `R2Storage` when all four `S3_*` variables are set, `LocalStorage` only when `STORAGE_DRIVER=local` (root `STORAGE_LOCAL_ROOT` or `.storage`), otherwise it throws. Keys: `buildOriginalKey(checksum, ext)` = `originals/aa/<sha256>.ext`; `buildDerivativeKey(checksum, recipeVersion, width, format)`; `sha256()`. The local driver rejects keys that resolve outside its root. |

## Two cache-invalidation modules

| | `src/data/cache-invalidation.ts` | `src/lib/cache-invalidation.ts` |
|---|---|---|
| Scope | One document | The whole public site |
| Functions | `readDocumentLocaleRefs`, `invalidateDocumentRefs`, `invalidateDocument` | `invalidatePublicPages` |
| Expires | per ref: `path`, `doc`, `projects-index`, `nav` | `nav` + `projects-index` for every locale, `settings`, then `path` + `doc` for **every published** `document_locales` row |
| Called from | `_actions/content.ts`, `_actions/removal.ts` | `_actions/settings.ts`, `_actions/navigation.ts` |
| Why | Publish/rollback/slug/removal touch one document | Menu and settings render in the layout on every page; expiring only `nav:{locale}` refreshes the read but leaves each route's prerendered output stale (an e2e test caught this) |

Both require a Server Action context (`updateTag`). Media, redirects and portfolio actions call
`updateTag(tags.…)` directly instead.

## For AI Agents

### Working In This Directory

- Files with `import 'server-only'` must never be imported from a Client Component. `format.ts`,
  `routes.ts`, `redirects.ts`, `utils.ts` and `report-error.ts` are the exceptions that may be shared.
- `consumeRateLimit` is intentionally fail-open; do not change it to throw on the lead form path.
- `recordAudit` must be given `tx` inside a transaction; calling it with the default `db` from inside
  `db.transaction` writes a row that survives a rollback.
- `_actions/redirects.ts` validates with `redirectPathSchema` and checks `wouldLoop` on create and
  re-activate; these protect against open redirect and stored XSS. Keep both on any new write path.
- `storage()` is chosen from explicit config, never from `NODE_ENV` (`next start` and the e2e suite run
  production builds). Don't add a NODE_ENV fallback.
- `report-error.ts` is imported by both `src/instrumentation.ts` and the standalone worker (plain
  `tsx`); keep it free of Next-only imports. The worker also cannot use `'use cache'` modules from
  `src/data` (the directive is a Next compiler transform).
- `client-ip.ts` is a key for the lead-form limiter; do not re-introduce ad hoc
  `x-forwarded-for.split(',')[0]`.

### Testing Requirements

- Unit: `tests/unit/client-ip.test.ts`, `format.test.ts`, `redirects.test.ts`, `report-error.test.ts`
  (spins a local HTTP server as a Sentry DSN), `request-id.test.ts`, `storage-root.test.ts`
  (dynamic `import('@/lib/storage')`), `content.test.ts` (`routes.ts`: `documentPath`, `localePath`,
  `whatsappLink`), `whatsapp.test.ts`, `guards.test.ts`.
- Integration: `tests/integration/outbox.test.ts` covers `pruneRateLimits` via `runMaintenance`;
  `publishing.test.ts` runs `recordAudit` and the cache invalidation against real Postgres.
- No unit test covers `preview.ts`, `logger.ts`, `rate-limit.ts#consumeRateLimit`, `media/process.ts`
  or `cache-invalidation.ts`; e2e `admin.spec.ts` ("draft preview"), `media.spec.ts` and `navigation.spec.ts`
  exercise them end to end.

### Common Patterns

- Small, single-purpose modules with a doc comment that records the incident or decision behind them.
- Error codes from `processUpload` are thrown as plain `Error('file_too_large' | 'unsupported_format' |
  'unreadable_image')` strings for the action to map.
- Env access goes through `@/env` (`env`, `publicEnv`); direct `process.env` reads are rare and
  commented (`LOG_LEVEL` in the logger, `NEXT_PUBLIC_APP_URL` in the auth config).

## Dependencies

### Internal

- `@/db/client`, `@/db/schema`, `@/env`, `@/i18n/routing`; `@/data/cache-tags` (from
  `cache-invalidation.ts`)

### External

- `pino`, `@sentry/node`, `sharp`, `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`,
  `clsx`, `tailwind-merge`, `zod` (`redirects.ts`), `next/headers` and `next/cache`

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
