# db

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-28 · **Updated:** 2026-10-28

## Purpose

Database access for the whole app: the shared Drizzle/postgres.js client, the migration runner, the
schema (in `schema/`) and the idempotent seed (in `seed/`). The database is plain PostgreSQL on Railway
(no Supabase, no RLS), so the constraints declared in `schema/` are the last line of defence for
invariants.

## Key Files

| File | Description |
|------|-------------|
| `client.ts` | `import 'server-only'`. Exports `db` (Drizzle, `casing: 'snake_case'`, full `schema`), `pgClient` (raw postgres.js), `schema`, type `Database`. Pool `max: 5`, `idle_timeout: 20`, `connect_timeout: 15`, `max_lifetime: 30 min`; prepared statements stay on (Railway Postgres is unpooled). Connection string is `DATABASE_URL_BUILD` while `NEXT_PHASE === 'phase-production-build'` (a build container cannot reach the private network), else `DATABASE_URL`. The client is cached on `globalThis.__lugarSql` outside production to avoid a pool per HMR reload. |
| `migrate.ts` | Not server-only; run by `npm run db:migrate` and Railway's `preDeployCommand`. Imports `scripts/load-env`, opens its own `max: 1` connection to `DATABASE_URL`, applies `./drizzle`, closes the connection, sets `process.exitCode = 1` on failure so a failed migration blocks the release. |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `schema/` | Drizzle table, enum and index definitions; drizzle-kit input (see `schema/AGENTS.md`) |
| `seed/` | `index.ts` (entry, `npm run db:seed`), `pages.ts` (page documents, placeholder media, navigation), `taxonomy.ts` (lead statuses, portfolio/service categories, `SITE_SETTINGS`), `content.ts` (976 lines of page/legal block content and `NAVIGATION_SEED`). No separate AGENTS.md. |

### Seed behaviour (inline)

- **Idempotent by construction.** Every insert is keyed on a natural key with `ON CONFLICT DO NOTHING`:
  lead statuses on `slug`, portfolio/service categories on `slug`, `site_settings` on `key`,
  placeholder media and navigation on deterministic `id`, documents on the partial unique index
  `documents_seed_key_uq` (the conflict target must restate `where seed_key is not null`).
- **Deterministic ids.** `seed/content.ts#id(key)` is `uuidv5(key, NAMESPACE)`, so block ids,
  `media_usage` rows and navigation links are identical on every run. Do not change `NAMESPACE`.
- **Never overwrites owner edits.** `seedOnePage` returns early when the document already exists, so
  block content is written only on first creation. A fresh page gets revision 1 (published, frozen) and
  revision 2 (draft, a clone), `draft_revision_id` set, three `document_locales` rows `published`, and
  `media_usage` rows for both revisions.
- **No fabricated facts.** `SITE_SETTINGS` marks 9 keys `needsReview: true`: `contact.email`,
  `contact.serviceArea`, `contact.address`, `social.instagram`, `social.facebook`, `legal.companyName`,
  `seo.ogImage`, `brand.logo`, `analytics.enabled`. Unknown values are `null` (email, address, socials)
  rather than plausible placeholders. `db:seed` prints the count at the end. (`contact.serviceArea` is
  seeded with a value, `Испания/España/Spain`, but still flagged for review.)
- **Placeholder media** rows are `is_placeholder = true`, `mime_type image/svg+xml`, `bytes 0`,
  `storage_key placeholder/<key>`; no image bytes are uploaded. The portfolio index ships empty (no
  fake works).
- Seed ends with `pgClient.end({ timeout: 5 })`; a failed seed sets `process.exitCode = 1`.

## For AI Agents

### Working In This Directory

- **Import `db` only from `@/db/client`** in app code. `migrate.ts` and the seed run as `tsx` scripts
  with `--conditions=react-server` (see root `package.json`: `db:migrate`, `db:seed`); keep that flag.
- `client.ts` is `server-only`, so any script importing it (the seed, the worker, `scripts/*`) needs
  `--conditions=react-server`. `migrate.ts` deliberately imports neither `@/` modules nor the app
  client, so it stays a self-contained process with its own single connection.
- `migrate.ts` and `scripts/migrate-for-build.ts` (npm `prebuild`) do the same thing against
  different URLs; the former is the deploy safety net, the latter exists because prerendering during
  `next build` queries the schema before pre-deploy runs (see `drizzle/AGENTS.md`).
- Keep the pool small. The `client.ts` comment budgets web 5 + worker 3, but the worker imports the
  same client, so it actually also gets `max: 5`. Railway Postgres `max_connections` is shared by
  every service.
- When adding seed rows for a new table, use a stable natural key and `onConflictDoNothing`; never
  `onConflictDoUpdate` in the seed.
- `src/db/seed/index.ts` header still says "M1 seeds configuration and taxonomy... M2 later", but
  `main()` already seeds placeholder media, pages and navigation. Trust `main()`.

### Testing Requirements

- `tests/integration/schema-invariants.test.ts`, `outbox.test.ts`, `publishing.test.ts` import
  `@/db/client` and run against `lugar_test`, created and migrated by `tests/helpers/db.ts`
  (`migrateTestDatabase`, `resetTestDatabase` = `TRUNCATE ... RESTART IDENTITY CASCADE`).
  `tests/setup.ts` points `DATABASE_URL` at `DATABASE_URL_TEST` or `localhost:5432/lugar_test`.
- `tests/unit/block-defaults.test.ts` imports `PAGE_SEEDS` from `seed/content` to validate seeded blocks
  against the block registry; changing seed block data can fail it.
- Integration files run serially (`fileParallelism: false` in `vitest.config.ts`); they share one DB.

### Common Patterns

- Transactions: `db.transaction(async (tx) => …)` in actions; helpers such as `recordAudit` accept
  `tx` so audit rows commit atomically.
- Raw SQL via `` sql`…` `` for partial-index predicates and window arithmetic; keep the interval on the
  constant side (`now() - interval '23 hours 55 minutes'`).

## Dependencies

### Internal

- `@/env` (validated `DATABASE_URL`, `DATABASE_URL_BUILD`), `scripts/load-env`
- `@/content/blocks/media-usage`, `@/content/legal`, `@/i18n/routing` (seed)

### External

- `drizzle-orm` (`postgres-js` driver and migrator), `postgres`, `uuid` (v5 in seed, v7 in schema)

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
