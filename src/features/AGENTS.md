# features

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-28 · **Updated:** 2026-10-28

## Purpose

Feature-scoped UI and logic, grouped by capability rather than by route: the public lead-capture
flow, cookie consent, consent-gated analytics and attribution, the filterable portfolio index, the
draft-preview banner, and the whole admin back-office UI (`admin/`). Routes in `src/app` stay thin and
import from here.

## Key Files

### analytics/

| File | Description |
|------|-------------|
| `analytics.ts` | Client. `track(event)` is the only way to emit an event. Closed `AnalyticsEvent` union (`cta_whatsapp_click`, `form_open`, `lead_form_submit_success`, `portfolio_project_view`, `portfolio_filter_change`, `phone_click`). Drops (never queues) events without analytics consent; `sanitize` strips name/phone/email/comment/city/message keys and phone-like strings. Sends to `gtag` or `dataLayer`. |
| `analytics-beacon.tsx` | Client. One delegated `click` listener for `https://wa.me/` and `tel:` links; `placement` is structural (header / footer / section id), never link text. |
| `analytics-loader.tsx` | Client. Injects GA4 only if the visitor consented to analytics and Meta Pixel only on marketing consent, and only if `analytics.enabled` in Settings. Ids arrive as props (see below). |

### attribution/

| File | Description |
|------|-------------|
| `attribution.ts` | Pure helpers: `FIRST_TOUCH_COOKIE = 'lg_attr'`, `LAST_TOUCH_KEY` (sessionStorage), `readUtmFromLocation`, `hasAttributionSignal`, `mergeTouches`, `encodeTouch` / `decodeTouch`, `cookieAttrs()` (adds `secure` only on https). Also imported server-side by `leads/actions.ts`. |
| `attribution-beacon.tsx` | Client. Writes first-touch cookie and last-touch sessionStorage **only after marketing consent**. |

### consent/

| File | Description |
|------|-------------|
| `consent.ts` | Cookie `lg_consent`, `CONSENT_VERSION` (`'2026-08-13'`), 180-day max age, `parseConsent` (stale version → `null` → ask again), read/write helpers, `CONSENT_CHANGED_EVENT` / `CONSENT_OPEN_EVENT`, and a `useSyncExternalStore` trio (`getConsentSnapshot`, `getConsentServerSnapshot` always `null`, `subscribeToConsent`). |
| `consent-gate.tsx` | Async Server Component: reads the cookie via `cookies()` and passes `initiallyOpen` to the banner. Mounted inside `<Suspense>` in the site layout (consent is per-visitor, so a dynamic hole in a prerendered page). |
| `consent-banner.tsx` | Client. Equal-prominence "Necessary only" button; reopened by `data-consent-open` clicks (footer) or `CONSENT_OPEN_EVENT`; dispatches `CONSENT_CHANGED_EVENT`. Strings from `messages` namespace `consent`. |

### leads/

| File | Description |
|------|-------------|
| `actions.ts` | `'use server'`. `startLeadForm()` mints a dwell token; `submitLead(formData)`: honeypot, dwell check, Zod parse, libphonenumber normalisation to E.164, rate limit (5/hour per IP and per phone), then **one transaction**: idempotency row in `form_submissions`, contact upsert on phone, `consent_records`, lead in the default-entry status, activity, `project_files` attach, `whatsapp_outbox` rows for staff alerts. Bot rejections return a fake success (`LG-000000`). Never create a lead outside this transaction. |
| `schema.ts` | `leadFormSchema`, `attributionSchema`, `FORM_KEYS` (`calculate`/`price`/`measure`), `BUDGET_BANDS`, `LeadFormState`. Zod messages are **codes** (e.g. `phoneRequired`) that map to `form.errors.*` in `messages/`. |
| `dwell-token.ts` | `server-only`. HMAC-signed server timestamp (`PREVIEW_SECRET`) so the anti-bot dwell check never trusts the visitor's clock. |
| `lead-dialog-context.tsx` | Client. `LeadDialogProvider`, `useLeadDialog()` (throws outside the provider), `LeadDialogRequest { form, service?, blockContext? }`. |
| `lead-trigger.tsx` | Client. Real `<button>` that fires `track('form_open')` and opens the dialog. Used by `CtaLink` and the header. |
| `lead-dialog.tsx` | Client. `LeadDialog({ services, privacyHref })` and the form panel: idempotency key + dwell token on mount, focus trap, attribution assembled from cookie/sessionStorage plus the current URL, error codes translated via `form.errors`. |

### portfolio/

| File | Description |
|------|-------------|
| `portfolio-index.tsx` | Server. Renders every project card server-side (crawlable) wrapped in the filter; drops categories with zero published projects. Reuses `ProjectCard` from `content/blocks/render`. |
| `portfolio-filter.tsx` | Client. Category buttons (`aria-pressed`), `aria-live` count, hides non-matching `[data-categories]` cards with an injected `<style>`; fires `portfolio_filter_change`. |

### preview/

| File | Description |
|------|-------------|
| `preview-banner.tsx` | Server. Shows when `draftMode()` is enabled; links to `/api/preview/exit` with a plain `<a>` (soft navigation would never clear the cookie). Russian text. |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `admin/` | Back-office screens and helpers (see `admin/AGENTS.md`) |

## For AI Agents

### Working In This Directory

- **Consent is the gate for everything here.** No analytics script, `track()` call, or attribution
  write may happen without the matching category. Analytics = GA4 + `track`; marketing = Meta Pixel +
  `lg_attr` + `lg_attr_last`. Adding a cookie/storage key means updating the cookie policy in
  `src/content/legal.ts` and bumping `CONSENT_VERSION` when consent wording changes.
- **Client components must not import `@/env`** (it ships the server Zod schema to the browser and
  breaks the JS budget in `performance.spec.ts`). `AnalyticsLoader` receives `gaId` / `pixelId` as
  props from the layout for that reason. `dwell-token.ts` is server-only: only `actions.ts` imports it
  at runtime (the dialog imports its *type*).
- **Trap:** `leads/actions.ts` hard-codes `consentVersion = '2026-08-13'` for `consent_records`;
  it is not imported from `consent/consent.ts`. Change both together.
- Adding an analytics event = a deliberate edit to the `AnalyticsEvent` union; never put form
  contents in a payload. Currently nothing calls `track({ name: 'portfolio_project_view' })`, and
  `mergeTouches` in `attribution.ts` has no caller (dead code, not a missing wiring you must keep).
- Lead form errors are codes, not text: a new Zod message in `schema.ts` or a new `formError` in
  `actions.ts` needs a matching key under `form.errors` in **all three** `messages/*.json`.
- `submitLead` must keep returning success for honeypot / dwell failures (do not leak which check
  tripped). Replays with the same `idempotencyKey` return the original lead.
- Phone region comes from `LOCALE_PHONE_REGION` in `@/i18n/routing`.
- `features/admin` is Russian-only and does not use `messages/`.

### Testing Requirements

- Unit: `tests/unit/dwell-token.test.ts`. (`attribution.ts` / `consent.ts` pure helpers have no unit
  tests; they are exercised end to end.)
- E2E: `tests/e2e/public-site.spec.ts` (consent: analytics stays off, no attribution cookie before
  consent, returning visitor not re-asked, no GA/pixel request before consent; lead capture: focus
  trap, invalid phone, valid submission with WhatsApp hand-off; portfolio index never blank),
  `tests/e2e/leads.spec.ts` (enquiry arrives in the inbox with its source),
  `tests/e2e/accessibility.spec.ts` (lead dialog, cookie banner keyboard parity),
  `tests/e2e/portfolio.spec.ts`, `tests/e2e/admin.spec.ts` (draft preview).
- `tests/e2e/contacts.spec.ts` (two enquiries from one number become one contact with two leads).
  No integration test calls `submitLead` directly; the DB invariants it relies on are in
  `tests/integration/schema-invariants.test.ts`.

### Common Patterns

- `useSyncExternalStore(subscribeToConsent, getConsentSnapshot, getConsentServerSnapshot)` to read
  consent reactively without an effect.
- Server Component computes, passes plain props to a client leaf (`ConsentGate` → `ConsentBanner`,
  `PortfolioIndex` → `PortfolioFilter`).
- Delegated DOM listeners (`data-consent-open`, wa.me/tel clicks) instead of client wrappers around
  server-rendered links.

## Dependencies

### Internal

- `@/db/*` (`schema`, `client`), `@/lib/{client-ip,logger,report-error,rate-limit,whatsapp}`,
  `@/data/public/{settings,portfolio}`, `@/env` (server files only)
- `@/components/ui/button`, `@/content/blocks/render` (`ProjectCard`), `@/content/i18n`
- `@/i18n/{navigation,routing}`; messages namespaces `form`, `common`, `consent`, `portfolio`
- Mounted from `src/app/(site)/[locale]/layout.tsx`; admin screens from `src/app/(admin)/admin/**`

### External

- `next-intl`, `next/headers`, `next/script`, `libphonenumber-js`, `drizzle-orm`, `zod`

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
