# schema

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-28 · **Updated:** 2026-10-28

## Purpose

Drizzle table, enum and index definitions for the PostgreSQL database. `index.ts` is the barrel that
`drizzle.config.ts` points at (`schema: './src/db/schema/index.ts'`); a table that is not re-exported
there does not appear in generated migrations. Because there is no RLS, the partial unique indexes and
`restrict` foreign keys declared here are the only enforcement of the invariants below.

## Key Files

| File | Tables / enums | Description |
|------|----------------|-------------|
| `_shared.ts` | helpers | `uuid7()` (`uuid('id').primaryKey().$defaultFn(uuidv7)`), `ts()` (`timestamptz`, date mode), `timestamps` (`created_at`, `updated_at` with `$onUpdate`), `softDelete` (`archived_at`, `deleted_at`), a second `LOCALES`/`DEFAULT_LOCALE` copy (the app uses `@/i18n/routing`). |
| `auth.ts` | `user`, `session`, `account`, `verification`, `invitation`; enum `user_role` (`owner`, `manager`, `content_editor`) | better-auth tables: **text ids and column names are dictated by the adapter, never rename**. `user` carries admin-plugin columns `role`, `banned`, `ban_reason`, `ban_expires`. `invitation` (uuid7) stores only `token_hash`. |
| `content.ts` | `documents`, `document_revisions`, `document_locales`, `redirects`, `navigation_items`; enums `locale`, `doc_kind`, `publish_status` | The CMS: one document per page/project, immutable JSONB revisions, per-locale publish pointers, slug-history redirects, menu items linked by `document_id`. |
| `media.ts` | `media_assets`, `media_derivatives`, `media_usage` | Originals, generated derivatives (pk `asset_id, width, format`), and the revision-to-asset usage index. |
| `portfolio.ts` | `portfolio_categories`, `portfolio_projects`, `portfolio_project_categories`, `service_categories` | A project **is** a `documents` row (`kind = 'project'`); `portfolio_projects.document_id` is the 1:1 queryable extension. |
| `crm.ts` | `contacts`, `lead_statuses`, `form_submissions`, `leads`, `lead_activities`, `lead_assignments`, `lead_tasks`, `projects`, `project_files`, `consent_records`; enums `contact_source`, `activity_kind`, `actor_type`, `consent_purpose` | CRM. `projects` here is the customer-project table, unrelated to portfolio projects. |
| `whatsapp.ts` | `whatsapp_outbox`, `whatsapp_webhook_events`, `whatsapp_messages`, `notification_attempts`; enums `outbox_status`, `outbox_purpose`, `outbox_kind`, `message_direction` | Durable send queue, raw webhook envelopes, message log, per-attempt log. |
| `settings.ts` | `site_settings`, `audit_log`, `rate_limits`, `service_heartbeats` | Key/value settings with `needs_review`, audit trail, fixed-window limiter, worker liveness (pk `service`). |
| `index.ts` | barrel | `export *` of every file above. |

## ID strategy

- **UUIDv7 (`uuid7()`)**: `documents`, `document_revisions`, `redirects`, `navigation_items`,
  `invitation`, `media_assets`, `portfolio_categories`, `service_categories`, `contacts`,
  `lead_statuses`, `form_submissions`, `leads`, `lead_tasks`, `projects`, `project_files`,
  `whatsapp_outbox`, `whatsapp_messages`, `site_settings`, **`audit_log`**.
- Composite or natural pks: `document_locales` `(document_id, locale)`, `media_derivatives`
  `(asset_id, width, format)`, `media_usage` `(revision_id, block_id, field_path)`,
  `portfolio_projects` (`document_id`), `portfolio_project_categories`.
- **`bigserial` (`mode: 'bigint'`)**: `lead_activities`, `lead_assignments`, `consent_records`,
  `whatsapp_webhook_events`, `notification_attempts`. Bigint ids reach the UI via `String(row.id)`.
- better-auth tables use `text` ids; `rate_limits` pk is `(key, window_start)`; `service_heartbeats` pk
  is `service`.
- `docs/architecture.md` §3 lists `audit_log` among the bigserial tables. The schema (and migration
  0000) make it `uuid`. Trust the schema.

## DB-enforced invariants

| Invariant | Constraint / index | Asserted by |
|-----------|--------------------|-------------|
| At most one open draft per document | `one_draft_per_document_uq` (partial unique on `document_id` where `is_draft`) | `tests/integration/schema-invariants.test.ts` ("content invariants") — checks `error.constraint` |
| Revision numbers unique per document | `revision_number_uq` | no direct assertion |
| Slug unique per kind and locale | `document_locale_slug_uq` (`kind, locale, slug`) | no direct assertion (`publishing.test.ts` covers `updateSlug` behaviour) |
| Live revision cannot be deleted | `document_locales_published_revision_id_document_revisions_id_fk` (`restrict`) | no direct assertion |
| Asset in use cannot be deleted | `media_usage_asset_id_media_assets_id_fk` (`restrict`); also `portfolio_projects_cover_asset_id_media_assets_id_fk` | `schema-invariants.test.ts` ("media usage guard") — asserts SQLSTATE in `RESTRICT_CODES` (`23001` on PG 18, `23503` earlier) and message matches `media_usage` |
| Exactly one default-entry lead status | `lead_statuses_default_entry_uq` (partial unique where `is_default_entry`) | `schema-invariants.test.ts` ("pipeline invariants") — checks `error.constraint` |
| `contacts`/`lead_statuses` cannot be removed while leads exist | `leads_contact_id_contacts_id_fk`, `leads_status_id_lead_statuses_id_fk` (`restrict`) | no direct assertion; e2e `pipeline.spec.ts` covers the UI refusal |
| One lead per idempotency key | `form_submissions_idempotency_uq` | no integration test; used via `onConflictDoNothing` in `src/features/leads/actions.ts` |
| One row per webhook event | `wa_webhook_event_key_uq` | `tests/integration/outbox.test.ts` ("webhook event dedupe") — asserts behaviour via `onConflictDoNothing`, not the constraint name |
| One alert per dedupe key | `wa_outbox_dedupe_uq` (partial where `dedupe_key is not null`) | `outbox.test.ts` ("outbox dedupe") — behaviour, not constraint name |
| Unique phone / public id / redirect source / live checksum | `contacts_phone_uq`, `leads_public_id_uq`, `redirect_from_uq`, `media_checksum_uq` (where `deleted_at is null`), `documents_seed_key_uq` (where `seed_key is not null`) | not asserted directly |

Architecture §4 says every invariant is covered by a test asserting the constraint name. In fact only
`one_draft_per_document_uq` and `lead_statuses_default_entry_uq` are asserted by name; the media guard
is asserted by SQLSTATE plus message; the webhook and outbox dedupe tests assert behaviour.

## For AI Agents

### Working In This Directory

**Exact workflow for a schema change**

1. Edit the table in the right file here; if it is a new file, add it to `index.ts` first.
2. Make sure `DATABASE_URL` is set (drizzle-kit refuses to start otherwise; `drizzle.config.ts` loads
   `.env.local` via `scripts/load-env`).
3. `npm run db:generate` (`drizzle-kit generate`, `strict: true`). It writes a new
   `drizzle/NNNN_<name>.sql`, `drizzle/meta/NNNN_snapshot.json` and appends to `drizzle/meta/_journal.json`.
4. Read the generated SQL. Drizzle cannot express data backfills; add `UPDATE`s by hand to **the new,
   not-yet-applied** file if needed (migration `0005` is an example of a data-only change).
5. `npm run db:migrate` against a local database (`npm run docker:up` for Postgres).
6. Run `npm test` (integration tests migrate `lugar_test` from `./drizzle` themselves) and
   `npm run build`.
7. Commit the SQL, the snapshot and the journal change together with the schema edit.

Never `drizzle-kit push`, never edit an applied migration, never hand-edit `meta/`.

**Traps**

- Partial unique indexes cannot be arbiters unless the `ON CONFLICT` target restates the predicate:
  `onConflictDoNothing({ target: x, where: sql\`… is not null\` })` (see `seed/pages.ts`,
  `outbox.test.ts`). Without it Postgres raises `42P10`.
- Several relations are plain `uuid` columns with **no FK** (to avoid cycles or by choice):
  `documents.draft_revision_id`, `leads.submission_id`, `form_submissions.lead_id` / `contact_id`,
  `navigation_items.parent_id`. Deleting the target will not be stopped by the database.
- `document_locales.kind` is denormalised from `documents.kind` so `document_locale_slug_uq` works;
  keep them in sync on write.
- No generated `wa_window_expires_at` column: `timestamptz + interval` is STABLE and fails with
  `42P17` in a generation expression. Use `last_inbound_at > now() - interval '23 hours 55 minutes'`.
- Index predicates are written as raw `sql` strings (`deleted_at is null and archived_at is null`);
  readers in `src/data/admin` must repeat the same predicate for the index to be used.
- `documents` uses only `archived_at`, not the `softDelete` pair: permanent removal is a real `DELETE`.
  `lead_statuses` likewise has a bare `archived_at`.
- better-auth names (`user`, `session`, `account`, `verification`, their columns) must not be renamed.

### Testing Requirements

- `tests/integration/schema-invariants.test.ts`, `tests/integration/outbox.test.ts`,
  `tests/integration/publishing.test.ts`; helpers `tests/helpers/db.ts`, `tests/helpers/errors.ts`
  (`PG`, `RESTRICT_CODES`, `captureDbError`). Assert on SQLSTATE and `error.constraint`, not on the
  wrapped Drizzle message.
- Requires Postgres: `npm run docker:up`, `DATABASE_URL_TEST`, `DATABASE_ADMIN_URL`.
- `tests/unit/guards.test.ts` imports `ROLES` from `@/lib/auth/server`, which must stay in step with the
  `user_role` enum.

### Common Patterns

- `...timestamps` on mutable tables; `...softDelete` on `contacts`, `leads`, `projects`.
- Enums as `pgEnum` exported next to the table that owns them; plain `text`/`varchar` where the set is
  open (`documents.template`, `navigation_items.menu`, `lead_tasks.kind`, `projects.stage`,
  `project_files.status` = `orphan` | `attached`, `leads.service`).
- Partial indexes for hot filters (`where archived_at is null`, `where status in (…)`).
- JSONB for localised leaves (`label`, `alt`) and block payloads (`document_revisions.blocks`, `meta`).

## Dependencies

### Internal

- `../client.ts` imports `* as schema` from this barrel; `src/lib/auth/server.ts` imports `./auth` tables
  directly for the better-auth Drizzle adapter.

### External

- `drizzle-orm/pg-core`, `uuid` (`v7`), `drizzle-kit` (generation only)

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
