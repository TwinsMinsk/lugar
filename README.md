# LUGAR

Premium interior-design and custom-furniture studio in Spain — public site, structured CMS,
lightweight CRM and official WhatsApp integration.

The visual source of truth is the approved Claude Design prototype (`LUGAR.dc.html`). Its grid,
typographic rhythm, oklch palette and interaction states are ported into the design tokens in
[`src/app/globals.css`](src/app/globals.css); the prototype itself is never embedded or iframed.

---

## Requirements

| Tool | Version | Note |
| --- | --- | --- |
| Node.js | **22 or 24 LTS** | Node 25 exposes a global `localStorage`, which breaks SSR browser-detection in several libraries. `engines` blocks it. |
| Docker | any recent | Local Postgres only. Production uses Railway Postgres. |
| npm | 10+ | Ships with Node. |

This repo carries a project-local Node 24 LTS under `.tools/` (gitignored) because the machine's
system Node is 25.x. Source it in every shell:

```bash
source .tools/env.sh
```

If `.tools/` is absent, install Node 24 LTS yourself (`fnm install 24`, `nvm install 24`, or the
official installer) — `.nvmrc` pins the exact version.

---

## First run

```bash
source .tools/env.sh && npm install && cp .env.example .env.local
```

Then fill in `.env.local`. For local development only three values matter:

```bash
node -e "console.log('BETTER_AUTH_SECRET=' + require('crypto').randomBytes(32).toString('base64'))"
```

Repeat for `PREVIEW_SECRET`, and set `INITIAL_OWNER_EMAIL` to your address. Everything else can stay
empty: object storage falls back to local disk and WhatsApp stays in `fallback` mode.

```bash
npm run docker:up && npm run db:migrate && npm run db:seed && npm run auth:bootstrap
```

`auth:bootstrap` prints a generated owner password **once**. There is no public sign-up, and the
script refuses to run a second time if an owner already exists.

```bash
npm run dev
```

---

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` / `npm run format` | ESLint 9 flat config / Prettier |
| `npm test` | Vitest — unit + database integration |
| `npm run test:e2e` | Playwright — builds and serves the app first |
| `npm run db:generate` | Generate a migration from schema changes |
| `npm run db:migrate` | Apply migrations (also Railway's pre-deploy step) |
| `npm run db:seed` | Idempotent seed of taxonomy and settings |
| `npm run db:studio` | Drizzle Studio |
| `npm run auth:bootstrap` | One-time creation of the first owner |
| `npm run worker` | Outbox worker (separate Railway service) |
| `npm run docker:up` / `docker:down` | Local Postgres |

Run everything before pushing:

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

---

## Architecture at a glance

- **Next.js 16.3**, App Router, RSC by default. `proxy.ts` replaces the deprecated `middleware.ts`.
- **Trilingual** (`ru` / `es` / `en`) via next-intl, `localePrefix: 'as-needed'` so Russian keeps
  clean unprefixed paths. Russian is the fallback for every untranslated field.
- **Content** is stored as one document per page, blocks as JSONB on an immutable revision. Only
  *string* fields are locale maps — structure is shared, so editing Russian cannot break the Spanish
  layout. Publish state is per-locale, pointing at a shared frozen revision.
- **Auth** is better-auth with a Drizzle adapter, DB sessions and invite-only accounts. The
  capability matrix in [`src/lib/auth/guards.ts`](src/lib/auth/guards.ts) is the single source of
  authorization truth and is enforced server-side on every private read and mutation.
- **Storage** is Cloudflare R2 (S3-compatible) with presigned uploads, falling back to local disk in
  development and refusing to start without it in production.
- **WhatsApp** runs behind one provider interface with three implementations: `fallback` (wa.me
  links only), `mock` (records without sending) and `cloud_api` (Meta Graph v26.0).

Full detail, including the decisions that deviate from the original brief and why, is in
[`docs/architecture.md`](docs/architecture.md).

---

## Project status

| Milestone | Scope | State |
| --- | --- | --- |
| **M1** | Toolchain, schema, auth, storage, seed, test harness | **complete** |
| M2 | Public site, blocks, forms, WhatsApp fallback, SEO | not started |
| M3 | Admin CMS, media library, draft/publish/rollback | not started |
| M4 | CRM depth, WhatsApp Cloud API, full test suite | not started |

Outstanding inputs required from the owner are tracked as `needs_review` rows in `site_settings` —
`npm run db:seed` reports the count. Nothing in this repository invents a business fact: absent
social URLs, addresses and legal details are stored as `null`, never as a plausible placeholder.
