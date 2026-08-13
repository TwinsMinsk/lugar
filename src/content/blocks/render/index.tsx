import { MediaImage } from '@/components/ui/media-image';
import { Reveal } from '@/components/motion/reveal';
import { Container, Eyebrow, Lead, Section, SectionHeading } from '@/components/ui/typography';
import { t, tRequired } from '@/content/i18n';
import { Link } from '@/i18n/navigation';
import { documentPath, telLink } from '@/lib/routes';
import { cn } from '@/lib/utils';
import type { Cta } from '../primitives';
import type { AnyBlock } from '../union';
import type { RenderContext } from './context';
import { CtaLink } from './cta-link';
import { RichText } from './rich-text';

/**
 * Block list renderer.
 *
 * Each block is rendered independently and wrapped so that one failure cannot
 * take the page down with it. Blocks that failed schema validation upstream are
 * already absent from `blocks`; this is the second line of defence for a block
 * whose renderer throws.
 */
export function Blocks({ blocks, ctx }: { blocks: AnyBlock[]; ctx: RenderContext }) {
  return (
    <>
      {blocks.map((block, index) => (
        <BlockSwitch key={block.id} block={block} ctx={ctx} isFirst={index === 0} />
      ))}
    </>
  );
}

function BlockSwitch({
  block,
  ctx,
  isFirst,
}: {
  block: AnyBlock;
  ctx: RenderContext;
  isFirst: boolean;
}) {
  switch (block.type) {
    case 'hero':
      return <HeroBlock data={block.data} ctx={ctx} anchor={block.anchor} isFirst={isFirst} />;
    case 'rich_text':
      return <RichTextBlock data={block.data} ctx={ctx} anchor={block.anchor} />;
    case 'text_with_media':
      return <TextWithMediaBlock data={block.data} ctx={ctx} anchor={block.anchor} />;
    case 'service_grid':
      return <ServiceGridBlock data={block.data} ctx={ctx} anchor={block.anchor} id={block.id} />;
    case 'portfolio_teaser':
      return <PortfolioTeaserBlock data={block.data} ctx={ctx} anchor={block.anchor} />;
    case 'portfolio_gallery':
      return <PortfolioGalleryBlock data={block.data} ctx={ctx} anchor={block.anchor} />;
    case 'materials_quality':
      return <MaterialsBlock data={block.data} ctx={ctx} anchor={block.anchor} />;
    case 'process_steps':
      return <ProcessStepsBlock data={block.data} ctx={ctx} anchor={block.anchor} id={block.id} />;
    case 'statistics':
      return <StatisticsBlock data={block.data} ctx={ctx} anchor={block.anchor} />;
    case 'founder_profile':
      return <FounderBlock data={block.data} ctx={ctx} anchor={block.anchor} id={block.id} />;
    case 'cta_banner':
      return <CtaBannerBlock data={block.data} ctx={ctx} anchor={block.anchor} id={block.id} />;
    case 'contact_block':
      return <ContactBlock data={block.data} ctx={ctx} anchor={block.anchor} id={block.id} />;
    case 'faq':
      return <FaqBlock data={block.data} ctx={ctx} anchor={block.anchor} />;
    case 'legal_rich_text':
      return <LegalBlock data={block.data} ctx={ctx} anchor={block.anchor} />;
    default:
      // A block type this deploy does not know about (rolled back build, newer
      // content). Silently skipped rather than crashing the page.
      return null;
  }
}

const ASPECT_CLASS: Record<string, string> = {
  '1/1': 'aspect-square',
  '3/2': 'aspect-[3/2]',
  '4/3': 'aspect-[4/3]',
  '3/4': 'aspect-[3/4]',
  '4/5': 'aspect-[4/5]',
  '16/9': 'aspect-video',
  '21/9': 'aspect-[21/9]',
};

function gridStyle(minWidth: number) {
  return { gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}px, 1fr))` };
}

// ---------------------------------------------------------------------------
// hero
// ---------------------------------------------------------------------------
function HeroBlock({
  data,
  ctx,
  anchor,
  isFirst,
}: {
  data: Extract<AnyBlock, { type: 'hero' }>['data'];
  ctx: RenderContext;
  anchor?: string;
  isFirst: boolean;
}) {
  const asset = data.media ? ctx.media.get(data.media.assetId) : undefined;

  if (data.variant === 'text' || !data.media) {
    return (
      <section
        id={anchor}
        className="scroll-mt-[90px] pt-[clamp(48px,6vw,96px)] pb-[clamp(32px,4vw,56px)]"
      >
        <Container>
          <Eyebrow>{t(data.eyebrow, ctx.locale)}</Eyebrow>
          <SectionHeading as="h1" size="page" className="mb-6 max-w-[16ch]">
            {tRequired(data.heading, ctx.locale)}
          </SectionHeading>
          <Lead>{t(data.subheading, ctx.locale)}</Lead>
          {(data.primaryCta || data.secondaryCta) && (
            <div className="mt-8 flex flex-wrap gap-3">
              <CtaLink cta={data.primaryCta} ctx={ctx} size="lg" blockContext="hero" />
              <CtaLink
                cta={data.secondaryCta}
                ctx={ctx}
                size="lg"
                variantOverride="outline"
                blockContext="hero"
              />
            </div>
          )}
        </Container>
      </section>
    );
  }

  return (
    <section
      id={anchor}
      className="relative h-[clamp(520px,86vh,900px)] min-h-[520px] w-full overflow-hidden"
    >
      <MediaImage
        asset={asset}
        reference={data.media}
        locale={ctx.locale}
        aspect="absolute inset-0"
        sizes="100vw"
        // The only image on the site allowed to preload: this is the LCP element.
        priority={isFirst}
        className="absolute inset-0 h-full w-full"
      />
      {data.overlay !== 'none' ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              data.overlay === 'gradient'
                ? 'linear-gradient(75deg, rgba(28,28,26,0.62) 0%, rgba(28,28,26,0.34) 45%, rgba(28,28,26,0.05) 78%)'
                : 'rgba(28,28,26,0.45)',
          }}
        />
      ) : null}

      <div className="pointer-events-none absolute inset-0 flex items-end">
        <div className="mx-auto w-full max-w-[1440px] px-[clamp(18px,5vw,64px)] pb-[clamp(48px,7vw,96px)]">
          {t(data.eyebrow, ctx.locale) ? (
            <p className="mb-[18px] text-[11px] tracking-[0.32em] text-white/70 uppercase">
              {t(data.eyebrow, ctx.locale)}
            </p>
          ) : null}
          <h1 className="font-display max-w-[15ch] text-[clamp(34px,5.6vw,74px)] leading-[1.04] tracking-[-0.01em] text-white">
            {tRequired(data.heading, ctx.locale)}
          </h1>
          {t(data.subheading, ctx.locale) ? (
            <p className="mt-[22px] max-w-[44ch] text-[clamp(15px,1.5vw,19px)] leading-[1.6] text-white/80">
              {t(data.subheading, ctx.locale)}
            </p>
          ) : null}
          <div className="pointer-events-auto mt-[clamp(26px,3.5vw,40px)] flex flex-wrap gap-3">
            <CtaLink cta={data.primaryCta} ctx={ctx} size="lg" blockContext="hero" />
            <CtaLink
              cta={data.secondaryCta}
              ctx={ctx}
              size="lg"
              variantOverride="secondary"
              blockContext="hero"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// rich_text
// ---------------------------------------------------------------------------
function RichTextBlock({
  data,
  ctx,
  anchor,
}: {
  data: Extract<AnyBlock, { type: 'rich_text' }>['data'];
  ctx: RenderContext;
  anchor?: string;
}) {
  return (
    <Section tone={data.tone} id={anchor}>
      <Reveal className={data.width === 'narrow' ? 'max-w-[68ch]' : undefined}>
        <Eyebrow>{t(data.eyebrow, ctx.locale)}</Eyebrow>
        {t(data.heading, ctx.locale) ? (
          <SectionHeading className="mb-6">{t(data.heading, ctx.locale)}</SectionHeading>
        ) : null}
        <RichText doc={t(data.content, ctx.locale)} />
      </Reveal>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// text_with_media
// ---------------------------------------------------------------------------
function TextWithMediaBlock({
  data,
  ctx,
  anchor,
}: {
  data: Extract<AnyBlock, { type: 'text_with_media' }>['data'];
  ctx: RenderContext;
  anchor?: string;
}) {
  const asset = ctx.media.get(data.media.assetId);
  return (
    <Section tone={data.tone} id={anchor}>
      <div className="grid items-center gap-[clamp(32px,5vw,80px)]" style={gridStyle(300)}>
        <Reveal className={data.mediaSide === 'left' ? 'order-2' : undefined}>
          <Eyebrow>{t(data.eyebrow, ctx.locale)}</Eyebrow>
          <SectionHeading className="mb-5">{tRequired(data.heading, ctx.locale)}</SectionHeading>
          {t(data.lead, ctx.locale) ? (
            <Lead className="mb-4">{t(data.lead, ctx.locale)}</Lead>
          ) : null}
          <RichText doc={t(data.body, ctx.locale)} />
          <div className="mt-7">
            <CtaLink cta={data.cta} ctx={ctx} blockContext="text_with_media" />
          </div>
        </Reveal>
        <Reveal className={data.mediaSide === 'left' ? 'order-1' : undefined}>
          <MediaImage
            asset={asset}
            reference={data.media}
            locale={ctx.locale}
            aspect={ASPECT_CLASS[data.aspect] ?? 'aspect-[4/5]'}
            sizes="(max-width: 768px) 100vw, 45vw"
            className="rounded-[--radius-card]"
          />
        </Reveal>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// service_grid
// ---------------------------------------------------------------------------
function ServiceGridBlock({
  data,
  ctx,
  anchor,
  id,
}: {
  data: Extract<AnyBlock, { type: 'service_grid' }>['data'];
  ctx: RenderContext;
  anchor?: string;
  id: string;
}) {
  const items =
    data.source.mode === 'manual'
      ? data.source.items.map((item) => ({
          key: item.id,
          title: tRequired(item.title, ctx.locale),
          description: t(item.description, ctx.locale),
          media: item.media,
          link: item.link,
          serviceSlug: undefined as string | undefined,
        }))
      : ctx.serviceCategories[data.source.direction].map((category) => ({
          key: category.slug,
          title: tRequired(category.label, ctx.locale),
          description: category.note ? t(category.note, ctx.locale) : undefined,
          media: undefined,
          link: undefined,
          serviceSlug: category.slug,
        }));

  const aspect = ASPECT_CLASS[data.aspect] ?? 'aspect-[4/3]';
  const ctaLabel = t(data.itemCtaLabel, ctx.locale);

  return (
    <Section id={anchor}>
      {(t(data.eyebrow, ctx.locale) || t(data.heading, ctx.locale)) && (
        <Reveal className="mb-[clamp(36px,4vw,56px)]">
          <Eyebrow>{t(data.eyebrow, ctx.locale)}</Eyebrow>
          {t(data.heading, ctx.locale) ? (
            <SectionHeading className="max-w-[20ch]">{t(data.heading, ctx.locale)}</SectionHeading>
          ) : null}
        </Reveal>
      )}

      <div className="grid gap-[clamp(14px,1.8vw,26px)]" style={gridStyle(data.minItemWidth)}>
        {items.map((item, index) => {
          const asset = item.media ? ctx.media.get(item.media.assetId) : undefined;

          const inner = (
            <>
              <MediaImage
                asset={asset}
                reference={item.media}
                locale={ctx.locale}
                aspect={aspect}
                sizes={`(max-width: 640px) 100vw, (max-width: 1180px) 50vw, ${Math.round(100 / data.columns)}vw`}
              />
              <div
                className={cn(
                  'flex flex-1 flex-col',
                  data.variant === 'card' ? 'gap-2.5 p-[clamp(20px,2.2vw,30px)]' : 'gap-3 pt-4',
                )}
              >
                <h3 className="font-display text-[clamp(21px,2.2vw,26px)] leading-[1.2]">
                  {item.title}
                </h3>
                {item.description ? (
                  <p className="text-ink-soft text-[14.5px] leading-[1.6]">{item.description}</p>
                ) : null}
                {data.showItemCta && ctaLabel ? (
                  <div className="mt-auto pt-3">
                    <CtaLink
                      cta={{
                        // `ru` is guaranteed here: ctaLabel resolved non-empty
                        // through the fallback chain, which terminates at ru.
                        label: { ru: ctaLabel, ...data.itemCtaLabel },
                        variant: data.variant === 'card' ? 'link' : 'outline',
                        target: { kind: 'form', form: 'price', service: item.serviceSlug },
                      }}
                      ctx={ctx}
                      size="sm"
                      blockContext={`service_grid:${id}`}
                    />
                  </div>
                ) : null}
              </div>
            </>
          );

          return (
            <Reveal
              key={item.key}
              delay={index * 0.04}
              className={cn(
                'flex flex-col overflow-hidden',
                data.variant === 'card' &&
                  'bg-surface border-line-soft hover:border-accent rounded-[--radius-card] border transition-colors duration-[--duration-base]',
              )}
            >
              {item.link ? (
                <CtaWrapper cta={item.link} ctx={ctx}>
                  {inner}
                </CtaWrapper>
              ) : (
                inner
              )}
            </Reveal>
          );
        })}
      </div>
    </Section>
  );
}

/** Wraps a whole card in its link, when the card itself is clickable. */
function CtaWrapper({
  cta,
  ctx,
  children,
}: {
  cta: Cta;
  ctx: RenderContext;
  children: React.ReactNode;
}) {
  if (cta.target.kind === 'document') {
    const target = ctx.documentSlugs.get(cta.target.documentId);
    if (!target) return <>{children}</>;
    return (
      <Link
        href={documentPath(target.kind, target.slug, ctx.portfolioIndexSlug)}
        className="flex flex-1 flex-col"
      >
        {children}
      </Link>
    );
  }
  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// portfolio_teaser
// ---------------------------------------------------------------------------
function PortfolioTeaserBlock({
  data,
  ctx,
  anchor,
}: {
  data: Extract<AnyBlock, { type: 'portfolio_teaser' }>['data'];
  ctx: RenderContext;
  anchor?: string;
}) {
  const source = data.source;
  let cards = ctx.projects;

  if (source.mode === 'manual') {
    cards = source.documentIds
      .map((docId) => ctx.projects.find((card) => card.documentId === docId))
      .filter((card): card is NonNullable<typeof card> => card !== undefined);
  } else if (source.mode === 'featured') {
    cards = ctx.projects.filter((card) => card.isFeatured).slice(0, source.limit);
  } else {
    const categorySlug = source.categorySlug;
    const filtered = categorySlug
      ? ctx.projects.filter((card) => card.categorySlugs.includes(categorySlug))
      : ctx.projects;
    cards = filtered.slice(0, source.limit);
  }

  const linkTarget = data.linkTargetDocumentId
    ? ctx.documentSlugs.get(data.linkTargetDocumentId)
    : null;

  return (
    <Section id={anchor}>
      <div className="mb-[clamp(28px,3.5vw,44px)] flex flex-wrap items-end justify-between gap-5">
        <div>
          <Eyebrow>{t(data.eyebrow, ctx.locale)}</Eyebrow>
          <SectionHeading>{tRequired(data.heading, ctx.locale)}</SectionHeading>
        </div>
        {linkTarget && t(data.linkLabel, ctx.locale) ? (
          <Link
            href={documentPath(linkTarget.kind, linkTarget.slug, ctx.portfolioIndexSlug)}
            className="border-b border-[oklch(0.75_0.006_85)] pb-1.5 text-[13px] tracking-[0.14em] uppercase"
          >
            {t(data.linkLabel, ctx.locale)}
          </Link>
        ) : null}
      </div>

      {cards.length === 0 ? (
        <p className="text-ink-faint text-[15px]">—</p>
      ) : (
        <div className="grid gap-[clamp(10px,1.2vw,18px)]" style={gridStyle(260)}>
          {cards.map((card, index) => (
            <Reveal key={card.documentId} delay={index * 0.04}>
              <ProjectCard card={card} ctx={ctx} aspect={data.aspect} columns={data.columns} />
            </Reveal>
          ))}
        </div>
      )}
    </Section>
  );
}

export function ProjectCard({
  card,
  ctx,
  aspect = '4/5',
  columns = 3,
}: {
  card: { documentId: string; slug: string; title: string; coverAssetId: string | null };
  ctx: RenderContext;
  aspect?: string;
  columns?: number;
}) {
  const asset = card.coverAssetId ? ctx.media.get(card.coverAssetId) : undefined;
  return (
    <Link href={documentPath('project', card.slug, ctx.portfolioIndexSlug)} className="group block">
      <div className="overflow-hidden rounded-[--radius-card]">
        <MediaImage
          asset={asset}
          locale={ctx.locale}
          aspect={ASPECT_CLASS[aspect] ?? 'aspect-[4/5]'}
          sizes={`(max-width: 640px) 100vw, (max-width: 1180px) 50vw, ${Math.round(100 / columns)}vw`}
          imageClassName="transition-transform duration-500 ease-[--ease-out-editorial] motion-safe:group-hover:scale-[1.03]"
        />
      </div>
      {/* The prototype's grid is image-only; a title is added because the brief
          requires crawlable, individually addressable project pages. */}
      <h3 className="font-display mt-3.5 text-[19px] leading-tight">{card.title}</h3>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// portfolio_gallery
// ---------------------------------------------------------------------------
function PortfolioGalleryBlock({
  data,
  ctx,
  anchor,
}: {
  data: Extract<AnyBlock, { type: 'portfolio_gallery' }>['data'];
  ctx: RenderContext;
  anchor?: string;
}) {
  return (
    <Section id={anchor}>
      {t(data.heading, ctx.locale) ? (
        <SectionHeading className="mb-8">{t(data.heading, ctx.locale)}</SectionHeading>
      ) : null}
      <div
        className={cn('grid gap-[clamp(10px,1.2vw,18px)]')}
        style={gridStyle(data.layout === 'full_width' ? 900 : 320)}
      >
        {data.items.map((item, index) => {
          const asset = ctx.media.get(item.media.assetId);
          return (
            <Reveal key={item.id} delay={index * 0.03}>
              <figure>
                <MediaImage
                  asset={asset}
                  reference={item.media}
                  locale={ctx.locale}
                  aspect="aspect-[4/3]"
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="rounded-[--radius-card]"
                />
                {t(item.caption, ctx.locale) ? (
                  <figcaption className="text-ink-faint mt-2.5 text-[13px] leading-snug">
                    {t(item.caption, ctx.locale)}
                  </figcaption>
                ) : null}
              </figure>
            </Reveal>
          );
        })}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// materials_quality
// ---------------------------------------------------------------------------
function MaterialsBlock({
  data,
  ctx,
  anchor,
}: {
  data: Extract<AnyBlock, { type: 'materials_quality' }>['data'];
  ctx: RenderContext;
  anchor?: string;
}) {
  return (
    <Section tone={data.tone} id={anchor}>
      <div className="grid items-center gap-[clamp(32px,5vw,80px)]" style={gridStyle(300)}>
        <Reveal>
          <Eyebrow>{t(data.eyebrow, ctx.locale)}</Eyebrow>
          <SectionHeading className="mb-5">{tRequired(data.heading, ctx.locale)}</SectionHeading>
          <p className="text-ink-muted max-w-[46ch] text-[16px] leading-[1.65]">
            {t(data.text, ctx.locale)}
          </p>
        </Reveal>
        <Reveal>
          <div className="grid gap-3" style={gridStyle(140)}>
            {data.brands.map((brand) => {
              const asset = brand.logo ? ctx.media.get(brand.logo.assetId) : undefined;
              return (
                <div
                  key={brand.id}
                  className="bg-surface border-line-soft flex flex-col items-center gap-3.5 rounded-[--radius-card] border px-4 py-5.5"
                >
                  {asset ? (
                    <div className="relative h-11 w-full">
                      <MediaImage
                        asset={asset}
                        reference={brand.logo}
                        locale={ctx.locale}
                        aspect="h-11 w-full"
                        sizes="140px"
                        decorative
                      />
                    </div>
                  ) : (
                    // No logo file supplied (or no permission to use one) —
                    // a text treatment rather than a scraped trademark.
                    <span className="font-display flex h-11 items-center text-[19px] tracking-[0.12em]">
                      {brand.name}
                    </span>
                  )}
                  <span className="text-ink-faint text-center text-[10px] tracking-[0.2em] uppercase">
                    {tRequired(brand.kind, ctx.locale)}
                  </span>
                </div>
              );
            })}
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// process_steps
// ---------------------------------------------------------------------------
function ProcessStepsBlock({
  data,
  ctx,
  anchor,
  id,
}: {
  data: Extract<AnyBlock, { type: 'process_steps' }>['data'];
  ctx: RenderContext;
  anchor?: string;
  id: string;
}) {
  return (
    <Section tone={data.tone} id={anchor}>
      <Eyebrow>{t(data.eyebrow, ctx.locale)}</Eyebrow>
      <SectionHeading className="mb-[clamp(30px,4vw,48px)]">
        {tRequired(data.heading, ctx.locale)}
      </SectionHeading>

      <ol className="grid gap-[clamp(16px,2vw,28px)]" style={gridStyle(200)}>
        {data.steps.map((step, index) => (
          <Reveal as="li" key={step.id} delay={index * 0.05}>
            <div className="bg-surface border-t-accent h-full rounded-[--radius-card] border-t-2 p-[clamp(22px,2.4vw,32px)]">
              <div className="text-ink-ghost text-[11px] tracking-[0.24em]">
                {String(index + 1).padStart(2, '0')}
              </div>
              <div className="font-display mt-3.5 text-[24px] leading-[1.2]">
                {tRequired(step.name, ctx.locale)}
              </div>
              {t(step.note, ctx.locale) ? (
                <p className="text-ink-soft mt-2.5 text-[14px] leading-[1.6]">
                  {t(step.note, ctx.locale)}
                </p>
              ) : null}
            </div>
          </Reveal>
        ))}
      </ol>

      {data.cta ? (
        <div className="mt-[clamp(32px,4vw,48px)]">
          <CtaLink cta={data.cta} ctx={ctx} size="lg" blockContext={`process_steps:${id}`} />
        </div>
      ) : null}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// statistics
// ---------------------------------------------------------------------------
function StatisticsBlock({
  data,
  ctx,
  anchor,
}: {
  data: Extract<AnyBlock, { type: 'statistics' }>['data'];
  ctx: RenderContext;
  anchor?: string;
}) {
  return (
    <Section id={anchor}>
      {t(data.heading, ctx.locale) ? (
        <SectionHeading className="mb-8">{t(data.heading, ctx.locale)}</SectionHeading>
      ) : null}
      <dl className="border-line grid gap-[18px] border-t pt-7" style={gridStyle(150)}>
        {data.items.map((item) => (
          <div key={item.id}>
            <dt className="sr-only">{tRequired(item.label, ctx.locale)}</dt>
            <dd>
              <span className="font-display text-accent block text-[clamp(30px,3.4vw,42px)] leading-none">
                {tRequired(item.value, ctx.locale)}
              </span>
              <span className="text-ink-soft mt-2 block text-[13.5px] leading-[1.45]">
                {tRequired(item.label, ctx.locale)}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// founder_profile
// ---------------------------------------------------------------------------
function FounderBlock({
  data,
  ctx,
  anchor,
  id,
}: {
  data: Extract<AnyBlock, { type: 'founder_profile' }>['data'];
  ctx: RenderContext;
  anchor?: string;
  id: string;
}) {
  const asset = data.media ? ctx.media.get(data.media.assetId) : undefined;

  return (
    <Section id={anchor ?? 'about'}>
      <div className="grid gap-[clamp(32px,5vw,88px)]" style={gridStyle(300)}>
        <Reveal>
          <Eyebrow>{t(data.eyebrow, ctx.locale)}</Eyebrow>
          <SectionHeading className="mb-6 max-w-[16ch]">
            {tRequired(data.heading, ctx.locale)}
          </SectionHeading>
          {data.paragraphs.map((paragraph, index) => (
            <p
              key={index}
              className="text-ink-muted mb-4 max-w-[52ch] text-[16.5px] leading-[1.68]"
            >
              {tRequired(paragraph, ctx.locale)}
            </p>
          ))}

          {data.stats?.length ? (
            <dl
              className="border-line mt-[clamp(32px,4vw,52px)] grid gap-[18px] border-t pt-7"
              style={gridStyle(150)}
            >
              {data.stats.map((stat) => (
                <div key={stat.id}>
                  <dt className="sr-only">{tRequired(stat.label, ctx.locale)}</dt>
                  <dd>
                    <span className="font-display text-accent block text-[clamp(30px,3.4vw,42px)] leading-none">
                      {tRequired(stat.value, ctx.locale)}
                    </span>
                    <span className="text-ink-soft mt-2 block text-[13.5px] leading-[1.45]">
                      {tRequired(stat.label, ctx.locale)}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}

          {data.cta ? (
            <div className="mt-8">
              <CtaLink cta={data.cta} ctx={ctx} blockContext={`founder:${id}`} />
            </div>
          ) : null}
        </Reveal>

        <Reveal className="flex flex-col gap-4.5">
          <MediaImage
            asset={asset}
            reference={data.media}
            locale={ctx.locale}
            aspect="aspect-[4/5]"
            sizes="(max-width: 768px) 100vw, 40vw"
            className="max-h-[620px] rounded-[--radius-card]"
          />
          <div>
            <div className="font-display text-[24px] leading-[1.2]">{data.name}</div>
            <div className="text-ink-soft mt-1.5 max-w-[34ch] text-[14px] leading-[1.5]">
              {tRequired(data.role, ctx.locale)}
            </div>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// cta_banner
// ---------------------------------------------------------------------------
function CtaBannerBlock({
  data,
  ctx,
  anchor,
  id,
}: {
  data: Extract<AnyBlock, { type: 'cta_banner' }>['data'];
  ctx: RenderContext;
  anchor?: string;
  id: string;
}) {
  return (
    <Section tone={data.tone} id={anchor}>
      <Reveal className="max-w-[52ch]">
        <Eyebrow>{t(data.eyebrow, ctx.locale)}</Eyebrow>
        <SectionHeading className="mb-4">{tRequired(data.heading, ctx.locale)}</SectionHeading>
        {t(data.text, ctx.locale) ? <Lead className="mb-7">{t(data.text, ctx.locale)}</Lead> : null}
        <div className="flex flex-wrap gap-3">
          <CtaLink cta={data.primaryCta} ctx={ctx} size="lg" blockContext={`cta_banner:${id}`} />
          <CtaLink
            cta={data.secondaryCta}
            ctx={ctx}
            size="lg"
            variantOverride="outline"
            blockContext={`cta_banner:${id}`}
          />
        </div>
      </Reveal>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// contact_block
// ---------------------------------------------------------------------------
function ContactBlock({
  data,
  ctx,
  anchor,
  id,
}: {
  data: Extract<AnyBlock, { type: 'contact_block' }>['data'];
  ctx: RenderContext;
  anchor?: string;
  id: string;
}) {
  const { contact, social } = ctx.settings;
  const socialLinks = [
    social.instagram ? { label: 'Instagram', href: social.instagram } : null,
    social.facebook ? { label: 'Facebook', href: social.facebook } : null,
  ].filter((entry): entry is { label: string; href: string } => entry !== null);

  return (
    <Section tone={data.tone} id={anchor ?? 'contacts'}>
      <div className="grid gap-[clamp(32px,5vw,72px)]" style={gridStyle(300)}>
        <div>
          {t(data.eyebrow, ctx.locale) ? (
            <p className="text-accent-on-dark mb-4 text-[11px] tracking-[0.28em] uppercase">
              {t(data.eyebrow, ctx.locale)}
            </p>
          ) : null}
          <SectionHeading className="mb-5 max-w-[16ch]">
            {tRequired(data.heading, ctx.locale)}
          </SectionHeading>
          {t(data.lead, ctx.locale) ? (
            <p className="text-on-dark-soft mb-8 max-w-[44ch] text-[16px] leading-[1.65]">
              {t(data.lead, ctx.locale)}
            </p>
          ) : null}
          <CtaLink cta={data.primaryCta} ctx={ctx} size="lg" blockContext={`contact:${id}`} />
        </div>

        <div className="flex flex-col gap-6.5">
          {data.showPhone && contact.phone && contact.phoneE164 ? (
            <div>
              <div className="text-on-dark-faint mb-2 text-[11px] tracking-[0.22em] uppercase">
                {ctx.locale === 'ru'
                  ? 'Телефон / WhatsApp'
                  : ctx.locale === 'es'
                    ? 'Teléfono / WhatsApp'
                    : 'Phone / WhatsApp'}
              </div>
              <a
                href={telLink(contact.phoneE164)}
                className="font-display hover:text-accent-on-dark text-[clamp(26px,3vw,36px)] leading-[1.1] transition-colors"
              >
                {contact.phone}
              </a>
            </div>
          ) : null}

          {/* Rendered only when the owner has supplied real URLs. The prototype
              shipped bare instagram.com/facebook.com placeholders — exactly the
              kind of value that reaches production unnoticed. */}
          {data.showSocial && socialLinks.length > 0 ? (
            <div>
              <div className="text-on-dark-faint mb-2.5 text-[11px] tracking-[0.22em] uppercase">
                {ctx.locale === 'ru' ? 'Соцсети' : ctx.locale === 'es' ? 'Redes' : 'Social'}
              </div>
              <div className="flex flex-wrap gap-2.5">
                {socialLinks.map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="border-dark-line hover:border-accent-on-dark hover:text-accent-on-dark rounded-[--radius-btn] border px-5 py-3 text-[14px] transition-colors"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            </div>
          ) : null}

          {data.showServiceArea && contact.serviceArea ? (
            <div>
              <div className="text-on-dark-faint mb-2 text-[11px] tracking-[0.22em] uppercase">
                {ctx.locale === 'ru'
                  ? 'География работ'
                  : ctx.locale === 'es'
                    ? 'Zona de trabajo'
                    : 'Where we work'}
              </div>
              <div className="text-on-dark-muted text-[16px] leading-[1.6]">
                {t(contact.serviceArea, ctx.locale)}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// faq
// ---------------------------------------------------------------------------
function FaqBlock({
  data,
  ctx,
  anchor,
}: {
  data: Extract<AnyBlock, { type: 'faq' }>['data'];
  ctx: RenderContext;
  anchor?: string;
}) {
  return (
    <Section id={anchor}>
      <Eyebrow>{t(data.eyebrow, ctx.locale)}</Eyebrow>
      <SectionHeading className="mb-8">{tRequired(data.heading, ctx.locale)}</SectionHeading>
      <div className="max-w-[72ch]">
        {data.items.map((item) => (
          // <details> gives keyboard operability, correct semantics and works
          // with JavaScript disabled — no accordion state to reimplement.
          <details key={item.id} className="border-line group border-b py-5">
            <summary className="font-display flex cursor-pointer list-none items-center justify-between gap-4 text-[19px] leading-snug">
              {tRequired(item.question, ctx.locale)}
              <span
                aria-hidden
                className="text-accent flex-none text-2xl leading-none transition-transform duration-[--duration-base] group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <div className="pt-4">
              <RichText doc={t(item.answer, ctx.locale)} />
            </div>
          </details>
        ))}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// legal_rich_text
// ---------------------------------------------------------------------------
function LegalBlock({
  data,
  ctx,
  anchor,
}: {
  data: Extract<AnyBlock, { type: 'legal_rich_text' }>['data'];
  ctx: RenderContext;
  anchor?: string;
}) {
  const notice: Record<string, string> = {
    ru: 'Это шаблон. Текст должен быть проверен юристом до публикации.',
    es: 'Esto es una plantilla. El texto debe ser revisado por un abogado antes de publicarse.',
    en: 'This is a template. The text must be reviewed by a lawyer before publication.',
  };

  return (
    <Section id={anchor}>
      <div className="max-w-[72ch]">
        <SectionHeading as="h1" size="page" className="mb-6">
          {tRequired(data.heading, ctx.locale)}
        </SectionHeading>

        {data.showTemplateNotice ? (
          <p className="border-accent bg-surface-muted text-ink-muted mb-8 border-l-2 px-4 py-3 text-[14px] leading-relaxed">
            {notice[ctx.locale] ?? notice.ru}
          </p>
        ) : null}

        {data.lastUpdated ? (
          <p className="text-ink-faint mb-6 text-[13px]">
            {ctx.locale === 'ru' ? 'Обновлено' : ctx.locale === 'es' ? 'Actualizado' : 'Updated'}:{' '}
            {data.lastUpdated}
          </p>
        ) : null}

        <RichText doc={t(data.content, ctx.locale)} />
      </div>
    </Section>
  );
}
