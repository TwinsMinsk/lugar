# whatsapp

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-28 · **Updated:** 2026-10-28

## Purpose

The WhatsApp integration boundary. Everything that sends or verifies goes through one
`WhatsAppProvider` interface with three interchangeable implementations chosen by `WHATSAPP_MODE`. The
provider never retries or schedules; durable state lives in the transactional outbox
(`whatsapp_outbox`) and is drained by the separate worker (`src/worker/outbox-worker.ts`). This
directory also holds the Meta webhook envelope parser. HTTP handling for the webhook is in
`src/app/api/whatsapp/webhook/route.ts`.

## Key Files

| File | Description |
|------|-------------|
| `provider.ts` | Pure types and policy, no `server-only`. `SendResult` (`sent` / `skipped` / `retryable` / `permanent` / `needs_template`), `SendTextParams`, `SendTemplateParams`, `WhatsAppMode`, the `WhatsAppProvider` interface (`mode`, `canSendProgrammatically`, `sendText`, `sendTemplate`, `buildHandoffLink`, `verifyWebhookSignature`), and `ERROR_CLASSIFICATION` / `classifyError(code, httpStatus?)`. Unknown 5xx is retryable, unknown 4xx permanent. |
| `index.ts` | `server-only`. Implements the three providers and exports `whatsapp()` (cached singleton selected by `env.WHATSAPP_MODE`; anything else falls to `fallback`) and `verifySignature(rawBody, header, appSecret)`. |
| `cloud-api.ts` | `server-only`. Meta Graph transport: `sendTextViaCloudApi`, `sendTemplateViaCloudApi`, `normalizeRecipient` (digits only), `orderedParameters` (template body params sorted by numeric key). One `fetch` POST with a 15 s timeout, `cache: 'no-store'`; maps the response onto `SendResult` and honours `retry-after`. |
| `webhook.ts` | `server-only`. `parseEnvelope(payload)` flattens one POST into `ParsedEvent[]` (`message`, `status`, `template_status`, `quality_update`, `other`) with idempotency keys; `applyEvent(event, eventId)` writes contacts, messages, activities and marks `whatsapp_webhook_events.processed_at`. |

## Modes (`WHATSAPP_MODE`, default `fallback`)

| Mode | `canSendProgrammatically` | Sends | Notes |
|------|:--:|-------|-------|
| `fallback` | false | returns `skipped: no_programmatic_send` | `wa.me` hand-off links only. The mode the site can launch in before Meta business verification. The worker marks the row `skipped` and fires the email fallback. |
| `mock` | true | returns `sent` with `mock_<hash>` id; no network | Exercises claim/attempt/settle without messaging anyone. |
| `cloud_api` | true | Graph API `v26.0` by default (`WHATSAPP_GRAPH_API_VERSION`) | `src/env.ts` refuses to boot unless `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN` **and** `WHATSAPP_INTERNAL_RECIPIENTS` are set. |

All three build the hand-off link the same way (`buildHandoffLink` → `whatsappLink` from `src/lib/routes.ts`)
and return `null` rather than a bare `https://wa.me/` when no number is configured; the number comes
from the `contact.whatsappNumber` setting, never an env var. All three verify signatures with the same
function, so `fallback` and `mock` still reject unsigned webhooks.

## Signature verification

`verifySignature` is HMAC-SHA256 over the **raw request body bytes**, keyed by the Meta **App Secret**
(`WHATSAPP_APP_SECRET`, not the access token), compared with `timingSafeEqual` against the
`x-hub-signature-256: sha256=<hex>` header. Missing secret, missing/garbled header or length mismatch
returns `false`. The route reads `await request.text()` first and verifies before parsing. `/api` is
excluded from `proxy.ts` (`isExcluded`) so nothing re-serialises the body.

Response policy in the route (Meta retries non-200 for 7 days): bad signature **403**; non-JSON body
**200**; envelope with no events **200**; DB failure persisting the raw envelope **500**; success
**200**. The `GET` handler is the subscription handshake (`WHATSAPP_WEBHOOK_VERIFY_TOKEN`, constant-time
compare, challenge returned as `text/plain`). Events are inserted into `whatsapp_webhook_events` with
`onConflictDoNothing(eventKey)` before the response; `applyEvent` runs afterwards in `after()`.

## Outbox interplay

- **Enqueue** (writer side, in the caller's transaction): the lead form
  (`src/features/leads/actions.ts`, purpose `internal_new_lead`, kind `template`,
  `requiresWindow: false`, `dedupeKey internal_new_lead:<leadId>:<recipient>`, one row per entry of
  `WHATSAPP_INTERNAL_RECIPIENTS`) and the admin actions in `_actions/whatsapp.ts` (`manual_reply` text with
  `requiresWindow: true` after a consent and window check; `manual_template`; owner-only requeue/cancel).
  Commit is the durability boundary.
- **Worker** (`src/worker/outbox-worker.ts`, always-on Railway service, polls every 3 s idle): `claimBatch`
  runs an `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED LIMIT 10)` that takes
  `pending`/`failed_retryable` rows due now plus `claimed` rows whose lease (120 s) expired, and increments
  `attempt_count` at claim time. `processJob` re-checks the 24 h window (23 h 55 m) for `requiresWindow`
  text, calls `whatsapp().sendText/sendTemplate`, records a `notification_attempts` row, then `settle`
  maps `SendResult` to `sent` (+ `whatsapp_messages` row), `skipped`, `blocked_window` (needs template),
  `dead` (permanent or attempts exhausted, default `max_attempts` 8) or `failed_retryable` with
  exponential backoff (5 s × 3^n, jittered, cap 1 h, or `retryAfterMs`). `skipped`, `blocked_window` and
  `dead` on an `internal_new_lead` job trigger the Resend email fallback to the `contact.email` setting.
- **Status loop**: Meta's `statuses` webhooks update `whatsapp_messages` and
  `whatsapp_outbox.delivery_status` by wamid via `applyEvent`.
- **No `pg_notify`/LISTEN anywhere in `src`.** The worker is poll-only; `docs/architecture.md` §7
  mentions a `pg_notify` latency optimisation that does not exist.
- Enum values `outbox_purpose = 'customer_ack'` and `outbox_status = 'needs_review'` exist in the schema
  but nothing in `src` writes them.

## For AI Agents

### Working In This Directory

- **Never retry inside a provider.** Return the right `SendResult`; the worker owns backoff because the
  attempt count must survive a restart. Add new Meta codes to `ERROR_CLASSIFICATION`, not to ad hoc ifs.
- **Never parse the body before verifying it** and keep `/api/whatsapp/*` out of `proxy.ts`.
- Free-form text is legal only within the 24 h window; outside it use an approved UTILITY template.
  Staff numbers have no exemption.
- A `200` from Meta without a message id is classified `permanent` (code `-1`), not success.
- Don't send from a Server Component or on a render path; sends are only ever queued.
- `webhook.ts#applyEvent` must stay replayable from `whatsapp_webhook_events.raw` (it runs after the 200).
  Message event keys are `msg:<wamid>`, status keys `st:<wamid>:<status>`, template `tpl:...`,
  quality `qual:...`. The worker deletes processed events older than 90 days.
- Secrets: `WHATSAPP_ACCESS_TOKEN` and the signature header are redacted by `src/lib/logger.ts`; keep
  tokens out of `notification_attempts.request_summary`.
- `data/admin/whatsapp.ts#listApprovedTemplates` calls the Graph API directly for template names; don't
  hardcode a template list.

### Testing Requirements

- Unit: `tests/unit/whatsapp.test.ts` — signature (including the re-serialised-JSON regression),
  `parseEnvelope`, `classifyError`, `backoffMs`, `normalizeRecipient` / `orderedParameters`, hand-off link
  nullability.
- Integration (real Postgres): `tests/integration/outbox.test.ts` — SKIP LOCKED single delivery, claim-time
  attempt counting, lease takeover, retry/dead-letter/`blocked_window` settling, `windowIsOpen`, dedupe
  key, webhook event-key dedupe, `runMaintenance`, `beat`.
- E2E: `tests/e2e/whatsapp-webhook.spec.ts` (handshake, 403 on unsigned or re-serialised body, 200 on
  signed delivery), helpers in `tests/e2e/whatsapp-helpers.ts`.

### Common Patterns

- Interface-first: callers use `whatsapp()` and `canSendProgrammatically`, never `env.WHATSAPP_MODE`.
- Outbound payloads are plain objects built by small pure helpers that are exported for tests.

## Dependencies

### Internal

- `@/env`, `@/lib/routes` (`whatsappLink`), `@/db/client`, `@/db/schema` (`webhook.ts`)
- Consumers: `src/app/api/whatsapp/webhook/route.ts`, `src/worker/outbox-worker.ts`,
  `src/data/admin/whatsapp.ts`, `src/features/leads/actions.ts`, `_actions/whatsapp.ts`

### External

- Meta Graph API (`graph.facebook.com`) via global `fetch`; `node:crypto` HMAC. No Meta SDK.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
