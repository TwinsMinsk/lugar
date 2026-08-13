'use client';

import { useEffect } from 'react';

import {
  COOKIE_ATTRS,
  encodeTouch,
  FIRST_TOUCH_COOKIE,
  hasAttributionSignal,
  LAST_TOUCH_KEY,
  readUtmFromLocation,
} from './attribution';

/**
 * Records first- and last-touch attribution once per page load.
 *
 * This is strictly first-party data, retained only to attribute an enquiry the
 * visitor is actively submitting, and never transmitted to a third party. It
 * is therefore not gated behind analytics consent — but it is also never
 * *persisted* anywhere until the visitor ticks the consent box and submits, at
 * which point it is written alongside an explicit consent record.
 *
 * If the browser blocks cookies entirely, first touch degrades to last touch
 * rather than failing.
 */
export function AttributionBeacon() {
  useEffect(() => {
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
        document.cookie = `${FIRST_TOUCH_COOKIE}=${encodeTouch(touch)}; ${COOKIE_ATTRS}`;
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
  }, []);

  return null;
}
