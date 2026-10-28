# api

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-28 · **Updated:** 2026-10-28

## Purpose

Route handlers that are not pages: the better-auth endpoint, the health check, draft-mode preview, the
language switch, local media delivery, the WhatsApp webhook, and the CSV lead export. All run on the
Node runtime (Cache Components forbids `export const runtime`, so none can be Edge). `next.config.ts`
adds `X-Robots-Tag: noindex, nofollow` to every `/api/*` response, and `robots.ts` disallows `/api/`.

## Key Files

| File | Method(s) | Auth | Purpose |
|------|-----------|------|---------|
| `admin/leads/export/route.ts` | `GET` (`?status=`, `?assignee=` id or `none`) | `getSession()` + `roleCan(role, 'crm.export')`; any failure (no session, banned, wrong role) is a plain **404** | CSV of non-deleted, non-archived leads joined to contact/status/assignee, max 5 000 rows, UTF-8 BOM, CRLF, formula-neutralising `csvCell` (`'` prefix for `= + - @ \t \r`). Always writes audit `crm.exported` (row count, filters, truncated flag, IP, UA). `Cache-Control: no-store`. |
| `auth/[...all]/route.ts` | `GET`, `POST` | better-auth's own checks | `toNextJsHandler(auth.handler)` from `@/lib/auth/server`: sign-in, sign-out, password reset, change password, admin plugin endpoints. |
| `health/route.ts` | `GET` | none | Railway health check. 503 if the DB is unreachable or applied migrations (`drizzle.__drizzle_migrations` count) are fewer than `journal.entries.length` compiled from `drizzle/meta/_journal.json`. Reports `storage` driver and the worker heartbeat (`never` / `ok` / `stale`, stale after 120 s) in the body but **never fails on the worker** or storage. |
| `locale/[locale]/route.ts` | `GET` (`?from=/path`) | none | Language switcher: resolves the *equivalent document* in the target locale (so differing slugs work); falls back to the target home page for anything unresolvable. `from` must start with `/` and not `//`. Emits a relative-`Location` 307. |
| `media/[...key]/route.ts` | `GET` | none (public) | Serves media from the local storage driver only (404 unless `STORAGE_DRIVER === 'local'`). Key must exist in `media_assets` or `media_derivatives`; content type comes from that row; `immutable` one-year cache, `nosniff`; in-memory resolved-key map capped at 2 000. Used in production while the deploy runs on a mounted volume. |
| `preview/route.ts` | `GET` (`?token=` or `?documentId=&locale=`) | Valid signed token (`verifyPreviewToken`, time-limited, shareable) **or** any authenticated session | Enables `draftMode()` and 307s to the document's public path (derived from the document, never from the query). Unknown/archived/unauthorised → 404. |
| `preview/exit/route.ts` | `GET` (`?from=`) | none | Disables draft mode, 307 to a same-origin relative `from` or `/`. |
| `whatsapp/webhook/route.ts` | `GET`, `POST` | `GET`: `hub.verify_token` constant-time compared to `WHATSAPP_WEBHOOK_VERIFY_TOKEN`; `POST`: `X-Hub-Signature-256` HMAC over the raw body via `whatsapp().verifyWebhookSignature` | Meta subscription handshake (returns the challenge as bare `text/plain`) and event intake. See below. |

### The webhook's status codes (do not change)

Meta retries any non-200 for up to seven days, so:

| Situation | Status | Why |
|-----------|--------|-----|
| Bad/missing signature, wrong verify token | **403** | Forgery gets no retries; a real delivery failing means our app secret is wrong. |
| Body is not JSON, or `parseEnvelope` yields no events | **200** | A retry can never succeed. |
| DB insert of `whatsapp_webhook_events` fails | **500** | A retry will succeed and the event would otherwise be lost. Reported via `reportError`. |
| Stored (or duplicate) | **200** | Duplicates are expected (`onConflictDoNothing` on `eventKey`). |

The raw text is read first (`request.text()`) and the envelope is committed **synchronously** before
the response; only `applyEvent` (lead/contact matching, status updates) runs in `after()`, and its
failures are `reportError`ed because Meta will not redeliver.

**Proxy exclusion — confirmed, but not via the matcher.** `src/proxy.ts` has matcher `/:path*` and skips
every `/api` path in `isExcluded()`: it forwards the request untouched apart from the `x-request-id`
header (headers only, body not read). The webhook logs with that request id.

## For AI Agents

### Working In This Directory

- **A route handler has no layout guard.** Every private handler must authorise itself in full
  (`getSession()` + banned check + `roleCan`) and answer 404, not 403, like `requireCapability`. Do not
  call `requireCapability` here: it throws `notFound()`/redirects, which suits pages, not handlers —
  the export route deliberately uses `getSession` + `roleCan`.
- **Never read the webhook body through anything but `request.text()` first**, and never add JSON parsing,
  middleware or body logging ahead of the signature check; the HMAC is over exact bytes.
- **Redirects use a relative `Location`** (`new NextResponse(null, { status: 307, headers: { Location } })`),
  not `new URL(path, request.url)`: the latter can change host (`localhost` vs `127.0.0.1`, apex vs `www`)
  and drop the draft-mode cookie. Copy `relativeRedirect` from `preview` or `locale`.
- **Open-redirect rule:** user-supplied `from` values are accepted only if they start with `/` and not `//`.
- **No `export const dynamic/runtime/revalidate`** in any route here — the build rejects it under Cache Components.
- `preview` accepts *any* signed-in user (no capability), unlike the admin pages; a banned user's
  session is not rejected there. Tighten it if previews should be role-limited.
- `media/[...key]` becomes an unauthenticated bucket proxy if the local-driver check is removed; keep the
  DB-lookup and driver guards.
- `health` must stay cheap: no storage round trip (that is `npm run preflight`'s job) and the worker
  state must remain informational.
- New CSV/Excel outputs: reuse the `csvCell` neutralisation — lead comments are typed by anonymous visitors.

### Testing Requirements

- `tests/e2e/whatsapp-webhook.spec.ts` (+ `whatsapp-helpers.ts`) — handshake, signed/unsigned/re-serialised
  deliveries, non-JSON payload, idempotent redelivery. Webhook signature logic: `tests/unit/whatsapp.test.ts`;
  event dedupe: `tests/integration/outbox.test.ts`.
- `tests/e2e/public-site.spec.ts` — `/api/health` status and `x-request-id` (generated, echoed, rejects short ids).
- `tests/e2e/leads.spec.ts`, `users.spec.ts` — `/api/admin/leads/export`: 200 CSV for the owner (BOM, formula neutralising); 404 with no session (`leads.spec.ts`) and for a content editor (`users.spec.ts`).
- `tests/e2e/admin.spec.ts`, `portfolio.spec.ts` — `/api/preview`, `/api/preview/exit` and draft mode.
- `tests/e2e/media.spec.ts` — `/api/media/...` URLs in rendered pages.
- `tests/e2e/public-site.spec.ts` ("switching language resolves the equivalent document") covers `/api/locale/[locale]`, linked from `components/layout/language-switcher.tsx`.

### Common Patterns

- Plain `NextResponse` with explicit status; bodies like `'Not found'` / `'Forbidden'` / `'OK'`.
- Handlers import `db` and `@/lib/*` directly (no server actions); audit via `recordAudit` with
  `clientIp(request.headers)`.
- `params` is a Promise.

## Dependencies

### Internal

- `@/lib/auth/{guards,server}`, `@/lib/audit`, `@/lib/client-ip`, `@/lib/whatsapp` + `@/lib/whatsapp/webhook`
  (`parseEnvelope`, `applyEvent`), `@/lib/preview`, `@/lib/storage`, `@/lib/routes`, `@/lib/logger`,
  `@/lib/report-error`, `@/lib/request-id`, `@/data/public/documents`, `@/db/*`, `@/env`,
  `drizzle/meta/_journal.json`.

### External

- better-auth (`better-auth/next-js`), Next.js (`after`, `draftMode`, `NextResponse`), `node:crypto`
  (`timingSafeEqual`), drizzle-orm.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
