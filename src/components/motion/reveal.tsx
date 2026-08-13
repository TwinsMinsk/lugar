'use client';

import { m, useReducedMotion } from 'motion/react';

/**
 * The site's one reveal primitive.
 *
 * Editorial, not demonstrative: elements fade and rise a few pixels once, when
 * they first enter the viewport, and then stay put. No replay on scroll-back,
 * no direction changes, no parallax.
 *
 * Only `opacity` and `transform` are animated. Nothing here animates width,
 * height, top/left or margins, which would force layout on every frame and show
 * up directly as poor INP.
 *
 * Content is never hidden behind motion: with reduced motion requested, or with
 * JavaScript unavailable, the children render at their final state. A visitor
 * must never be unable to read the page because an animation did not run.
 */
export function Reveal({
  children,
  delay = 0,
  distance = 16,
  className,
  as: Tag = 'div',
}: {
  children: React.ReactNode;
  delay?: number;
  distance?: number;
  className?: string;
  as?: 'div' | 'section' | 'li' | 'article';
}) {
  const reduced = useReducedMotion();
  const MotionTag = m[Tag];

  if (reduced) {
    return <Tag className={className}>{children}</Tag>;
  }

  return (
    <MotionTag
      className={className}
      initial={{ opacity: 0, y: distance }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -12% 0px' }}
      transition={{ duration: 0.62, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </MotionTag>
  );
}

/**
 * Staggered variant for the hero, which is the only place allowed a slower,
 * sequenced entrance. Uses `animate` rather than `whileInView` because the hero
 * is above the fold by definition.
 */
export function HeroReveal({
  children,
  index = 0,
  className,
}: {
  children: React.ReactNode;
  index?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();

  if (reduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.62, delay: 0.06 * index, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </m.div>
  );
}
