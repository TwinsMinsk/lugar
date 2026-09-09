'use client';

import { useEffect, useSyncExternalStore } from 'react';

import {
  getConsentServerSnapshot,
  getConsentSnapshot,
  subscribeToConsent,
} from '../consent/consent';
import {
  cookieAttrs,
  encodeTouch,
  FIRST_TOUCH_COOKIE,
  hasAttributionSignal,
  LAST_TOUCH_KEY,
  readUtmFromLocation,
} from './attribution';

/**
 * Records first- and last-touch attribution, once the visitor has agreed to it.
 *
 * This used to run unconditionally, and the comment here argued the case: the
 * data is first-party, it is never sent to a third party, and it is only
 * *persisted* server-side when the visitor submits a form with an explicit
 * consent box ticked. All of that is true and none of it is the test. What
 * governs a cookie is not where the data goes but whether writing it to the
 * visitor's device is strictly necessary for what they asked for — LSSI art.
 * 22.2 in Spain, ePrivacy art. 5(3) behind it — and a 365-day cookie that
 * exists to credit a marketing campaign is not necessary for showing anybody a
 * page about furniture.
 *
 * So it waits for the marketing category, the same one the Meta Pixel waits
 * for, and the cookie policy says so. `sessionStorage` waits with it: the rule
 * is about storing on the device, and sessionStorage is storage — gating only
 * the cookie would have been half a fix that read like a whole one.
 *
 * The cost is real and worth stating: a visitor who declines is not attributed
 * across pages, and a visitor who accepts on the second page is attributed from
 * that page onwards. What survives regardless is the campaign in the address bar
 * at the moment of submission — the lead form reads it directly (see
 * `lead-dialog.tsx`), because that is part of the request the visitor is
 * deliberately sending rather than something kept on their device.
 *
 * If the browser blocks storage entirely, first touch degrades to last touch
 * rather than failing.
 */
export function AttributionBeacon() {
  const consent = useSyncExternalStore(
    subscribeToConsent,
    getConsentSnapshot,
    getConsentServerSnapshot,
  );
  const allowed = consent?.marketing === true;

  useEffect(() => {
    if (!allowed) return;

    try {
      const touch = readUtmFromLocation(
        window.location.search,
        document.referrer,
        window.location.href,
      );

      const existingFirst = document.cookie
        .split('; ')
        .find((entry) => entry.startsWith(`${FIRST_TOUCH_COOKIE}=`));

      if (!existingFirst) {
        document.cookie = `${FIRST_TOUCH_COOKIE}=${encodeTouch(touch)}; ${cookieAttrs()}`;
      }

      // Overwrite last touch only when this navigation actually carries a
      // signal, so an internal click-through does not erase the campaign that
      // brought the visitor in.
      if (hasAttributionSignal(touch) || !sessionStorage.getItem(LAST_TOUCH_KEY)) {
        sessionStorage.setItem(LAST_TOUCH_KEY, JSON.stringify(touch));
      }
    } catch {
      // Private mode, disabled storage — attribution is best-effort by design.
    }
  }, [allowed]);

  return null;
}
