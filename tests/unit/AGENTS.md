# Unit Tests

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-28 · **Updated:** 2026-10-28

## Purpose

Vitest tests that need no database and no browser: validation schemas, pure functions, the
capability matrix, catalogue parity and a few environment-sensitive modules. They run in the CI
`verify` job via `npx vitest run tests/unit`. Environment is `node` (set in `vitest.config.ts`).

## Key Files

| File | Module under test |
|------|-------------------|
| `block-defaults.test.ts` | `src/content/blocks/defaults`, `registry`, `union` — every block type's default data satisfies its own schema (`saveDraft` is all-or-nothing); also reads `PAGE_SEEDS` from `src/db/seed/content` |
| `client-ip.test.ts` | `src/lib/client-ip` — header precedence for the client address, `null` when unknown |
| `content.test.ts` | `src/content/blocks/*` (registry, union, media-usage), `src/content/i18n`, `src/content/settings-registry`, `src/data/public/settings`, `src/lib/routes` — the largest file |
| `dwell-token.test.ts` | `src/features/leads/dwell-token` — issue/verify of the anti-spam dwell token |
| `env.test.ts` | `src/env` — env parsing (`STORAGE_DRIVER`, `publicEnv`); uses `vi.resetModules` + `vi.stubEnv` |
| `error-vocabulary.test.ts` | `src/features/admin/messages` — every action error code has a Russian phrase; **reads action sources as text** instead of importing them |
| `format.test.ts` | `src/lib/format` — Madrid-timezone date/time/euro formatters |
| `guards.test.ts` | `src/lib/auth/guards` + `src/lib/auth/server` — the capability matrix (`CAPABILITIES`, `roleCan`, `ROLES`) tested as data |
| `legal-texts.test.ts` | `src/content/legal`, `legalRichTextSchema`, `LOCALES` — privacy/cookie drafts are valid and complete in every locale |
| `media-fields.test.ts` | `src/features/admin/media-fields` — `collectMediaSlots` over `materialsQualitySchema` / `portfolioGallerySchema` |
| `messages-parity.test.ts` | `messages/ru.json`, `es.json`, `en.json` — identical flattened key sets |
| `redirects.test.ts` | `src/lib/redirects` — `followRedirect`, `wouldLoop`, `redirectPathSchema` |
| `report-error.test.ts` | `src/lib/report-error` — starts a local HTTP server standing in for a Sentry DSN and checks what arrives |
| `request-id.test.ts` | `src/lib/request-id` — `resolveRequestId` |
| `rich-text-plain.test.ts` | `src/content/blocks/render/rich-text` — `richTextToPlainText` (feeds FAQ JSON-LD) |
| `storage-root.test.ts` | `src/lib/storage` + `src/env` — where the local driver writes (`STORAGE_LOCAL_ROOT`); `vi.resetModules` + `vi.stubEnv` |
| `structured-data.test.ts` | `src/components/seo/structured-data` — `breadcrumbJsonLd`, `localBusinessJsonLd` |
| `whatsapp.test.ts` | `src/lib/whatsapp` (`verifySignature`), `cloud-api`, `provider` (`classifyError`), `webhook` (`parseEnvelope`), `src/worker/outbox-worker` (`backoffMs`); imports `spanishMobile` from `../e2e/lead-phone` |

## For AI Agents

### Working In This Directory

- **One file per module, named after it.** Add a row above when you add a file; the table is the only
  index.
- **Do not touch the database here.** Anything that needs Postgres belongs in `../integration/`.
  `setup.ts` still sets `DATABASE_URL` to the test database, but unit tests must not connect.
- **Modules that read `process.env` at import time** (`@/env`, `@/lib/storage`): use
  `vi.resetModules()` in `beforeEach`, `vi.stubEnv()` for values, `vi.unstubAllEnvs()` in `afterEach`,
  and import the module dynamically inside each test (see `env.test.ts`, `storage-root.test.ts`).
- **`error-vocabulary.test.ts` parses source files.** Renaming or moving admin action files can break it
  without any import error.
- **`messages-parity.test.ts` fails when a key exists in one catalogue only.** Fix the catalogue, not
  the test.
- `server-only` is aliased to an empty stub, so server modules import freely.
- No `.tsx` tests exist and the environment is `node`; a DOM test would need an explicit per-file
  environment (`jsdom` is installed).

### Testing Requirements

`npx vitest run tests/unit` (CI form) or `npm run test:watch`. Run the touched file alone with
`npx vitest run tests/unit/<file>.test.ts`.

### Common Patterns

- A header comment states the failure the test guards against; write the claim, not the mechanics.
- Pure helpers are tested as data tables (`guards.test.ts`, `redirects.test.ts`).
- Phone numbers in tests must be real Spanish mobiles: use `spanishMobile()` (a `6…` number), because
  the app validates with `libphonenumber-js/max`.

## Dependencies

### Internal

- `src/content`, `src/lib`, `src/features`, `src/worker`, `src/components/seo`, `messages/*.json`
- `../e2e/lead-phone.ts` (cross-directory import in `whatsapp.test.ts`)

### External

- Vitest 4 (`vi.stubEnv`, `vi.resetModules`), Node `http` for `report-error.test.ts`

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
