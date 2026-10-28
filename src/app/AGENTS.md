# app

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-28 · **Updated:** 2026-10-28

## Purpose

The Next.js App Router tree. There is deliberately **no `src/app/layout.tsx`**: the app has two
independent root layouts, one per route group, so the public site and the admin panel never share a
shell, fonts or providers and moving between them is a full document load.

| Route group | Root layout | URL space |
|-------------|-------------|-----------|
| `(site)/[locale]/` | `(site)/[locale]/layout.tsx` (renders `<html>`, fonts, providers) | `/`, `/es/...`, `/en/...` (Russian is unprefixed — `localePrefix: 'as-needed'`) |
| `(admin)/admin/` | `(admin)/admin/layout.tsx` (renders `<html lang="ru">`) | `/admin/...` |
| `api/` | none (route handlers) | `/api/...` |

## Key Files

| File | Description |
|------|-------------|
| `globals.css` | Tailwind 4 entry (`@import 'tailwindcss'`) plus the `@theme` design tokens ported verbatim from the approved prototype (`LUGAR.dc.html`): oklch surfaces, an `ink-*` text ramp, `line-*`, green `accent-*`, `dark`/`on-dark-*` band, and `danger/warning/success` surface/line/ink triples, plus `--font-display` (Alegreya) / `--font-body` (Golos Text), editorial easings, the `nav-desktop` custom variant (≥1180px), `container-editorial`/`container-gallery`/`section-y`/`eyebrow`/`sr-only-focusable` utilities and `fade-in`/`fade-in-up` keyframes. Imported by **both** root layouts. |
| `global-error.tsx` | Last-resort boundary for a throwing *root layout*. Client component with its own `<html>`/`<body>`, inline styles and hard-coded Russian — it must not depend on next-intl or Tailwind, which may be what broke. Uses `retry` (Next 16.3), not `reset`. Only `console.error`s; it does not call Sentry. |
| `robots.ts` | `robots.txt`: allow `/`, disallow `/admin`, `/admin/`, `/api/`, `/preview`; sitemap and host from `publicEnv.appUrl`. `next.config.ts` also sends `X-Robots-Tag: noindex` for `/admin/*` and `/api/*`. |
| `sitemap.ts` | Published, indexable (`!noindex`) URLs only, from `listPublishedPaths()` and `getPortfolioIndexSlug()`; each entry carries reciprocal `alternates.languages` (`HREFLANG_TAG`). Returns `[]` on any error instead of 500. Priority: home 1, directions 0.8, projects 0.6. |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `(admin)/admin/` | Back-office: login, invite, password reset, `(panel)` screens, server actions — see `(admin)/admin/AGENTS.md` |
| `(site)/[locale]/` | Public trilingual site, one catch-all page route — see `(site)/[locale]/AGENTS.md` |
| `api/` | Route handlers: auth, health, preview, media, locale switch, WhatsApp webhook, CSV export — see `api/AGENTS.md` |

## For AI Agents

### Working In This Directory

- **Read `node_modules/next/dist/docs/` first** (root `AGENTS.md`). `cacheComponents: true` is on in
  `next.config.ts`, which has consequences visible in this tree: route segment config (`dynamic`,
  `runtime`, `revalidate`) is rejected at build; admin pages opt out of prerendering with
  `export const instant = false`; `generateStaticParams` must never return `[]`.
- **Do not add `src/app/layout.tsx`** or move `<html>` out of the two group layouts; `global-error.tsx`
  and the split root layouts depend on this. A third root layout needs its own `globals.css` import.
- **Do not "tidy" the numbers in `globals.css`.** The ink/on-dark rungs were deliberately darkened/lightened
  from the prototype for WCAG AA contrast (comments give the measured ratios); `accessibility*.spec.ts`
  will fail if they regress. Add new colours as `--color-*` tokens in `@theme`, not as literals.
- `robots.ts` lists `/preview`, but the real entry point is `/api/preview` (already covered by `/api/`).
  The extra entry is harmless but stale.
- Auth for private routes lives in `lib/auth/guards.ts`, never in this tree's layouts alone —
  `proxy.ts` only checks the session cookie and the panel layout's `requireUser()` is a convenience.
- Error boundaries: `(site)/[locale]/error.tsx` (below layout), `global-error.tsx` (layout itself).
  The admin tree has none of its own.

### Testing Requirements

- `tests/e2e/public-site.spec.ts` — `/robots.txt`, `/sitemap.xml`, `/api/health`, 404 page, request-id.
- `tests/e2e/accessibility.spec.ts`, `accessibility-admin.spec.ts` (axe), `performance.spec.ts`
  (script-size budget) — exercise `globals.css` tokens and both layouts.
- Run `npm run build` after touching any route file: prerender and `generateStaticParams` problems
  only surface there.

### Common Patterns

- Server Components by default; pages `await params`/`searchParams` (both are Promises in this Next).
- `metadata` exports with Russian titles in admin; locale-aware `generateMetadata` on the public side.
- Tailwind classes use the token names directly (`text-ink-soft`, `bg-surface-muted`, `border-line`,
  `rounded-[--radius-card]`).

## Dependencies

### Internal

- `@/data/public/*` (sitemap, public pages), `@/i18n/routing`, `@/lib/routes`, `@/env`, and everything
  the subtrees import.

### External

- Next.js 16.3 (App Router, `next/font/google`), Tailwind CSS 4, next-intl.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
