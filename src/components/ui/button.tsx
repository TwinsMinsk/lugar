import { cn } from '@/lib/utils';

/**
 * Button styling.
 *
 * Exported as a class function rather than only a component, because the same
 * treatment has to sit on a next-intl `<Link>`, a native `<a href="tel:">`, a
 * `<button>` that opens the lead dialog, and an external WhatsApp link. Forcing
 * all of those through one component would mean prop-drilling `as`/`asChild`
 * for no benefit.
 *
 * Every value traces to the prototype. Radius is 2px and stays 2px: the design
 * reads as architectural, not as a rounded-card UI kit.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

const base = [
  'inline-flex items-center justify-center gap-2 whitespace-nowrap',
  'font-medium tracking-[0.01em]',
  'rounded-[--radius-btn]',
  'transition-[background-color,color,border-color,transform,opacity]',
  'duration-[--duration-base] ease-[--ease-out-editorial]',
  // Only transform and opacity are animated — never width, height or margins,
  // which would force layout on every frame.
  'active:scale-[0.985]',
  'disabled:pointer-events-none disabled:opacity-50',
].join(' ');

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover',
  /** For use on a photograph or the dark band. */
  secondary: 'border border-white/50 text-white hover:bg-white/15 hover:border-white/70',
  outline: 'border border-accent text-accent hover:bg-accent hover:text-white',
  ghost: 'text-ink hover:text-accent',
  link: 'text-accent uppercase tracking-[0.16em] hover:text-accent-hover',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'px-5 py-3 text-[13px]',
  md: 'px-6 py-4 text-[14px]',
  lg: 'px-[30px] py-[17px] text-[15px]',
};

const linkSizes: Record<ButtonSize, string> = {
  sm: 'text-[11px]',
  md: 'text-[12px]',
  lg: 'text-[13px]',
};

export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className?: string,
): string {
  if (variant === 'link') {
    return cn(
      'inline-flex items-center gap-1 font-medium transition-colors duration-[--duration-base]',
      variants.link,
      linkSizes[size],
      className,
    );
  }
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return <button className={buttonClasses(variant, size, className)} {...props} />;
}
