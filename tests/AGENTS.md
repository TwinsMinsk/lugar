# Tests

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-28 · **Updated:** 2026-10-28

## Purpose

All automated checks for LUGAR. Three layers with different runners: Vitest **unit** tests (pure
logic, no database), Vitest **integration** tests (a real Postgres, no mocks of SQL), and Playwright
**e2e** tests (a real built site over HTTP). Vitest picks up `tests/**/*.test.ts(x)` and excludes
`tests/e2e/**`; Playwright reads only `tests/e2e` (see `vitest.config.ts`, `playwright.config.ts`).

## Key Files

| File | Description |
|------|-------------|
| `setup.ts` | Vitest `setupFiles`. Loads `.env.local` then `.env`, then **overwrites** `DATABASE_URL` with `DATABASE_URL_TEST` (fallback `postgresql://lugar:lugar@localhost:5432/lugar_test`). Defaults `BETTER_AUTH_SECRET` and `PREVIEW_SECRET` to throwaway test values. |
| `helpers/db.ts` | `migrateTestDatabase()` — creates the target database if missing (via `DATABASE_ADMIN_URL`, default `.../postgres`), then applies `./drizzle` migrations once per process. `resetTestDatabase()` — `TRUNCATE ... RESTART IDENTITY CASCADE` on every `public` table. |
| `helpers/errors.ts` | `captureDbError()` unwraps the Drizzle error's `.cause` (code, constraint, detail); `PG` SQLSTATE constants; `RESTRICT_CODES` accepts both `23001` (Postgres 18) and `23503` (17 and earlier). |
| `helpers/server-only-stub.ts` | Empty module; `vitest.config.ts` aliases `server-only` to it so server modules import under Node. |
| `integration/outbox.test.ts` | WhatsApp outbox worker against real Postgres: `SKIP LOCKED` claiming (three concurrent claims, every job once), lease expiry, `settle()` retry/dead-letter/`blocked_window` rules, the 24-hour window (closes 5 min early), outbox and webhook-event dedupe, `runMaintenance()` pruning, single-row heartbeat. |
| `integration/publishing.test.ts` | Publishing state machine through the real server actions (`saveDraft`, `publishDocument`, `rollbackDocument`, `unpublishDocument`, `updateSlug`). Only `@/lib/auth/guards`, `next/headers` and `next/cache` are mocked; SQL, Zod and transactions run for real. |
| `integration/schema-invariants.test.ts` | Constraints enforced by Postgres itself: one open draft per document, `media_usage` blocks asset deletion, one default-entry lead status. |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `unit/` | Database-free Vitest tests (see `unit/AGENTS.md`) |
| `e2e/` | Playwright specs, helpers and saved auth state (see `e2e/AGENTS.md`) |

## For AI Agents

### Working In This Directory

- **Environment for integration tests.** `DATABASE_URL_TEST` (the throwaway database; its name is parsed
  from the URL path) and `DATABASE_ADMIN_URL` (a connection to the maintenance DB `postgres`, used only
  to `CREATE DATABASE`). Neither appears in `.env.example`; CI sets both
  (`.../lugar_test` and `.../postgres`). Locally `npm run docker:up` provides Postgres on `localhost:5432`.
- **Create, never drop.** `migrateTestDatabase()` creates the database if absent and never drops it
  (the CI comment "create and drop" is looser than the code). Isolation comes from `resetTestDatabase()`
  in `beforeEach`/`beforeAll`, not from a fresh database.
- **Trap: `resetTestDatabase()` truncates every public table.** `setup.ts` forces `DATABASE_URL` to the
  test URL, but nothing checks that the URL is really a throwaway database. Pointing `DATABASE_URL_TEST`
  at a dev or production database wipes it. A separate database was chosen over transaction-per-test on
  purpose: constraint violations abort a surrounding transaction (`helpers/db.ts` comment).
- **No parallel files.** `fileParallelism: false` — suites share one database. Do not enable it.
- **`npm test` needs Postgres.** It runs unit and integration together. Without a database the
  integration files fail in `beforeAll`; use `npx vitest run tests/unit` for a DB-free run.
- **Why CI splits them.** The `verify` job (lint, typecheck, format, `npx vitest run tests/unit`) has no
  database and gates fast. Integration tests run in the `build` job (`npx vitest run tests/integration`),
  which already has a `postgres:18-alpine` service container for the prerender build; Postgres 18
  mirrors production, which is how the `23001` vs `23503` difference was found. E2E is a third job.
- Integration files import app code with `@/` aliases and call `pgClient.end({ timeout: 5 })` in `afterAll`; keep
  that so the connection pool closes with the file.
- In `publishing.test.ts`, app modules are loaded with top-level `await import(...)` *after* `vi.mock`
  calls; keep that order when adding imports.

### Testing Requirements

Unit: `npx vitest run tests/unit`. Integration: `npm run docker:up` then
`npx vitest run tests/integration`. Both: `npm test`. E2E: `npm run test:e2e` (see `e2e/AGENTS.md`).
Timeouts are 20 s per test and 60 s per hook.

### Common Patterns

- New database invariant → assert the SQLSTATE and constraint name via `captureDbError`; for
  `ON DELETE RESTRICT` use `RESTRICT_CODES`, never a single code.
- Test comments explain *why a naive assertion would pass for the wrong reason*; keep that style.
- Cross-directory reuse is allowed from Vitest (`unit/whatsapp.test.ts` imports `e2e/lead-phone.ts`);
  Playwright specs may not import each other, hence the helper modules in `e2e/`.

## Dependencies

### Internal

- `src/db/client` (`db`, `pgClient`), `src/db/schema`, `drizzle/` migrations
- `src/worker/outbox-worker`, `src/app/(admin)/admin/_actions/content`, `src/lib/auth/guards`

### External

- Vitest 4, `@vitejs/plugin-react`, `dotenv`, `postgres`, `drizzle-orm`
- Postgres 17+ locally; 18 in CI

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
