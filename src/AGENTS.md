# src

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-28 · **Updated:** 2026-10-28

## Purpose

All application source. Three entry surfaces share it: the Next.js web app (`app/`), the always-on
outbox worker (`worker/`, run from source with tsx, never bundled by Next), and the operational
scripts in `../scripts` that import `db/`, `lib/` and `content/`. Layering, top to bottom:
`app/` (routes, thin) → `features/` and `components/` (UI) → `data/` (reads) and `app/(admin)/admin/_actions`
(writes) → `lib/` and `db/` → `env.ts`.

## Key Files

| File | Description |
|------|-------------|
| `env.ts` | Zod environment contract. Exports `env` (a lazy `Proxy` that parses `process.env` on first property read and throws if touched from the browser) and `publicEnv` (`appUrl`, `mediaBaseUrl`, `gaMeasurementId`, `metaPixelId`). `WHATSAPP_MODE=cloud_api` requires five more variables or boot fails. `requiredInProd` skips the check while `NEXT_PHASE=phase-production-build`. |
| `instrumentation.ts` | Next `register()` hook, Node runtime only. Reads `env.DATABASE_URL` to force the whole schema to parse at boot (a bad release dies before taking traffic), then calls `initErrorReporting(env.SENTRY_DSN, env.NODE_ENV)`. Deliberately does not touch the database. |
| `proxy.ts` | Next 16 replacement for `middleware.ts`. Stamps/propagates `x-request-id`; skips `/api`, `/_next`, `/_vercel` and any path whose last segment has a dot (`isExcluded`); gates `/admin/*` on session-cookie presence only (public: `/admin/login`, `/admin/invite`, `/admin/reset-password`); delegates everything else to next-intl. Matcher is `/:path*`. |
| `worker/outbox-worker.ts` | The WhatsApp outbox worker (see below). |

### worker/outbox-worker.ts

Entry: `npm run worker` (`tsx --conditions=react-server`). The loop only starts when
`process.argv[1]` contains `outbox-worker`; otherwise the module is import-safe, and tests import
its named exports (`backoffMs`, `beat`, `claimBatch`, `processJob`, `runMaintenance`, `settle`,
`windowIsOpen`; `drainOnce` is exported inline).

- **Claim:** `claimBatch()` — one `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED LIMIT 10)`.
  Picks `pending`/`failed_retryable` rows whose `next_attempt_at` has passed, plus `claimed` rows whose
  120 s lease expired. `attempt_count` increments at claim time, so a poison message cannot loop forever.
- **Process:** `processJob` re-checks the 24 h window (`windowIsOpen`, 23 h 55 m margin) for
  window-bound text, calls `whatsapp()` provider `sendTemplate`/`sendText`, writes a
  `notification_attempts` row, then `settle()`.
- **Settle:** `sent` → outbox `sent` + `whatsapp_messages` row (one transaction); `skipped`
  (what `fallback` mode returns) / `needs_template` (131047 → `blocked_window`) / `dead` (permanent or
  attempts exhausted) all call `emailFallback` for `internal_new_lead` jobs; transient errors →
  `failed_retryable` with `backoffMs` (5 s × 3^n, cap 1 h, jitter 50–100 %) or provider `retryAfterMs`.
- **Email fallback:** Resend, to the `contact.email` site setting (read with a plain query — `'use cache'`
  does not work outside the Next compiler). Not `INITIAL_OWNER_EMAIL`.
- **Idle branch only:** hourly `runMaintenance()` (prunes `rate_limits` via `pruneRateLimits`, deletes
  processed `whatsapp_webhook_events` older than 90 days). Top of every loop: `beat()` upserts the
  `service_heartbeats` row `outbox` every 30 s — `/api/health` reads it. Idle poll 3 s.
- SIGTERM/SIGINT set `running = false`, then `pgClient.end` and `flushErrorReporting`.

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `app/` | App Router: public site, admin panel, route handlers — see `app/AGENTS.md` |
| `components/` | Shared presentational components (`layout`, `motion`, `seo`, `ui`) — see `components/AGENTS.md` |
| `content/` | Block schemas/renderers, settings registry, legal texts, locale-map helper `t()` — see `content/AGENTS.md` |
| `data/` | Read layer: `public/` (cached, published-only) and `admin/` (capability-guarded), cache tags — see `data/AGENTS.md` |
| `db/` | Drizzle client, schema, migrate runner, seed — see `db/AGENTS.md` |
| `features/` | Feature UI by domain: `admin`, `analytics`, `attribution`, `consent`, `leads`, `portfolio`, `preview` — see `features/AGENTS.md` |
| `i18n/` | next-intl `routing`, `navigation`, `request` config — see `i18n/AGENTS.md` |
| `lib/` | Auth, audit, cache invalidation, storage, media processing, WhatsApp, logging, rate limit — see `lib/AGENTS.md` |
| `worker/` | Described inline above (single file) |

## For AI Agents

### Working In This Directory

- **`env` is lazy, `publicEnv` is not.** Never destructure `process.env.NEXT_PUBLIC_*` — Next inlines
  them only as full literal expressions. A `'use client'` file importing `@/env` drags zod and every
  server variable definition into the browser bundle (this broke `performance.spec.ts`); read on the
  server and pass props down.
- **Empty string equals unset** for every optional variable (`optionalString`, `normalizePublic`) —
  Railway injects `""`. Preserve that when adding variables, and add the key to `.env.example`.
- **`proxy.ts` is not a security boundary** and its `isExcluded()` is code, not a matcher regex, on
  purpose (`'\.'` in a JS string collapses to `'.'` and silently disables the proxy). Do not
  "simplify" it back into a regex matcher.
- **Contradiction with `docs/architecture.md` §7:** the proxy matcher is `/:path*`; `/api/*` (including
  the WhatsApp webhook) is skipped via `isExcluded` but still passes through `forward()`, which only
  adds the request-id header and leaves the raw body untouched.
- **Worker constraints:** it runs outside the Next compiler, so no `'use cache'` functions
  (`getSiteSettings` etc.) and no `next/*` imports. Anything it imports must work under tsx with the
  `react-server` condition. Raw `db.execute` rows are snake_case/unparsed — use the query builder when
  you need typed rows (documented bug in the file).
- Only one worker replica is assumed for the heartbeat row (`service = 'outbox'` is the conflict
  target and `instance` is overwritten); several workers would still claim safely but would fight over it.
- `src/db/seed/content` is imported by production routes for `DOCUMENT_IDS` — a seed module is runtime
  code here; keep it side-effect free.

### Testing Requirements

- `tests/unit/env.test.ts` — env parsing (`STORAGE_DRIVER` blank, cloud_api requirements).
- `tests/unit/request-id.test.ts`, `tests/unit/client-ip.test.ts` — helpers `proxy.ts` uses.
- `tests/unit/whatsapp.test.ts` — imports `backoffMs` from the worker.
- `tests/integration/outbox.test.ts` — the worker against real Postgres: concurrent claim, lease
  recovery, retry/dead-letter, window margin, dedupe, housekeeping, heartbeat.
- `tests/e2e/public-site.spec.ts` — `x-request-id` header behaviour on pages and `/api/health`.
- Gate: `npm run lint && npm run typecheck && npm test`.

### Common Patterns

- `import 'server-only'` at the top of server modules; the worker stays importable because the script
  runs with `--conditions=react-server`.
- Comments explain *why* a failure mode was chosen — keep that style when changing behaviour here.

## Dependencies

### Internal

- Worker uses `@/db/client`, `@/db/schema`, `@/lib/whatsapp`, `@/lib/rate-limit`, `@/lib/report-error`,
  `@/lib/logger`, `@/content/settings-registry`.
- `proxy.ts` uses `@/i18n/routing`, `@/lib/request-id`.

### External

- zod 4, next-intl (middleware), drizzle-orm, `resend` (dynamic import in the worker), tsx.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
