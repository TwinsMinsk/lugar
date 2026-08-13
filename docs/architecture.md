# LUGAR — architecture

Living document. Records what was built, and more importantly *why*, including the places where this
implementation deliberately departs from the original brief.

---

## 1. Deviations from the brief, and their consequences

The brief specified Supabase (Postgres + Auth + Storage + RLS) deployed on Vercel. The owner chose
**plain PostgreSQL deployed on Railway**. That is a legitimate call, but it is not a drop-in swap —
three capabilities the brief assumed came for free now have to be provided explicitly.

| Brief | Built | Why, and what it costs |
| --- | --- | --- |
| Supabase Auth | **better-auth 1.6** | Auth.js/NextAuth v5 is in maintenance mode — its team merged into better-auth and v5 never left beta. better-auth has a first-party Drizzle adapter, an admin plugin for RBAC and DB-backed sessions. |
| Supabase Storage | **Cloudflare R2** (S3-compatible) | A Railway Volume is single-writer: it forbids replicas and adds downtime on every redeploy. R2 is multi-writer, CDN-backed, has no egress fees, and supports presigned uploads so large photos never pass through the app server. |
| Postgres RLS | **application-layer authorization** | With app-level auth every query runs as one database role, so RLS has no per-request principal to act on and would provide no isolation. This is a real reduction in defence-in-depth and is compensated for below. |
| Vercel | **Railway** | Railpack builder, `output: 'standalone'`, migrations as a pre-deploy step. |

### How the loss of RLS is compensated

RLS would have been a second, independent layer. Without it, these four mechanisms carry the load,
and none of them is "the UI hides the button":

1. **A single capability matrix.** `src/lib/auth/guards.ts` declares every capability against every
   role in one table. Permission questions have exactly one answer instead of being re-decided at
   each call site. It is unit-tested as data.
2. **Server-enforced guards.** `requireCapability()` runs inside the data layer, not in components.
   `proxy.ts` only checks for the *presence* of a session cookie to avoid a pointless render; it
   never inspects its contents and is not a security boundary.
3. **Module-level separation.** `src/data/public/**` is `import 'server-only'`, exposes no function
   that accepts a revision id from the request, and hard-codes `status = 'published'`. Draft reads
   live in a separate module where every export begins with a preview-token check.
4. **Database-enforced invariants.** Constraints that must never be violated are expressed as
   constraints, so they hold even if application code forgets (see §4).

---

## 2. Content model — "localised leaves"

**One document per page.** Blocks live as JSONB on an immutable revision. Only *string* fields are
locale maps (`{ru, es, en}`); structure — which image, how many columns, where a CTA points — is
shared across all three languages.

The alternative designs (a row per locale, or a whole-payload-per-locale JSONB) all allow structure
to drift between languages: the owner swaps the hero image while editing Russian, and the Spanish
page silently keeps the old one. Here there is exactly one image and three headlines, so breaking
the Spanish layout by editing Russian is not merely discouraged, it is unrepresentable. That is what
"design-safe" has to mean in practice.

**Publishing is per-locale, pointing at a shared frozen revision.** Spanish can sit on revision 7
while Russian is live on 9. Each language therefore always renders a coherent whole-page snapshot,
rather than a mix of half-translated blocks. The cost is that a single *block* cannot be published
in one language independently; if that becomes a real workflow need, the escape hatch is a
`translation_tasks` overlay driving the editor UI, with no change to storage or the render path.

**Slugs are per-locale and NOT NULL**, seeded to the Russian value. When the owner later sets a
Spanish slug, the save handler writes a 301 into `redirects` automatically. No migration required.

**Russian is the fallback.** `LOCALE_FALLBACK` in `src/i18n/routing.ts` is the only place that
encodes this, so an untranslated Spanish field renders the Russian original rather than an empty
slot — a visible gap is worse than an honest fallback.

---

## 3. Identifier strategy

- **UUIDv7** for anything reachable from a URL, a CSV export or a webhook correlation: `contacts`,
  `leads`, `documents`, `media_assets`, `whatsapp_outbox`. Sequential integers there would leak
  business volume (`/admin/leads/47`) and invite enumeration. v7 preserves B-tree insert locality,
  so it avoids the random-insert page splits that make v4 expensive at scale.
- **`bigserial`** for append-only logs never exposed externally: `lead_activities`, `audit_log`,
  `consent_records`, `whatsapp_webhook_events`, `notification_attempts`. The index stays hot,
  ordering by id is meaningful, and 8 bytes beats 16.

All timestamps are `timestamptz` stored in UTC. Operational dates render in `Europe/Madrid` at the
presentation layer only.

---

## 4. Invariants enforced by the database

These are constraints, not conventions, so they survive a future code path that forgets to check.
Each is covered by an integration test that asserts on the SQLSTATE and constraint name — not on the
wrapper message, which would pass for any failed query.

| Invariant | Mechanism |
| --- | --- |
| At most one open draft per document | `one_draft_per_document_uq` — partial unique index on `is_draft` |
| A media asset in use cannot be deleted | `media_usage.asset_id` FK with `onDelete: 'restrict'` |
| Exactly one default-entry lead status | `lead_statuses_default_entry_uq` — partial unique index |
| One lead per idempotency key | `form_submissions_idempotency_uq` |
| One row per provider webhook event | `wa_webhook_event_key_uq` |
| A published revision cannot be deleted | `document_locales.published_revision_id` FK with `restrict` |

Media usage is deliberately **both** computed and constrained: a registry-driven visitor writes
`media_usage` inside the same transaction as the save, *and* the foreign key stops the delete
regardless. Belt and braces, because the failure mode — a published page losing its photograph — is
visible to customers.

### A correction worth recording

The original design called for a generated column
`wa_window_expires_at = last_inbound_at + interval '24 hours'`, on the reasoning that adding a
constant interval to a stored timestamp is immutable and therefore indexable.

That is wrong for `timestamptz`. Interval arithmetic on a timestamptz crosses DST and so depends on
the session `TimeZone`; Postgres classes it as STABLE and rejects it in a generation expression
(`42P17: generation expression is not immutable`).

The fix is not a cleverer expression but a simpler query: put the interval on the *constant* side —
`last_inbound_at > now() - interval '23 hours 55 minutes'` — which is an ordinary range scan against
a plain index on `last_inbound_at`. Same performance, no generated column, less machinery.

---

## 5. Caching and the Railway replica hazard

Published pages are read through `'use cache'` with explicit tags:
`doc-slug:{kind}:{locale}:{slug}`, `doc:{id}:{locale}`, `revision:{id}`, `projects-index:{locale}`,
`nav:{locale}`, `settings:{locale}`, `media:{assetId}`.

Publishing calls `updateTag` (not `revalidateTag`) so the owner sees the change immediately rather
than through stale-while-revalidate.

**The hazard:** Next.js's default cache handler is per-instance. With more than one Railway replica,
publishing on instance A leaves instance B serving stale HTML indefinitely under `cacheLife('max')`.
This presents to the owner as "the CMS is broken" and is easy to misdiagnose.

Mitigation until a shared cache handler is configured: **run a single replica**, and cap
`cacheLife` on `doc-slug:*` at a bounded profile so worst-case staleness is minutes rather than
forever. Revisit before scaling out.

---

## 6. Toolchain decisions forced by real incompatibilities

These were not preferences; each was a build or lint failure.

| Choice | Forced by |
| --- | --- |
| Node **24 LTS**, not the system's 25.9 | Node 25 defines a global `localStorage`, so server code that feature-detects it to identify a browser takes the wrong branch. Verified directly: `typeof localStorage` is `'object'` on 25, `'undefined'` on 24. |
| TypeScript **6.0.3**, not 7.0.2 | `typescript-eslint@8.67` declares `typescript >=4.8.4 <6.1.0`. TS 7 (the native Go port) would silently break linting. Revisit when typescript-eslint ships TS 7 support. |
| ESLint **9.39.5**, not 10.8.1 | ESLint 10 requires `scopeManager.addGlobals`, which typescript-eslint's scope manager does not implement — every lint run died with `TypeError: scopeManager.addGlobals is not a function`. |
| `@tanstack/react-table` **8.21.3**, not v9 | v9 shipped this month as a rewrite (`useTable` replaces `useReactTable`). Every shadcn data-table recipe predates it. Upgrade as its own task. |
| `--conditions=react-server` on tsx scripts | `server-only` throws on import under plain Node; its `react-server` export is an empty module, which is the correct resolution for a genuine server process. |
| ESLint flat config without `FlatCompat` | `eslint-config-next@16` exports flat config natively. |

---

## 7. WhatsApp integration contract

Three implementations behind one interface, selected by `WHATSAPP_MODE`:

- **`fallback`** — `wa.me` links only. No programmatic sending. The safe default, and the mode the
  site can launch in before Meta business verification completes.
- **`mock`** — records outbound messages in the database, never touches the network.
- **`cloud_api`** — Meta Graph **v26.0**.

Design points that are load-bearing:

- **The outbox row is written in the same transaction as the lead.** Commit is the durability
  boundary. A `pg_notify` in `after()` is only a latency optimisation; if the process dies before
  notifying, the worker's poll picks the job up. There is no window in which a lead exists without
  its outbox row.
- **The worker is a separate always-on Railway service**, not cron. Railway cron has a 5-minute
  floor and skips overlapping runs — unacceptable for "a hot lead just arrived". Jobs are claimed
  with `FOR UPDATE SKIP LOCKED` plus a `claimed_until` lease so a crashed worker's jobs are
  reclaimable.
- **Webhook status codes are chosen deliberately**, because Meta retries any non-200 for seven days:
  invalid signature → **403** (a forgery generates no retries; and if a *genuine* delivery fails the
  check, our app secret is wrong and a week of retries is exactly the grace period we want);
  unparseable payload → **200** (retrying it will never succeed, and a non-200 turns one bad event
  into a week-long storm); database write failure → **500** (a retry genuinely will succeed).
- **The raw envelope is committed synchronously before the 200.** Deferring the insert into
  `after()` would acknowledge an event that might never have been stored.
- **`/api/whatsapp/*` is excluded from the `proxy.ts` matcher.** The HMAC is computed over the raw
  request body; anything that buffers or re-serialises it breaks verification silently.
- **Staff numbers get no opt-in exemption.** Meta's policy has no carve-out for a business's own
  employees, so an out-of-window internal alert needs an approved UTILITY template.
  `notification_attempts` is therefore channel-agnostic: when WhatsApp returns `blocked_window` or
  `dead`, an email alert fires instead. The CRM must never be the only place a new lead surfaces.

---

## 8. Honesty about unknown business facts

Nothing in this repository invents a fact about the business. Unknown values — Instagram and
Facebook URLs, physical address, service area specifics, legal registration details, analytics IDs,
logo and photography — live in `site_settings` as `null` with `needs_review = true`, never as a
plausible-looking placeholder that could be mistaken for real.

The prototype shipped `https://www.instagram.com/` as a stand-in social link. That is exactly the
kind of value that survives to production unnoticed, so it is stored as `null` instead.

`npm run db:seed` prints the outstanding count; the admin dashboard will surface the same list, and
publishing a page that still references a placeholder asset requires explicit owner confirmation.
