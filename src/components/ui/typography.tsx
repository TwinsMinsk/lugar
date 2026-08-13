import { cn } from '@/lib/utils';

/**
 * Typographic and layout primitives lifted from the prototype.
 *
 * The clamp() values are the design contract — they are what makes the page
 * read as an interior magazine rather than a template. Do not replace them with
 * Tailwind's discrete text-* steps.
 */

export function Container({
  wide = false,
  className,
  children,
}: {
  /** The portfolio index runs at 1600px; everything else at 1440px. */
  wide?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(wide ? 'container-gallery' : 'container-editorial', className)}>
      {children}
    </div>
  );
}

export function Eyebrow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  if (!children) return null;
  return <p className={cn('eyebrow mb-4', className)}>{children}</p>;
}

export function SectionHeading({
  as: Tag = 'h2',
  size = 'section',
  className,
  children,
}: {
  as?: 'h1' | 'h2' | 'h3';
  size?: 'page' | 'section' | 'sub';
  className?: string;
  children: React.ReactNode;
}) {
  const sizes = {
    page: 'text-[clamp(34px,5.4vw,72px)] leading-[1.05] tracking-[-0.01em]',
    section: 'text-[clamp(28px,4vw,50px)] leading-[1.1]',
    sub: 'text-[clamp(21px,2.2vw,27px)] leading-[1.2]',
  } as const;

  return (
    <Tag className={cn('font-display font-normal text-balance', sizes[size], className)}>
      {children}
    </Tag>
  );
}

export function Lead({ children, className }: { children: React.ReactNode; className?: string }) {
  if (!children) return null;
  return (
    <p
      className={cn(
        'text-ink-muted max-w-[56ch] text-[clamp(16px,1.6vw,19px)] leading-[1.65]',
        className,
      )}
    >
      {children}
    </p>
  );
}

/**
 * Section wrapper handling the vertical rhythm and the alternating bands.
 * `dark` is the contacts/footer treatment.
 */
export function Section({
  tone = 'default',
  wide = false,
  id,
  className,
  innerClassName,
  children,
}: {
  tone?: 'default' | 'muted' | 'dark';
  wide?: boolean;
  id?: string;
  className?: string;
  innerClassName?: string;
  children: React.ReactNode;
}) {
  const tones = {
    default: '',
    muted: 'bg-surface-muted',
    dark: 'bg-dark text-on-dark',
  } as const;

  return (
    <section id={id} className={cn('section-y scroll-mt-[90px]', tones[tone], className)}>
      <Container wide={wide} className={innerClassName}>
        {children}
      </Container>
    </section>
  );
}
