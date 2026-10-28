# components

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-28 · **Updated:** 2026-10-28

## Purpose

Presentational building blocks shared by the public site and (for `ui/`) the admin panel: site
chrome (header, footer, mobile menu, language switcher), the single reveal/motion primitive, JSON-LD
output and builders, and the design-system primitives (buttons, typography, dialogs, the one image
component). Feature-specific UI lives in `../features`; CMS block renderers live in
`../content/blocks/render`.

## Key Files

### layout/ (public site chrome)

| File | Description |
|------|-------------|
| `header.tsx` | Async Server Component `Header({ locale })`: loads `getNavigation('header')`, portfolio index slug and `brandLogo()`; desktop nav shows at the custom `nav-desktop` breakpoint (1180px, not 1024). |
| `footer.tsx` | Async `Footer({ locale })`: `footer_legal` nav, company line from settings, copyright year via a `'use cache'` + `cacheLife('days')` helper (reading `new Date()` directly breaks prerender). The "Cookie preferences" button carries `data-consent-open`; it is wired by delegation inside `ConsentBanner`. |
| `logo.tsx` | `Logo` (text wordmark, or plain `<img>` of the uploaded logo) and the `BrandLogo` type. |
| `brand-logo.ts` | `brandLogo()`: one shared read of `brand.logo` setting; `null` for empty or placeholder asset. Header, footer and mobile menu all use it so they agree. |
| `mobile-menu.tsx` | Client. Focus trap, Escape, scroll lock; panel is rendered through a portal into `document.body` (a `backdrop-filter` on the header would otherwise become the containing block for `fixed inset-0`). |
| `language-switcher.tsx` | Client. Links to `/api/locale/{locale}?from=<pathname>` so diverged per-locale slugs resolve server-side; not a prefix swap. |
| `sticky-mobile-cta.tsx` | Client. Fixed bottom CTA on mobile; hidden while the lead dialog is open; has a same-height in-flow spacer. |

### motion/

| File | Description |
|------|-------------|
| `motion-provider.tsx` | Client. `LazyMotion` (`domAnimation`, `strict`) + `MotionConfig reducedMotion="user"`. Mounted once in `app/(site)/[locale]/layout.tsx`. |
| `reveal.tsx` | Client. `Reveal` (fade + rise once on entering the viewport; `as` limited to div/section/li/article) and `HeroReveal`. Both render plain markup under reduced motion. Uses `m.*`, so it requires `MotionProvider` above it. |

### seo/

| File | Description |
|------|-------------|
| `json-ld.tsx` | `JsonLd({ data })`: the only sanctioned `dangerouslySetInnerHTML`; escapes every `<` in the serialised JSON to its Unicode-escape form so a value cannot close the script tag. |
| `structured-data.ts` | Pure builders `localBusinessJsonLd(settings, locale, appUrl)` and `breadcrumbJsonLd(homeUrl, pageUrl, pageName)`. Kept out of `page.tsx` because route files may not export extra names. Blank settings are omitted, never faked. |

### ui/

| File | Description |
|------|-------------|
| `button.tsx` | `buttonClasses(variant, size, className)` (usable on `Link`, `<a>`, `<button>`) and `Button`. Variants `primary \| secondary \| outline \| ghost \| link`; sizes `sm \| md \| lg`. |
| `typography.tsx` | `Container`, `Eyebrow`, `SectionHeading`, `Lead`, `Section` (tones `default \| muted \| dark`). The `clamp()` sizes are the design contract. |
| `dialog.tsx` | Client. `Modal` (focus trap, Escape, backdrop close), `ConfirmButton` (Cancel gets initial focus; `tone: 'danger' \| 'neutral'`), `InlineConfirm`. Used by the admin editors and media picker. |
| `media-image.tsx` | Server. `MediaImage` (always inside an aspect-ratio frame, focal point via `object-position`, `fit: cover \| contain`, loud magenta placeholder for missing/placeholder assets) and `mediaUrl(asset)` (CDN base or `/api/media/<storageKey>`). |

## For AI Agents

### Working In This Directory

- **Default to Server Components.** Only `mobile-menu`, `language-switcher`, `sticky-mobile-cta`,
  `motion/*` and `ui/dialog` are `'use client'`. Do not import `@/env` from a client file: it exports
  the server Zod schema too and bloats the browser bundle (the e2e performance budget catches it) —
  pass values down as props, as `AnalyticsLoader` does.
- Client components cannot call `brandLogo()` / `getNavigation()`; resolve in the parent server
  component and pass plain props (`Header` → `MobileMenu`).
- Use `Link`, `usePathname`, `redirect` from `@/i18n/navigation`, not `next/link`. The language
  switcher is the deliberate exception (`next/navigation`'s `usePathname` + a plain `<a>`).
- Images on the public site go through `MediaImage` only; the hero is the only `priority` image.
  Logos use `fit="contain"` or the plain `Logo` `<img>`, never a cropped `cover`.
- **Motion budget.** Animate only `opacity`/`transform`, use `m` (not `motion`) components, and keep
  content visible without JS / with reduced motion.
- `dialog.tsx` carries hard-coded Russian ("Отмена") because it serves the Russian-only admin panel;
  do not reuse `ConfirmButton` on the public site without adding a label prop.
- Preserve the tokens/classes (`--radius-btn`, `container-editorial`, `section-y`, etc.); they come
  from `src/app/globals.css`, not Tailwind defaults.
- A mobile-menu or dialog change must keep the focus-trap / focus-return behaviour (`Modal`,
  `MobileMenu`, `LeadDialog` each implement it; `public-site.spec.ts` and `accessibility-admin.spec.ts`
  assert it for the lead dialog and confirmations).

### Testing Requirements

- `tests/unit/structured-data.test.ts` — `localBusinessJsonLd` / `breadcrumbJsonLd`.
- `tests/e2e/accessibility.spec.ts` (axe over public pages, tab order), `accessibility-admin.spec.ts`
  (confirmation traps and returns focus), `public-site.spec.ts` (mobile menu panel covers viewport,
  skip link, hreflang, language switch), `performance.spec.ts` (JS budget, no cross-origin critical
  path), `settings.spec.ts` (uploaded logo replaces the wordmark).

### Common Patterns

- `cn()` from `@/lib/utils` for class composition; arbitrary-value Tailwind with `clamp()`.
- Components take `locale: Locale` as a prop and resolve text with `t()` from `@/content/i18n`, UI
  chrome strings with `getTranslations` / `useTranslations` (namespaces in `messages/`).

## Dependencies

### Internal

- `@/content/i18n`, `@/content/blocks/primitives` (type), `@/data/public/{navigation,documents,settings,media}`
- `@/features/leads/{lead-trigger,lead-dialog-context}` (header CTA, mobile menu, sticky CTA)
- `@/i18n/{navigation,routing}`, `@/lib/{routes,utils}`, `@/env` (`publicEnv.mediaBaseUrl`, server-side only)
- Consumers: `app/(site)/[locale]/layout.tsx` and the catch-all page, `content/blocks/render`,
  `features/**`, admin screens (`ui/dialog`, `ui/button`)

### External

- `next` (`next/image`, `next/cache`), `next-intl`, `motion` (`motion/react`), `react-dom` (portal)

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
