<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# LUGAR

**Generated:** 2026-10-28 · **Updated:** 2026-10-28

## Purpose

Website and back office for a premium interior-design and custom-furniture studio in Spain: a
trilingual public site (`ru` / `es` / `en`), a structured block CMS with draft/publish/rollback, a
lightweight CRM for leads and contacts, and an official WhatsApp Cloud API integration driven by a
transactional outbox. Deployed on Railway as two services — the Next.js app and an always-on outbox
worker — against Railway Postgres and Cloudflare R2.

Read [`docs/architecture.md`](docs/architecture.md) before any structural change: it records the
deviations from the original brief (no Supabase, no RLS, no Vercel) and the invariants that follow.

## Key Files

| File | Description |
|------|-------------|
| `package.json` | Scripts and exact-pinned dependencies. Pins are deliberate — see architecture §6 before bumping. |
| `next.config.ts` | `output: 'standalone'`, `cacheComponents: true`, next-intl plugin, image patterns, security headers and a static (no-nonce) CSP — read its comments before touching CSP. `NEXT_DIST_DIR` overrides `.next` (exFAT junction workaround). |
| `drizzle.config.ts` | drizzle-kit config: schema in `src/db/schema`, migrations in `drizzle/`. |
| `vitest.config.ts` | Vitest, `node` environment, setup `tests/setup.ts`, runs `tests/**/*.test.ts(x)`. |
| `playwright.config.ts` | Playwright projects `setup`, `desktop`, `mobile`, `admin`; `reuseExistingServer: false`. |
| `eslint.config.mjs` | ESLint 9 flat config (`eslint-config-next` native flat, no `FlatCompat`). |
| `.prettierrc.json` | Prettier + `prettier-plugin-tailwindcss`. `npm run format:check` runs in CI. |
| `tsconfig.json` | Strict TypeScript 6.0 (not 7 — typescript-eslint caps at `<6.1`). |
| `docker-compose.yml` | Local Postgres only. |
| `railway.json` | Web service: Railpack build, `db:migrate` as pre-deploy, `/api/health` healthcheck, **1 replica**. |
| `railway.worker.json` | Worker service: runs `npm run worker` from source with tsx, no build. |
| `.env.example` | Every environment variable with comments; validated at runtime by `src/env.ts`. |
| `.nvmrc` | Pins Node 24 LTS. |
| `README.md` | Setup, commands, milestones, owner inputs. |
| `CLAUDE.md` | `@AGENTS.md` — managed by `next dev`, do not edit. |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `src/` | Application source (see `src/AGENTS.md`) |
| `tests/` | Vitest unit/integration and Playwright e2e suites (see `tests/AGENTS.md`) |
| `drizzle/` | Generated SQL migrations and drizzle-kit snapshots (see `drizzle/AGENTS.md`) |
| `scripts/` | tsx/Node operational scripts behind npm scripts (see `scripts/AGENTS.md`) |
| `docs/` | Architecture and owner-facing operational guides (see `docs/AGENTS.md`) |
| `messages/` | next-intl UI string catalogues `ru.json`, `es.json`, `en.json` (see `messages/AGENTS.md`) |
| `.github/workflows/` | `checks.yml` — lint, typecheck, format, unit; integration + build on Postgres 18; e2e. Does not deploy. |

Ignored, local-only: `.tools/` (project-local Node 24, `source .tools/env.sh`), `.storage/` (local
media when `STORAGE_DRIVER=local`), `.next/`, `test-results/`, `.env.local`.

## For AI Agents

### Working In This Directory

- **Node 22 or 24 only.** Node 25 defines a global `localStorage` and breaks SSR browser detection;
  `engines` blocks it. In a shell without Node 24 on PATH, run `source .tools/env.sh` first.
- **Next.js 16.3.** `src/proxy.ts` replaces `middleware.ts`; caching uses `'use cache'` with tags and
  `updateTag`. Check `node_modules/next/dist/docs/` before using any Next API from memory.
- **Authorization is application-layer.** There is no RLS. Every private read and mutation goes
  through `requireCapability()` from `src/lib/auth/guards.ts`; never rely on hidden UI or on
  `proxy.ts` (it only checks cookie presence).
- **Invariants live in the database** (partial unique indexes, `restrict` FKs). Schema changes go
  through `src/db/schema` → `npm run db:generate` → a new file in `drizzle/`. Never edit an applied
  migration.
- **Never invent business facts.** Unknown addresses, social URLs, legal details and analytics IDs are
  `null` with `needs_review = true` in `site_settings`, never a plausible placeholder.
- **Scripts that import server code** run with `tsx --conditions=react-server` (so `server-only`
  resolves to its empty export). Keep that flag on any new script.
- **Single replica.** The default cache handler is per-instance; scaling the web service out without a
  shared cache handler serves stale pages after publish (architecture §5).
- The `<!-- BEGIN/END:nextjs-agent-rules -->` block at the top of this file is rewritten by
  `next dev`; keep project notes outside it.
- Owner-facing docs (`docs/*` except `architecture.md`) are in Russian on purpose; code, comments and
  commit messages are in English. Commit messages read as a plain statement of the problem solved
  (see `git log`).

### Testing Requirements

Before pushing: `npm run lint && npm run typecheck && npm test && npm run build`, plus
`npm run format:check`. Integration tests need a Postgres (`npm run docker:up`) and
`DATABASE_URL_TEST` / `DATABASE_ADMIN_URL`. E2E: `npm run test:e2e` (builds and serves on
`127.0.0.1:3100`; admin specs need `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD`). Before deploying:
`npm run preflight -- --production`.

### Common Patterns

- Server Components by default; `'use client'` only at interactive leaves.
- Server-only modules start with `import 'server-only'`.
- Zod 4 for every boundary (env, forms, server-action input, webhook payloads).
- UUIDv7 ids for URL-reachable rows, `bigserial` for internal append-only logs; all timestamps
  `timestamptz` in UTC, rendered in `Europe/Madrid`.
- Localised content is "localised leaves": only string fields are `{ru, es, en}` maps; Russian is the
  fallback (`LOCALE_FALLBACK` in `src/i18n/routing.ts`).

## Dependencies

### External

- Next.js 16.3 / React 19.2 — App Router, RSC, `'use cache'`
- next-intl 4 — routing with `localePrefix: 'as-needed'`
- drizzle-orm 0.45 + postgres.js — database; drizzle-kit for migrations
- better-auth 1.6 — DB sessions, invite-only accounts, admin plugin
- @aws-sdk/client-s3 — Cloudflare R2 with presigned uploads
- Tailwind CSS 4, motion, GSAP — styling and animation
- react-hook-form + zod — forms and validation
- Resend — email; pino — logging; @sentry/node — error reporting
- Vitest, Testing Library, Testcontainers, Playwright + axe — tests

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
