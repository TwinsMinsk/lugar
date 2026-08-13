'use client';

import { useEffect } from 'react';

import { track } from './analytics';

/**
 * Click tracking for WhatsApp and phone links.
 *
 * Uses one delegated listener rather than wrapping every link in a client
 * component. Those links are rendered by Server Components scattered across
 * blocks, the footer and the contact section; wrapping each one would push a
 * client boundary into otherwise-static markup purely to attach a handler.
 *
 * The `placement` recorded is structural (which block or region the link sits
 * in) — never the link text or any surrounding content, which could contain
 * customer-facing copy that is not ours to send to an analytics vendor.
 */
export function AnalyticsBeacon() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const link = target?.closest('a');
      if (!link) return;

      const href = link.getAttribute('href') ?? '';
      if (!href.startsWith('https://wa.me/') && !href.startsWith('tel:')) return;

      const placement = resolvePlacement(link);

      if (href.startsWith('https://wa.me/')) {
        track({ name: 'cta_whatsapp_click', placement });
      } else {
        track({ name: 'phone_click', placement });
      }
    };

    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  return null;
}

/** Structural location only — never link text or nearby copy. */
function resolvePlacement(link: HTMLAnchorElement): string {
  if (link.closest('header')) return 'header';
  if (link.closest('footer')) return 'footer';
  const sectionId = link.closest('section')?.id;
  if (sectionId) return sectionId;
  return 'page';
}
