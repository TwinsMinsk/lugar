# [locale]

**Parent context:** `../../AGENTS.md`
**Generated:** 2026-10-28 · **Updated:** 2026-10-28

## Purpose

The public trilingual site. One layout, one error boundary, one 404, and a single optional catch-all
page (`[[...slug]]/page.tsx`) that renders every public URL — home, direction pages, portfolio index,
projects, About, Contacts, legal pages — by resolving the slug against `document_locales`. Renaming a
slug in `/admin` therefore needs no route change. Russian is unprefixed (`/raboty`); `/es/...` and
`/en/...` carry a prefix (`localePrefix: 'as-needed'`, `localeDetection: false`).

## Key Files

| File | Description |
|------|-------------|
| `layout.tsx` | The site's **root** layout (renders `<html lang={LOCALE_TAG[locale]}>`). Validates `locale` with `hasLocale` (else `notFound()`), calls `setRequestLocale`, `generateStaticParams` over the three locales, self-hosted fonts via `next/font/google` (Alegreya → `--font-alegreya`, Golos Text → `--font-golos`), `metadataBase` from `publicEnv.appUrl`, viewport `themeColor #f7f6f3`. Wraps children in `NextIntlClientProvider` → `LeadDialogProvider` → `MotionProvider` and mounts `PreviewBanner` and `ConsentGate` inside `<Suspense>` (per-request state in an otherwise prerendered shell), `AttributionBeacon`, `AnalyticsBeacon`, `AnalyticsLoader`, `Header`, `Footer`, `StickyMobileCta`, `LeadDialog` (service options built from the three `getServiceCategories(...)` calls, privacy link from `getDocumentSlug(DOCUMENT_IDS.PRIVACY)`). Imports `../../globals.css`. |
| `error.tsx` | Client error boundary rendered *inside* the layout (header/footer survive). Uses `retry()` (re-fetches the segment), not `reset()`. Strings from the `error` message namespace. |
| `not-found.tsx` | Server Component 404 in the visitor's language (`error.notFoundTitle/Body/Home`), linking home through `@/i18n/navigation`. |
| `[[...slug]]/page.tsx` | Catch-all, see below. |

### `[[...slug]]/page.tsx`

- **`generateStaticParams`**: every published path from `listPublishedPaths()` (projects become
  `[portfolioIndexSlug, slug]`, home is `[]`); on an empty result **or any error** it falls back to the
  home page of each locale, because Cache Components rejects an empty list and Railway builds cannot
  reach the private database. `dynamicParams` stays true, so later-published pages render on demand.
- **`generateMetadata`**: `loadPage(locale, slug)`; unknown page → `noindex`. SEO title/description
  fall back **per field** to Russian (`seo[locale] ?? seo.ru`), then to the `seo.defaultTitle` setting;
  `canonical` never falls back across locales; `alternates.languages` only for locales actually
  published, plus `x-default` → Russian; OG image from the page override or the sitewide setting
  (placeholders skipped); `robots` is `noindex` for draft-mode previews and documents flagged `noindex`.
- **Page**: `loadPage` returns `{ref, meta, blocks, ctx, alternates, portfolioIndexSlug}`. If null, only
  then `resolveRedirect(localePath(...))` — a live document always beats slug history — issuing
  `permanentRedirect` (308) or `redirect` (307), else `notFound()`. JSON-LD: `localBusinessJsonLd` on home
  and Contacts, `breadcrumbJsonLd` on everything but home. Renders `<Blocks blocks ctx>`; for
  `template === 'portfolio_index'` the first block (heading) is followed by `<PortfolioIndex>` (the
  generated project grid), then the remaining blocks.
- The home/contacts/privacy identities are `DOCUMENT_IDS` imported from `@/db/seed/content`.

## For AI Agents

### Working In This Directory

- **Do not add a `page.tsx` for a specific public URL.** Content pages are rows, not routes. A new
  template or block type belongs in `src/content/blocks` and `loadPage`/`Blocks`, not here.
- **Read only through `src/data/public/*`** (`server-only`; the resolvers/listings in `documents.ts`
  are `'use cache'` with tags from `src/data/cache-tags.ts` — `path:`, `doc:`, `revision:`,
  `projects-index:`, `nav:`, `settings`, `redirects` — so admin actions can `updateTag` them). Preview
  resolution (`resolvePreviewTarget`) is a separate uncached path; `previewState()` reads `draftMode()`,
  which is allowed inside a cache scope, unlike `cookies()`/`headers()`.
- **Keep per-request APIs (`cookies()`, `headers()`, `draftMode()`) out of the layout body** or wrap the
  component in `<Suspense>` — otherwise the prerendered shell turns dynamic. `PreviewBanner` (reads
  `draftMode()`) and `ConsentGate` (per-visitor consent) are wrapped for exactly this reason.
- `layout.tsx` imports its own `<html>`; there is no parent layout. `error.tsx` cannot catch layout
  failures — those go to `src/app/global-error.tsx`.
- Locale fallback is Russian (`LOCALE_FALLBACK` in `src/i18n/routing.ts`); the string helper is
  `t(localeMap, locale)` from `@/content/i18n`.
- `error.tsx` still carries a comment saying no error-reporting service is wired up; Sentry exists
  (`lib/report-error.ts`) but this boundary only `console.error`s. Not yet connected.
- Redirect semantics: admin "permanent" maps to 308, temporary to 307 (not 301/302).
- Windows/glob note: the folder name is literally `[[...slug]]`; quote it in shell commands.

### Testing Requirements

- `tests/e2e/public-site.spec.ts` — rendering, metadata/hreflang/canonical, JSON-LD, 404 page content,
  sitemap, redirects.
- `tests/e2e/portfolio.spec.ts` — project pages, portfolio index, preview/draft mode.
- `tests/e2e/navigation.spec.ts`, `redirects.spec.ts`, `settings.spec.ts` — site-visible effects of admin changes.
- `tests/e2e/accessibility.spec.ts` (axe), `performance.spec.ts` (script budget).
- Unit: `structured-data.test.ts` (JSON-LD builders), `content.test.ts`, `messages-parity.test.ts`
  (the three `messages/*.json` stay in sync — `error.*` keys used here).
- Always `npm run build` after changing metadata or static params.

### Common Patterns

- `params` is a `Promise`; always `await` it, validate the locale, `setRequestLocale(locale)` before
  any next-intl call so the page can prerender.
- Localised strings via `t(map, locale)`; UI chrome via `getTranslations('<ns>')` / `useTranslations`.
- Internal links through `Link` from `@/i18n/navigation`; absolute URLs via `absoluteLocaleUrl` /
  `documentPath` / `localePath` from `@/lib/routes`.

## Dependencies

### Internal

- `@/data/public/{documents,page-loader,redirects,settings,media,navigation,portfolio}`,
  `@/content/{blocks/render,i18n}`, `@/features/{analytics,attribution,consent,leads,preview,portfolio}`,
  `@/components/{layout,motion,seo,ui}`, `@/i18n/{routing,navigation}`, `@/lib/routes`, `@/env`,
  `@/db/seed/content`.

### External

- next-intl 4 (`hasLocale`, `NextIntlClientProvider`, `getTranslations`, `setRequestLocale`),
  `next/font/google`, Next.js 16.3 (`draftMode`, `permanentRedirect`).

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
