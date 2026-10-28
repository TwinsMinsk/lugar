# i18n

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-28 · **Updated:** 2026-10-28

## Purpose

The single definition of which locales exist and how URLs and UI strings follow from them: locale list
and fallback chain, next-intl routing (`localePrefix: 'as-needed'`), per-request message loading, and
locale-aware navigation primitives. Page *content* is not loaded here; it comes from the CMS as
localised leaves (see `../content/i18n.ts`). UI chrome strings come from `../../messages/*.json`.

## Key Files

| File | Description |
|------|-------------|
| `routing.ts` | `LOCALES = ['ru','es','en']`, `Locale`, `DEFAULT_LOCALE = 'ru'`, `LOCALE_FALLBACK` (ru→[ru], es→[es,ru], en→[en,ru]), `LOCALE_TAG` (`<html lang>` / `og:locale`: ru-RU, es-ES, en-GB), `HREFLANG_TAG` (ru-RU, es-ES, **en**), `LOCALE_LABEL` (switcher text), `LOCALE_PHONE_REGION` (all `'ES'`), and `routing = defineRouting({ locales, defaultLocale, localePrefix: 'as-needed', localeDetection: false })`. |
| `request.ts` | next-intl `getRequestConfig`: validates the requested locale (invalid → `ru`), dynamically imports `../../messages/${locale}.json`, sets `timeZone: 'Europe/Madrid'`, a `short` date format, `onError` (warns only in development) and `getMessageFallback` (last key segment, so a missing key shows its name instead of crashing). Registered in `next.config.ts` via `createNextIntlPlugin('./src/i18n/request.ts')`. Re-exports `LOCALE_TAG`. |
| `navigation.ts` | `createNavigation(routing)` → `Link`, `redirect`, `usePathname`, `useRouter`, `getPathname`. |

## For AI Agents

### Working In This Directory

- **`routing.ts` is the only place that knows the locale list and fallback.** Everything else
  (Zod enums in `features/leads/schema.ts`, `content/i18n.ts`, the sitemap, admin editors) derives from
  `LOCALES` / `LOCALE_FALLBACK`. Adding a locale means: this file, a new `messages/<locale>.json`,
  `LOCALE_TAG` / `HREFLANG_TAG` / `LOCALE_LABEL` / `LOCALE_PHONE_REGION` entries (they are
  `Record<Locale, …>`, so TypeScript will flag omissions), the `localizedText` shapes in
  `src/content/i18n.ts` (hard-coded `ru`/`es`/`en` keys), `src/content/settings-registry.ts`
  (derived from `LOCALES`), and seed data — grep for `'ru'`/`LOCALES` and check the DB schema for
  locale columns.
- `LOCALE_TAG` and `HREFLANG_TAG` are deliberately different for English (`en-GB` vs `en`): the former
  describes the text, the latter targets a market. Do not unify them.
- `localeDetection: false` is intentional: locale comes from the URL only, so canonical URLs never
  depend on `Accept-Language`. Russian is unprefixed; `/es` and `/en` are prefixed.
- Build URLs with `localePath()` / `documentPath()` in `src/lib/routes.ts` or `Link` from here; never
  concatenate `/${locale}/…`. For server-side language switching the code uses `/api/locale/[locale]`
  (resolves the equivalent document per locale; slugs may differ).
- Import `Link`/`redirect`/`useRouter` from `@/i18n/navigation`, not `next/link` / `next/navigation`.
- `request.ts` swallows missing-message errors in production by design; the parity unit test is what
  protects against drift. A message key that exists in `ru.json` only will render as its last segment.
- `src/proxy.ts` runs `createIntlMiddleware(routing)`, so changing `routing` changes middleware
  behaviour as well as page URLs.

### Testing Requirements

- `tests/unit/messages-parity.test.ts` — the three catalogues have identical key sets and es/en
  contain no Cyrillic values.
- `tests/unit/content.test.ts` — `localePath` / `documentPath` prefix behaviour and the `t()` fallback
  chain.
- `tests/e2e/public-site.spec.ts` — unprefixed Russian vs prefixed es/en, language switch resolves the
  equivalent document, hreflang alternates plus x-default, localised 404s.

### Common Patterns

- Server Components: `getTranslations('ns')` from `next-intl/server`; Client: `useTranslations('ns')`.
- Locale-aware date/time rendering uses `Europe/Madrid` from `request.ts`; DB values stay UTC.

## Dependencies

### Internal

- Imported by almost every layer (`content/`, `data/`, `features/`, `components/`, `app/`, `lib/routes.ts`,
  `proxy.ts`, `next.config.ts`); reads `messages/*.json`

### External

- `next-intl` 4 (`defineRouting`, `createNavigation`, `getRequestConfig`, `hasLocale`)

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
