# content

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-28 · **Updated:** 2026-10-28

## Purpose

The data-only core of the CMS: localised-leaf primitives and the fallback function `t()`, the
constrained rich-text schema, the typed registry of editable site settings, the in-code legal texts,
and (in `blocks/`) the block schemas and their renderer. Everything here is importable from server,
client, seed scripts and tests; nothing opens a database connection.

## Key Files

| File | Description |
|------|-------------|
| `i18n.ts` | `localizedText(max)` / `localizedTextOptional(max)` Zod builders (`ru` required in the first), `t()` / `tRequired()` fallback chokepoint (uses `LOCALE_FALLBACK`), `translatedLocales()`, rich-text allowlists `RICH_TEXT_NODES` / `RICH_TEXT_MARKS`, `richTextDoc`, `localizedRichText`. Re-exports `DEFAULT_LOCALE`, `LOCALE_FALLBACK`, `LOCALES`, `Locale` from `@/i18n/routing`. |
| `settings-registry.ts` | `SETTINGS` array: key, group, `kind`, Russian label/help and a Zod `schema` per global setting; `SETTINGS_BY_KEY`, `settingFields()` (schema stripped, safe for client props), `coerceSettingValue(kind, raw)`, `SETTING_GROUPS`. |
| `legal.ts` | `LEGAL_TEXTS` (`privacy`, `cookies`; each has `heading` and `content` per locale as TipTap-JSON docs) and `LEGAL_PLACEHOLDERS` (bracketed blanks the studio must fill, e.g. `[NIF/CIF]`). Drafts for a lawyer, not final legal text. |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `blocks/` | Block type schemas, registry, defaults, media-usage extraction and public renderer (see `blocks/AGENTS.md`) |

## For AI Agents

### Working In This Directory

- **Never read a localised field directly.** `value.es` can be `undefined` or `''`; always go through
  `t(value, locale)` (optional) or `tRequired(value, locale)` (schema guarantees `ru`). `t()` treats
  `''` as missing and walks `LOCALE_FALLBACK[locale]` (es → ru, en → ru; es never borrows en).
- Only string leaves are localised. Do not add a locale map around a structural value (image id,
  column count, link target) — see "localised leaves" in `docs/architecture.md` §2.
- **Rich text is an allowlist.** Adding a node or mark means editing `RICH_TEXT_NODES` /
  `RICH_TEXT_MARKS` here **and** the `switch` in `blocks/render/rich-text.tsx` (unknown nodes are
  silently dropped on render, so a schema-only change looks valid and renders nothing).
  `richTextNodeSchema` also accepts any `attrs` record — URL safety for links is enforced at render
  time, not in the schema.
- **Settings registry.** Adding a setting is one `SETTINGS` entry (no migration), but it only reaches
  the public site once `src/data/public/settings.ts` (`SiteSettings` / `getSiteSettings`) reads the key.
  Trap: that reader already uses `legal.consentVersion`, which has no entry in `SETTINGS`.
  `kind` drives `coerceSettingValue` — JSONB returns all-digit strings (WhatsApp number) as numbers,
  so a new numeric-looking text setting must use a string kind or it will round-trip as a number.
  URL settings must keep the `http(s)` refinement (stored-XSS guard).
- Setting labels and help text are Russian on purpose (admin UI language). Unknown business facts are
  never given defaults here; they live as `null` + `needs_review` in the database.
- **Legal texts live in code**, not in the admin panel (`legal_rich_text` blocks expose no editable
  fields). To change a published text, edit `legal.ts` and use `scripts/apply-legal-texts.ts` — the
  seed (`src/db/seed/content.ts`) only affects fresh databases. Keep the cookie names/durations in
  the cookie text in step with `features/consent/consent.ts` (`lg_consent`, 180 days) and
  `features/attribution/attribution.ts` (`lg_attr`, 365 days).

### Testing Requirements

- `tests/unit/content.test.ts` — `t`/`tRequired`/`translatedLocales`, block registry, media usage,
  settings coercion and per-setting schema rules.
- `tests/unit/legal-texts.test.ts` — every legal doc validates against `legalRichTextSchema`, uses only
  allowlisted nodes (reads `blocks/render/rich-text.tsx`), covers all `LOCALES`.
- `tests/unit/rich-text-plain.test.ts` — `richTextToPlainText`.
- `tests/e2e/settings.spec.ts` — E.164 / http(s) validation and settings reaching the live site.

### Common Patterns

- Schema first, then `z.infer` types; builders (`localizedText(max)`) take a max length so every
  user-facing string is bounded.
- Import locale constants from `@/i18n/routing` (or via the re-export in `i18n.ts`), never redefine.
- Server/client boundary: Zod schemas cannot be passed to client components, hence `settingFields()`.

## Dependencies

### Internal

- `@/i18n/routing` — `LOCALES`, `LOCALE_FALLBACK`, `Locale`
- Consumers: `src/data/**`, `src/app/(admin)/admin/_actions/{content,settings,portfolio}.ts`,
  `src/features/admin/*`, `src/components/**`, `src/db/seed/*`, `scripts/apply-legal-texts.ts`,
  `src/worker/outbox-worker.ts` (uses `coerceSettingValue`)

### External

- `zod` 4

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
