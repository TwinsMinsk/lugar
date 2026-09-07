'use client';

import { useSyncExternalStore } from 'react';
import Script from 'next/script';

import {
  getConsentServerSnapshot,
  getConsentSnapshot,
  subscribeToConsent,
} from '../consent/consent';

/**
 * Loads GA4 and Meta Pixel — and only them, and only once both the owner has
 * switched analytics on in Settings and the visitor has actually consented.
 *
 * "Consented" means the tag is not in the DOM at all, not "loaded but told not
 * to fire" — the difference matters because a script that is present can
 * still set a cookie or make a request before any consent check in its own
 * code runs. `useSyncExternalStore` is what makes this reactive to a consent
 * change without a reload: `getConsentSnapshot`/`subscribeToConsent` already
 * existed for exactly this (a cookie that can change from this tab's banner,
 * another tab, or the footer's reopen link) but had never been wired into a
 * component before this.
 *
 * GA4 and Meta Pixel are gated on different consent categories on purpose.
 * GA4 is analytics — usage measurement. The Pixel is an advertising and
 * retargeting tool, which is exactly what the consent banner's own
 * "marketing" category describes; folding it under "analytics" would let a
 * visitor who declined marketing still be pixel-tracked for ads.
 *
 * `analytics.enabled` in Settings is the owner's own kill switch on top of
 * both — its help text already promises "tags won't fire without consent
 * regardless", so this component is what keeps that promise true.
 *
 * The two ids arrive as props rather than being read from `publicEnv` here,
 * and that is not a style preference. `@/env` exports `publicEnv` and the
 * server's zod schema from the same module, so importing it from a client
 * component drags zod and every server variable definition into the browser
 * bundle — 280 KB of scripts against a 260 KB budget, caught by
 * `performance.spec.ts` the first time this component existed. The layout
 * already reads `publicEnv` on the server; passing two strings down costs
 * nothing.
 */
export function AnalyticsLoader({
  analyticsEnabled,
  gaId,
  pixelId,
}: {
  analyticsEnabled: boolean;
  gaId: string;
  pixelId: string;
}) {
  const consent = useSyncExternalStore(
    subscribeToConsent,
    getConsentSnapshot,
    getConsentServerSnapshot,
  );

  if (!analyticsEnabled) return null;

  return (
    <>
      {consent?.analytics && gaId ? (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
            strategy="afterInteractive"
          />
          <Script id="ga4-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${gaId}');`}
          </Script>
        </>
      ) : null}

      {consent?.marketing && pixelId ? (
        <Script id="meta-pixel-init" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${pixelId}');
            fbq('track', 'PageView');`}
        </Script>
      ) : null}
    </>
  );
}
