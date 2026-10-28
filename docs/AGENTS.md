# Docs

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-28 · **Updated:** 2026-10-28

## Purpose

Project documentation with two audiences. `architecture.md` is for developers and agents: the
decisions, their reasons and the invariants that follow. Everything else is written for the **studio
owner and staff** (non-developers) and is in **Russian on purpose**.

## Key Files

| File | Audience | Language | Description |
|------|----------|----------|-------------|
| `architecture.md` | Developers, agents | English | Living design record, 8 sections: deviations from the brief (no Supabase/RLS/Vercel), content model ("localised leaves"), identifier strategy, database-enforced invariants, caching and the single-replica hazard, toolchain pins, WhatsApp contract, honesty about unknown business facts. |
| `content-operations.md` | Owner, editors, managers | Russian | How to run the site from `/admin`: roles, pages and blocks, draft/publish/rollback, URLs, portfolio, images, menu, settings, leads, contacts, pipeline stages, audit log, FAQ. |
| `launch-checklist.md` | Owner and developer | Russian | What must be true before going public: blocking items (owner data, images, legal pages, first-deploy order, infrastructure, access), non-blocking items, the "Проверено автоматически" table, what is deliberately absent, what is not done yet. |
| `m4-report.md` | Owner | Russian | Report on the last milestone (CRM, pipeline, WhatsApp, export): what was built, decisions, what is auto-tested, what remains with the owner, what honestly is not done. A milestone snapshot. |
| `whatsapp-setup.md` | Owner (Meta account holder) | Russian | Connecting WhatsApp Business: fallback mode, prerequisites, env vars, webhook, lead-alert template, the worker service, the 24-hour rule, troubleshooting, what the system does not do. |
| `backup-restore.md` | Owner / operator | Russian | Backup of the database and the photo volume, manual dump, restore, quarterly check. Marks owner-only steps with `[владелец]`. |

## For AI Agents

### Working In This Directory

- **Keep Russian docs Russian.** Same register as the surrounding text: plain, second person, no
  jargon the owner would not know. Code identifiers, env var names and commands stay as written. Do
  not translate them into English or "improve" the tone.
- **Do not invent facts in owner docs.** The project rule is that unknown business facts stay unknown;
  checklist items are tickboxes (`- [ ]`) and "owner" steps must stay marked as the owner's.
- **Specific numbers are snapshots.** `backup-restore.md` quotes row counts from a restore drill (371
  documents, 258 leads, 14 settings, 6 migrations); `m4-report.md` quotes "136 сквозных и 105 модульных"
  checks; `launch-checklist.md` says "14 адресов" for audited admin screens and "~400 КБ / 208 КБ JS".
  These drift. Re-measure before changing them, or leave them; never guess. (`README.md` deliberately
  names the suites instead of counting them.)
- Documents link each other by relative path (`m4-report.md` → `whatsapp-setup.md`,
  `content-operations.md`, `launch-checklist.md`); keep file names stable.

### When to update which document

| Change | Update |
|--------|--------|
| Structural decision, new invariant, dependency pin or deviation, caching/replica or WhatsApp-contract change | `architecture.md` (the matching numbered section) |
| Admin UI behaviour, role capabilities (`src/lib/auth/guards.ts` matrix), new admin section | `content-operations.md` (its roles table must match the matrix) |
| Scope change before launch, new env var or deploy step, new/removed test coverage, a gap closed or found | `launch-checklist.md` (deploy order, "Проверено автоматически", "Что ещё не сделано") |
| Scope change or correction to what the last milestone delivered | `m4-report.md` |
| WhatsApp env vars, webhook, template, worker or 24-hour behaviour | `whatsapp-setup.md`, plus `architecture.md` §7 if the contract changed |
| Storage, database hosting, backup tooling | `backup-restore.md`, and the storage options in `launch-checklist.md` |

### Testing Requirements

No tests read these files, and Prettier skips Markdown (`*.md` is in `.prettierignore`), so nothing
checks them automatically. Check that every relative link resolves and every env var named exists in `.env.example` or `src/env.ts`.

### Common Patterns

- Owner docs: short sections, tables for roles and options, an explicit "what can go wrong" and "what
  the system does not do" section; steps for the owner are marked `[владелец]` or listed as checkboxes.
- `architecture.md`: tables of *choice | forced by*, with the reason as important as the decision.
- A user-facing claim of the form "covered by tests" must name behaviour a test really asserts.

## Dependencies

### Internal

- `src/lib/auth/guards.ts` (roles), `.env.example` / `src/env.ts` (variables), `tests/` (automated
  coverage claims), `scripts/` (`preflight`, `auth:bootstrap`), `railway.json`, `railway.worker.json`

### External

- None at build time. Railway, Cloudflare R2 and Meta WhatsApp Cloud API are described, not used.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
