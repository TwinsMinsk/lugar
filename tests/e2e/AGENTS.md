# End-to-End Tests

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-28 · **Updated:** 2026-10-28

## Purpose

Playwright specs that drive the **built standalone site** in a real browser and over raw HTTP. They
cover what unit tests structurally cannot: locale routing through the proxy, cache invalidation after
publishing, real uploads, role boundaries enforced by the server, the Meta webhook, accessibility and
the performance budget. Config: `playwright.config.ts` (`testDir: ./tests/e2e`).

## Key Files

Specs are grouped by Playwright project. Which project runs a spec is decided by the `ADMIN_SPECS`
regex list in `playwright.config.ts`, not by anything inside the spec.

**`setup` project**

| File | Description |
|------|-------------|
| `auth.setup.ts` | Signs in once as the owner and writes the session to `.auth/admin.json`. Skips itself without `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD`. Login-per-test is not viable: better-auth allows 3 sign-in attempts per window, then 429. |

**`desktop` and `mobile` projects** (public, unauthenticated; every spec not in `ADMIN_SPECS`)

| File | Description |
|------|-------------|
| `public-site.spec.ts` | Locale routing, SEO surfaces, admin gating, consent, lead capture, public portfolio, accessibility basics, mobile menu (skips at desktop widths), request id, `/api/health`. The GA consent test skips without `NEXT_PUBLIC_GA_MEASUREMENT_ID`. |
| `accessibility.spec.ts` | axe over seven public pages, the open lead dialog, cookie banner keyboard parity, no positive `tabindex`. |
| `performance.spec.ts` | Byte budgets (script 260 KB, total 520 KB, fonts 160 KB), CLS exactly 0, no third-party origin on the critical path. |
| `whatsapp-webhook.spec.ts` | Meta webhook over HTTP: handshake, HMAC verification on raw bytes, status codes. Whole suite skips without the two WhatsApp secrets. |

**`admin` project** (storage state `.auth/admin.json`, depends on `setup`)

| File | Description |
|------|-------------|
| `admin.spec.ts` | M3 acceptance: edit heading, publish, see it live, roll back; draft preview links. |
| `accessibility-admin.spec.ts` | axe over the admin list screens (detail routes are not covered). |
| `block-media.spec.ts` | Upload a generated JPEG, attach it to an empty block slot, publish, check the public page. |
| `contacts.spec.ts` | Two enquiries from one phone land on one contact card. |
| `leads.spec.ts` | CRM: public form to inbox with source, search, status/assignment/notes, keyboard board, dashboard count, WhatsApp window, CSV export neutralises formulas, export refused without `crm.export`. |
| `media.spec.ts` | Media library through the real sharp pipeline (dedupe, derivatives, in-use delete refusal). |
| `navigation.spec.ts` | Menu editor: added item reaches the live footer, keyboard reorder, removal. |
| `pipeline.spec.ts` | Funnel stage editor; dangerous edits are refused. |
| `portfolio.spec.ts` | Owner creates and publishes a project; index stays honest until then. |
| `redirects.spec.ts` | An added rule actually sends a visitor to the new address. |
| `removal.spec.ts` | Two-level removal (unpublish, then delete from the archive). |
| `settings.spec.ts` | Unfilled setting is absent, not blank; E.164 validation. |
| `users.spec.ts` | Invitations and roles; an invited editor is refused CRM and user admin by the server. |

**Helpers** (not specs: Playwright forbids one test file importing another)

| File | Description |
|------|-------------|
| `storage-state.ts` | `ADMIN_STORAGE_STATE = 'tests/e2e/.auth/admin.json'`. |
| `axe.ts` | `audit()`, `axeDescribe()`, `WCAG_TAGS` (2.0/2.1 A and AA). Re-measures every `color-contrast` hit through the browser's canvas because axe mis-converts Tailwind v4 `lab()` colours. |
| `live.ts` | `live()`, `h1Text()`, `LIVE` (20 s) — reload-and-poll reads of cached public pages. |
| `lead-phone.ts` | `spanishMobile()` (`+34 6…`), `digitsOf()`. Never generate a `+34 7…` number. |
| `whatsapp-helpers.ts` | `sign()`, `postWebhook()`, `statusEnvelope()`, `inboundEnvelope()`; reads `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`. |
| `.auth/` | Generated storage state (see below). |

## For AI Agents

### Working In This Directory

- **`.auth/` is generated, never committed.** Its `.gitignore` is `*` plus `!.gitignore`. `admin.json`
  holds a live owner session cookie; do not copy it into docs, logs or commits, and do not add
  credentials to any file here.
- **Server.** `webServer` runs `npm run build && node .next/standalone/server.js` on `PORT` 3100
  (override `E2E_PORT`), base URL `http://127.0.0.1:3100`, timeout 300 s, `reuseExistingServer: false`
  on purpose — a run must test the build it just made. It is the standalone server, not `next start`,
  because production serves that. Do not set `HOSTNAME` to `127.0.0.1`: the config comment explains
  that `/` then 307-loops, while the suite would still pass elsewhere. It stays `0.0.0.0`.
- **The build prerenders against `DATABASE_URL`**, and specs write real rows (names prefixed `E2E`,
  slugs like `test-proekt-…`, `e2e-…`, emails `@example.test`). Run only against a development
  database; clean with `npm run db:clean-test-projects` (see `scripts/AGENTS.md`).
- **New admin spec → add its regex to `ADMIN_SPECS`.** Otherwise it runs unauthenticated in `desktop`
  and `mobile`. The regexes are unanchored substrings (`/admin\.spec\.ts/` also matches
  `accessibility-admin.spec.ts`).
- **Env vars that make suites skip or fail.**
  - `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD`: without them `auth.setup.ts` skips and the specs with an
    explicit skip (`admin`, `block-media`, `media`, `portfolio`, `removal`, `settings`, `users`) skip.
    Specs without one (`contacts`, `leads`, `navigation`, `pipeline`, `redirects`,
    `accessibility-admin`) then **fail** on the missing `.auth/admin.json`.
  - `WHATSAPP_APP_SECRET` + `WHATSAPP_WEBHOOK_VERIFY_TOKEN`: otherwise all of `whatsapp-webhook.spec.ts`
    skips and one `leads.spec.ts` test skips. Any string works; the test signs with the same secret the
    server verifies against, so set the same values for the server process.
  - Sign-in over plain http needs `NEXT_PUBLIC_APP_URL=http://127.0.0.1:3100` and
    `BETTER_AUTH_TRUSTED_ORIGINS`; uploads need `STORAGE_DRIVER=local` + `STORAGE_LOCAL_ROOT`. CI sets
    these and runs `npm run auth:bootstrap` with `INITIAL_OWNER_EMAIL/PASSWORD` equal to the E2E pair.
- **Serial admin specs.** Most use `test.describe.configure({ mode: 'serial' })` because they share one
  table; keep that when extending them.
- **Public pages are cached.** Assert changes with `expect.poll(live(page, path, read), LIVE)`, never a
  plain locator on an already-loaded page.
- Fixtures are generated at run time (JPEGs via sharp, timestamp-based names); content-checksum dedupe
  means fixed bytes stop creating assets after the first run.

### Testing Requirements

`npm run test:e2e` runs all four projects, including `mobile`. CI runs only
`npx playwright test --project=desktop --project=admin` (Postgres 18, seeded, owner bootstrapped).
Single spec: `npx playwright test tests/e2e/<spec> --project=admin`. Failures upload
`playwright-report/` in CI; traces are kept on first retry.

### Common Patterns

- Comments state the claim being proved and the false pass it avoids; Russian UI labels are used as
  selectors (`getByRole('button', { name: 'Опубликовать RU' })`).
- Publishing goes through the confirmation dialog (`publishRu` helper pattern in `admin.spec.ts`,
  `portfolio.spec.ts`).
- Lead form specs wait ~3 s for the dwell guard before submitting.
- Extra signed-out/in contexts: `browser.newContext({ storageState: undefined })` or
  `{ storageState: ADMIN_STORAGE_STATE }`.

## Dependencies

### Internal

- `playwright.config.ts`, `src/` (built), `scripts/bootstrap-owner.ts`, `scripts/clean-test-projects.ts`
- Routes `/api/whatsapp/webhook`, `/api/health`, `/admin/*`

### External

- `@playwright/test` 1.62, `@axe-core/playwright`, `sharp` (fixtures), `dotenv`

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
