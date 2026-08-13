'use client';

import { domAnimation, LazyMotion, MotionConfig } from 'motion/react';

/**
 * Motion configuration for the whole public site.
 *
 * `LazyMotion` + the `m` component keeps the initial payload at roughly 5 kB
 * instead of the ~34 kB the full `motion` component pulls in — worth it on a
 * marketing site whose value is how fast the photography appears.
 *
 * `reducedMotion="user"` makes every animation honour the OS setting without
 * each component having to remember to check. globals.css carries a CSS-side
 * backstop for anything not driven by Motion.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user" transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
