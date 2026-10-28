# Scripts

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-28 · **Updated:** 2026-10-28

## Purpose

Operational scripts behind `npm run` commands: first-owner bootstrap, pre-deploy checks, build-time
migration, standalone packaging, legal-text refresh and e2e data cleanup. Anything that opens the
database or imports app code runs under `tsx --conditions=react-server`.

## Key Files

| File | npm script | Description |
|------|------------|-------------|
| `bootstrap-owner.ts` | `auth:bootstrap` | Creates the first `owner` (credential account, email verified). Needs `INITIAL_OWNER_EMAIL`; `INITIAL_OWNER_PASSWORD` is optional (min 12 chars, else exit 1); without it a 24-char password is generated and printed once. **Refuses to run if any `owner` row exists** — it can never mint a second administrator. |
| `preflight.ts` | `preflight` | "Would this configuration run?" Checks env (via `@/env`), `NEXT_PUBLIC_APP_URL`, secret length, WhatsApp/mail config, DB connection, applied migrations vs `drizzle/meta/_journal.json`, seed/owner/settings/placeholder counts, and a storage round trip. Exit 1 on any failure. Output is Russian by design. |
| `migrate-for-build.ts` | `prebuild` (automatic) | Applies `./drizzle` migrations to `DATABASE_URL_BUILD` before `next build` prerenders. **No-op unless `DATABASE_URL_BUILD` is set.** A migration error fails the build. |
| `prepare-standalone.mjs` | `build:standalone`; also `postbuild` | Copies `.next/static` and `public/` into `.next/standalone`. Plain Node (no tsx). Honors `NEXT_DIST_DIR`. Exits 1 if the standalone output or `.next/static` is missing. |
| `apply-legal-texts.ts` | `legal:apply` | Writes the current `LEGAL_TEXTS` (privacy, cookies) into the **draft** revision of those two documents. Dry run by default; `--write` applies. Never publishes. |
| `clean-test-projects.ts` | `db:clean-test-projects` | Hard-deletes data the e2e suite creates (exact list below). |
| `load-env.ts` | — | Side-effect import: loads `.env.local`, then `.env` (dotenv does not override variables already set, so real env > `.env.local` > `.env`). |

Related scripts that live elsewhere: `db:migrate` → `src/db/migrate.ts`, `db:seed` →
`src/db/seed/index.ts`, `worker` → `src/worker/outbox-worker.ts`.

## For AI Agents

### Working In This Directory

- **Always `--conditions=react-server`.** `server-only` throws under plain Node; this condition resolves
  it to an empty module. Every npm script here has it except `prepare-standalone.mjs`, which imports no
  app code. Keep the flag on any new script (architecture §6).
- **First line of a script that reads env: `import './load-env';`** (see all `.ts` scripts here).
- **Trap: `npm run db:reset` is broken.** `package.json` points at `scripts/reset-db.ts`, which does not
  exist, and nothing else in the repo references it. Do not recreate it casually: a reset script must
  refuse non-local databases the way `clean-test-projects.ts` does. Tell the user instead.
- **`clean-test-projects.ts` is destructive (hard deletes, no transaction, no dry run).** It first
  refuses unless `DATABASE_URL` *contains* `localhost` or `127.0.0.1` (a substring test, not a host
  parse). Then, in order:
  1. `documents` whose locale slug is `LIKE` `test-proekt-%`, `dubl-%`, `opublikovannyy-%` — clears
     `document_locales.published_revision_id` first; locales, revisions and `media_usage` cascade.
  2. `invitation` and `user` rows with email `LIKE '%@example.test'`.
  3. `contacts` with `full_name LIKE 'E2E %'`, plus their `leads` and `form_submissions`.
  4. `lead_statuses` with slug `LIKE 'e2e-%'`.
  Do not widen the patterns (matching on phone prefixes was rejected: a real number could collide).
- **`bootstrap-owner.ts` prints a password to stdout.** Do not paste its output into notes or commits.
  CI instead supplies `INITIAL_OWNER_PASSWORD` so nothing scrapes stdout.
- **`preflight.ts` is read-only for the database but not for storage.** It writes and deletes
  `preflight/<timestamp>.txt` in the real bucket (or `.preflight-*` in `STORAGE_LOCAL_ROOT`) and fetches
  it from `NEXT_PUBLIC_MEDIA_BASE_URL`. `--production` (or `NODE_ENV=production`) turns short secrets,
  missing `STORAGE_LOCAL_ROOT` and a non-https app URL from warnings into failures. Run it with
  production variables before first deploy: `npm run preflight -- --production`.
- **`prepare-standalone.mjs` runs as `postbuild`.** Without it the standalone server answers but every
  stylesheet, script and font is 404. Calling `next build` directly skips `prebuild`/`postbuild`; use
  `npm run build`. Do not convert it to TypeScript — it runs on every deploy.
- **`migrate-for-build.ts` and local builds.** Because `load-env` reads `.env.local`, a
  `DATABASE_URL_BUILD` set there would make every local `npm run build` (including the e2e one) migrate
  that database. Set it only where the build prerenders against a deployed database.
- **`apply-legal-texts.ts` targets whatever `DATABASE_URL` points to**, production included. Run the dry
  run first; `--write` replaces `heading` and `content` of the `legal_rich_text` block in the two drafts
  after validating with `anyBlockSchema`. The seed cannot do this (it is `ON CONFLICT DO NOTHING`).

### Testing Requirements

No automated tests cover these scripts. After editing: `npm run typecheck`; for `migrate-for-build.ts`,
`npm run build` with and without `DATABASE_URL_BUILD`; for `preflight.ts`, run it against a local
database. Never run destructive scripts against anything but a local development database.

### Common Patterns

- Top-level `await`, explicit `pgClient.end({ timeout: 5 })` in `finally`, `process.exitCode` on failure.
- Relative imports (`../src/...`) in data scripts; `preflight.ts` uses the `@/` alias with dynamic
  imports so env is validated lazily.
- Header comments explain *why the script exists* (the incident behind it); keep that.

## Dependencies

### Internal

- `src/db/client`, `src/db/schema`, `src/db/seed/content`, `src/env`, `src/lib/auth/server`,
  `src/lib/storage`, `src/content/legal`, `src/content/blocks/union`
- `drizzle/` migrations and `drizzle/meta/_journal.json`

### External

- `dotenv`, `drizzle-orm`, `postgres`, `tsx`, Node `fs`/`crypto`

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
