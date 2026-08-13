import { buttonClasses, type ButtonSize, type ButtonVariant } from '@/components/ui/button';
import type { Cta } from '@/content/blocks/primitives';
import { t, type Locale } from '@/content/i18n';
import { LeadTrigger } from '@/features/leads/lead-trigger';
import { Link } from '@/i18n/navigation';
import { documentPath, whatsappLink } from '@/lib/routes';
import type { RenderContext } from './context';

/**
 * Renders a CTA for any of the five target kinds.
 *
 * Centralised so no block has to know how a document id becomes a URL, or that
 * a `form` target must render a real `<button>` (it opens a dialog) while a
 * `document` target must render a locale-aware `<Link>`.
 *
 * A `document` target whose page is not published in this locale renders
 * nothing at all rather than a link into a 404.
 */
export function CtaLink({
  cta,
  ctx,
  size = 'md',
  variantOverride,
  blockContext,
  className,
}: {
  cta: Cta | undefined;
  ctx: RenderContext;
  size?: ButtonSize;
  variantOverride?: ButtonVariant;
  blockContext?: string;
  className?: string;
}) {
  if (!cta) return null;

  const label = t(cta.label, ctx.locale);
  if (!label) return null;

  const variant = variantOverride ?? cta.variant;
  const classes = buttonClasses(variant, size, className);

  switch (cta.target.kind) {
    case 'document': {
      const target = ctx.documentSlugs.get(cta.target.documentId);
      if (!target) return null;
      return (
        <Link
          href={documentPath(target.kind, target.slug, ctx.portfolioIndexSlug)}
          className={classes}
        >
          {label}
        </Link>
      );
    }

    case 'external':
      return (
        <a href={cta.target.url} target="_blank" rel="noopener noreferrer" className={classes}>
          {label}
        </a>
      );

    case 'anchor':
      return (
        <a href={`#${cta.target.hash}`} className={classes}>
          {label}
        </a>
      );

    case 'form':
      return (
        <LeadTrigger
          form={cta.target.form}
          service={cta.target.service}
          blockContext={blockContext}
          className={classes}
        >
          {label}
        </LeadTrigger>
      );

    case 'whatsapp': {
      const phone = ctx.settings.contact.whatsappNumber;
      if (!phone) return null;
      return (
        <a
          href={whatsappLink(phone, buildWhatsappText(ctx.locale, cta.target.context))}
          target="_blank"
          rel="noopener noreferrer"
          className={classes}
        >
          {label}
        </a>
      );
    }

    default:
      return null;
  }
}

function buildWhatsappText(locale: Locale, context?: string): string {
  const greetings: Record<Locale, string> = {
    ru: 'Здравствуйте! Хочу получить расчёт',
    es: '¡Hola! Quiero pedir un presupuesto',
    en: 'Hello! I would like to get a quote',
  };
  return context ? `${greetings[locale]}: ${context}.` : `${greetings[locale]}.`;
}
