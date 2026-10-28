# blocks

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-28 · **Updated:** 2026-10-28

## Purpose

The 14 CMS block types. A page revision stores a JSONB array of blocks; this directory defines their
Zod schemas, the registry that says where each may be used, the starting data for the admin "add
block" palette, the walker that records which media a revision uses, and (in `render/`) the Server
Components that turn a validated block list into the public page. Editors pick variants; they cannot
author a new layout.

## Key Files

| File | Description |
|------|-------------|
| `primitives.ts` | Shared field schemas: `linkTarget` (document / external / anchor / form / whatsapp), `cta`, `mediaRef` (tagged `.meta({ media: true })`), `aspectRatio`, `sectionTone`, `columnCount`, `itemId`. |
| `schemas.ts` | One exported Zod schema + `*Data` type per block: `heroSchema`, `richTextSchema`, `textWithMediaSchema`, `serviceGridSchema`, `portfolioTeaserSchema`, `portfolioGallerySchema`, `materialsQualitySchema`, `processStepsSchema`, `statisticsSchema`, `founderProfileSchema`, `ctaBannerSchema`, `contactBlockSchema`, `faqSchema`, `legalRichTextSchema`. |
| `union.ts` | `envelope()` (`id` uuid, `type`, `hidden`, optional `anchor`, `data`), `anyBlockSchema` (discriminated union on `type`), `blocksSchema` (strict array, used on every write), `AnyBlock` / `BlockType` / `BlockData<T>`, `BLOCK_TYPES`, `TEMPLATES` / `TemplateId`. |
| `registry.ts` | `BLOCK_REGISTRY` (typed `{ [K in BlockType]: BlockDefinition<K> }`: trilingual `label`/`description`, `schema`, `allowedOn` templates or `'*'`, `maxPerPage`, `structural`), `blocksAllowedOn(template)`, `isKnownBlockType()`. Data only, no React. |
| `defaults.ts` | `defaultBlockData(type, assetId)` (hand-written, exhaustive switch), `createBlock()` (parses the default through its own schema, throws if it fails), `blockNeedsMedia()` / `BLOCK_TYPES_NEEDING_MEDIA`. |
| `media-usage.ts` | `collectMediaUsage(blocks)` (generic walk for any object with a UUID `assetId`, records `blocks[i].path` per block id) and `referencedAssetIds()`. |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `render/` | Public renderer (described below; no separate AGENTS.md) |

### render/

| File | Description |
|------|-------------|
| `index.tsx` | Exports `Blocks({ blocks, ctx })` and `ProjectCard` (also used by `features/portfolio/portfolio-index.tsx`). `BlockSwitch` switches on `block.type` to one in-file Server Component per block; unknown types return `null`. `PortfolioTeaserBlock` is async (`getTranslations('portfolio')` only when it has no cards). |
| `context.ts` | `RenderContext`: `locale`, `media` Map, `settings`, `portfolioIndexSlug`, `documentSlugs`, `projects`, `serviceCategories`, `mode`. Blocks never query the database; `data/public/page-loader.ts` (`loadPage`) builds this in batched queries. `mode` is always set to `'public'` and nothing branches on it today. |
| `cta-link.tsx` | `CtaLink` renders any `Cta`: `document` → locale-aware `Link` (renders nothing if the page is unpublished in this locale), `form` → `LeadTrigger` button, `whatsapp` → `wa.me` link (nothing without a configured number), `external` / `anchor` → `<a>`. |
| `rich-text.tsx` | `RichText` walks the stored TipTap JSON into React elements (no `dangerouslySetInnerHTML`); unknown nodes dropped, headings clamp to h2/h3/h4, link marks limited to `http(s)`, `mailto`, `tel`, `/`. `richTextToPlainText()` feeds FAQ JSON-LD. |

## For AI Agents

### Working In This Directory

**Adding a block type — everything the code actually requires, in order:**

1. **Schema** (`schemas.ts`): export `fooSchema` and `FooData`. Use `localizedText(max)` /
   `localizedTextOptional(max)` for every string a visitor reads, `mediaRef` for images, `cta` for
   buttons, `itemId` for list items, and give every array `.min()/.max()`. Optional wrappers and
   `.default()` are fine.
2. **Union** (`union.ts`): import it, add `envelope('foo', fooSchema)` to `anyBlockSchema`, and add
   `'foo'` to `BLOCK_TYPES` (`satisfies readonly BlockType[]` does **not** force completeness).
   `BlockType` / `BlockData<'foo'>` follow automatically. A new page template also goes in `TEMPLATES`.
3. **Registry** (`registry.ts`): add the `BLOCK_REGISTRY.foo` entry — `label` and `description` in
   ru/es/en, `schema` cast as the existing entries do, `allowedOn`, optional `maxPerPage` /
   `structural`. TypeScript errors until it exists because the registry type is mapped over `BlockType`.
   Whatever the seed or `createProject` puts on a template must be allowed there (see test below).
4. **Default data** (`defaults.ts`): add a `case` to `defaultBlockData`. It must satisfy the schema on
   its own (not even `{}` parses; Russian strings must be non-empty, array floors apply). If the block
   cannot exist without a picture, add it to `BLOCK_TYPES_NEEDING_MEDIA` — the palette then hides it
   while the media library is empty. `saveDraft` rejects the whole page if any block is invalid.
5. **Renderer** (`render/index.tsx`): add a `case` in `BlockSwitch` and a component taking
   `{ data, ctx, anchor }` (plus `id` if CTA `blockContext` needs it). Read text only via
   `t` / `tRequired`; images via `ctx.media.get(assetId)` + `MediaImage`; buttons via `CtaLink`;
   wrap with `Section` / `Reveal`. **The `default: return null` arm means a forgotten case renders
   nothing and TypeScript will not complain.**
6. **Extra data?** If the block needs something not already in `RenderContext` (new query), add the
   field to `render/context.ts` and fetch it in `src/data/public/page-loader.ts`, keyed off the block
   list (see `needsProjects`, `directions`). Do not query from inside a block component.
7. **Admin editor** — usually nothing, with limits. `features/admin/block-editor.tsx` is generic:
   `collectLocalizedFields` makes every `{ru,es,en}` string leaf editable, and `collectMediaSlots`
   makes every `mediaRef` slot a picker. It does **not** edit rich text, enums, booleans, numbers,
   or add/remove list items, and `collectMediaSlots` does not descend into unions (the `manual` arm
   of `service_grid.source` gets no picker). A block whose content lives in such fields needs editor
   work in `block-editor.tsx` (the stale comment in `registry.ts` mentioning an `./editor` folder
   refers to nothing that exists).
8. **Media usage** — nothing to write. `collectMediaUsage` finds any object with a UUID `assetId`,
   so never use `assetId` as a key for anything that is not a `mediaRef`. `saveDraft`
   (`app/(admin)/admin/_actions/content.ts`) writes the `media_usage` rows in the same transaction.
9. **Document links** — `page-loader.ts` `collectLinkedDocumentIds` only recognises
   `{ kind: 'document', documentId }` and a `linkTargetDocumentId` key. Links under any other key
   will not appear in `ctx.documentSlugs`. Use `cta` / `linkTarget`.
10. **Tests** (below), and the seed (`src/db/seed/content.ts` `PAGE_SEEDS`) if the block ships on a
    default page.

Other traps:

- `hidden` blocks and blocks failing `anyBlockSchema` are dropped in `data/public/documents.ts`
  `getRevision()` before rendering, so the renderer never sees them.
- Loosening a schema is safe for stored content; tightening one silently drops existing blocks from
  the public page (counted in `invalidCount`) — migrate stored JSONB first.
- `render/index.tsx` has no per-block error boundary; a throwing renderer falls to the route's
  `error.tsx`.
- `contact_block` and `FounderBlock` set default anchors (`contacts`, `about`); the contact labels
  are hard-coded per locale in `ContactBlock`, not in `messages/*.json`.

### Testing Requirements

- `tests/unit/content.test.ts` — **hard-codes `BLOCK_TYPES` length 14**; update it when adding a type.
  Also covers registry presence, `blocksAllowedOn`, invalid/unknown block rejection, media-usage paths.
- `tests/unit/block-defaults.test.ts` — default data satisfies its schema, `blockNeedsMedia` matches
  reality, every block `PAGE_SEEDS` places on a template is allowed on it, new-project starter blocks
  are allowed on `project`.
- `tests/unit/media-fields.test.ts` — `collectMediaSlots` on `materials_quality` / `portfolio_gallery`.
- `tests/unit/rich-text-plain.test.ts`, `tests/unit/legal-texts.test.ts` — rich-text rendering rules.
- E2E: `tests/e2e/admin.spec.ts`, `block-media.spec.ts`, `portfolio.spec.ts` (add/publish/remove a
  block), `public-site.spec.ts`, `accessibility.spec.ts` (axe over rendered pages).

### Common Patterns

- Each renderer is a plain function component in `render/index.tsx` typed with
  `Extract<AnyBlock, { type: '…' }>['data']`.
- Optional text is rendered conditionally (`t(...) ? … : null`); required text uses `tRequired`.
- Variants map to the approved prototype's looks (`ASPECT_CLASS`, `gridStyle(minWidth)`,
  `sectionTone`), not free-form styling.

## Dependencies

### Internal

- `../i18n` (localised builders, `t`, `tRequired`, rich-text types), `@/i18n/{routing,navigation}`
- `@/components/ui/{typography,media-image,button}`, `@/components/motion/reveal`,
  `@/components/seo/json-ld`, `@/features/leads/lead-trigger`
- `@/lib/routes` (`documentPath`, `telLink`, `whatsappLink`), `@/lib/utils`
- `@/data/public/{media,portfolio,settings}` (types for `RenderContext`)
- Consumers: `src/data/public/{documents,page-loader}.ts`, `src/data/admin/documents.ts`,
  `app/(admin)/admin/_actions/{content,portfolio}.ts`, `features/admin/block-editor.tsx`,
  `src/db/seed/*`, `scripts/apply-legal-texts.ts`, the catch-all page route

### External

- `zod` 4, `next-intl` (`getTranslations` in the teaser), `react` 19

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
