# messages

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-28 · **Updated:** 2026-10-28

## Purpose

next-intl catalogues for **UI chrome only**: button labels, aria text, form labels and validation
messages, cookie-banner text, error pages. Editorial copy (page text, project titles, navigation
labels, SEO titles, FAQ answers, legal texts) is *not* here: it is stored in the database as localised
leaves (`{ ru, es, en }`) and read through `t()` from `src/content/i18n.ts`. Developers edit this
folder in git; the owner edits content in `/admin`; the two never overlap. The admin panel itself is
Russian-only and has no catalogue.

## Key Files

| File | Description |
|------|-------------|
| `ru.json` | Source catalogue and the reference for key structure. |
| `es.json` | Spanish; must have exactly the same keys as `ru.json`. |
| `en.json` | English; must have exactly the same keys as `ru.json`. |

Loaded per request by `src/i18n/request.ts` (a dynamic `import()` of `messages/<locale>.json`) and
handed to `NextIntlClientProvider` in `src/app/(site)/[locale]/layout.tsx`.

### Namespaces (top-level keys, identical in all three files)

| Namespace | Used by |
|-----------|---------|
| `common` | `close` — `features/leads/lead-dialog.tsx` |
| `nav` | Skip link (layout), `header`/`mobile-menu`/`language-switcher` aria labels, `switchTo` / `currentLanguage` with `{language}` |
| `cta` | `header.tsx`, `sticky-mobile-cta.tsx` read `whatsapp` and `whatsappShort`; `price`, `calculate`, `measure`, `allWorks` have no `t()` call site in `src/` today (kept in all three files; the parity test does not care) |
| `form` | Lead dialog: field labels, placeholders, `consentPersonal` (rich text with a `<policy>…</policy>` tag, rendered with `t.rich`), `successBody` (`{publicId}`), and `form.errors.*` |
| `portfolio` | `portfolio-filter.tsx` (`filterLabel`, `filterAll`, `showing` with `{count}`/`{total}`, `empty`), teaser block (`teaserEmpty`); `category` has no call site today |
| `consent` | `consent-banner.tsx` and the footer's `manage` link |
| `error` | `error.tsx` and `not-found.tsx` in `app/(site)/[locale]` |

`form.errors.*` keys are the **codes** returned by `src/features/leads/schema.ts` (Zod messages such
as `nameRequired`, `phoneRequired`, `consentRequired`) and by `submitLead` (`phoneInvalid`,
`rateLimited`, `generic`); the dialog looks them up as `errors.${code}`.

## For AI Agents

### Working In This Directory

- **Adding a key = adding it to all three files at the same path, in the same change.**
  Steps: add to `ru.json` → add the Spanish and English translations at the identical nested path →
  use it via `useTranslations('ns')` (client) or `getTranslations('ns')` (server) → run
  `npx vitest run tests/unit/messages-parity.test.ts`.
- **Removing or renaming a key** must also hit all three; the parity test fails on drift in either
  direction.
- **No Cyrillic in `es.json` / `en.json`** — the parity test fails on any value containing it, so an
  untranslated copy of the Russian string is rejected.
- Missing keys do not crash production: `getMessageFallback` in `src/i18n/request.ts` renders the last
  key segment (e.g. `retry`), and `onError` only warns in development. That is why drift would
  otherwise ship unnoticed.
- ICU placeholders (`{language}`, `{count}`, `{total}`, `{publicId}`) and rich tags (`<policy>`) must be
  kept identical across locales; the parity test checks keys only, not placeholders.
- next-intl types keys literally; dynamic lookups (`errors.${code}`) need the widening cast already
  used in `lead-dialog.tsx`.
- Content that the owner should be able to change without a deploy does **not** belong here (and
  strings inside CMS blocks never do). Conversely, do not put UI chrome into a CMS block.
- Some public-site strings are currently hard-coded outside this catalogue (the `ContactBlock` labels
  in `src/content/blocks/render/index.tsx`, `MediaImage` placeholder text, the legal-block template
  notice). Prefer catalogue keys for new chrome; do not assume these are already covered here.
- Keep the catalogue flat-ish (namespace → key, with `form.errors` the only third level); namespaces
  mirror features, not files.

### Testing Requirements

- `tests/unit/messages-parity.test.ts` — imports all three JSON files; asserts identical flattened key
  sets and no Cyrillic in `es`/`en`.
- `tests/e2e/public-site.spec.ts` and `tests/e2e/accessibility.spec.ts` render the strings in real
  locales (cookie banner, lead dialog, mobile menu).

### Common Patterns

- `useTranslations('form')` + `t('errors.nameRequired')`; `t('showing', { count, total })`;
  `t.rich('consentPersonal', { policy: (chunks) => <Link …>{chunks}</Link> })`.

## Dependencies

### Internal

- `src/i18n/request.ts` (loader), `src/i18n/routing.ts` (which locales exist),
  `src/features/leads/schema.ts` (error codes), components listed above

### External

- `next-intl` 4 (ICU MessageFormat)

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
