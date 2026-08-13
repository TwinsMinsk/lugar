import type { Attribution } from '@/features/leads/schema';

/**
 * Attribution capture.
 *
 * The two halves flow in opposite directions, which is what makes this work
 * across the RSC boundary without guessing:
 *
 *   - page / block / project context flows DOWN as props from the Server
 *     Component. A CTA knows its own placement at render time, so nothing has
 *     to be sniffed from the URL on the client.
 *   - UTM, referrer and landing URLs flow UP from the browser, because only
 *     the browser ever saw the entry URL.
 *
 * First touch lives in a cookie (survives tab close, and is readable
 * server-side as a backstop if the hidden field is stripped). Last touch lives
 * in sessionStorage, because it must be overwritable and must not bloat the
 * cookie sent on every single request.
 */

export const FIRST_TOUCH_COOKIE = 'lg_attr';
export const LAST_TOUCH_KEY = 'lg_attr_last';
const COOKIE_MAX_AGE_DAYS = 365;

export type AttributionTouch = Attribution & { at?: number };

export function readUtmFromLocation(search: string, referrer: string, href: string) {
  const params = new URLSearchParams(search);
  const get = (key: string) => params.get(key) || null;
  return {
    utmSource: get('utm_source'),
    utmMedium: get('utm_medium'),
    utmCampaign: get('utm_campaign'),
    utmContent: get('utm_content'),
    utmTerm: get('utm_term'),
    referrer: referrer || null,
    landingFirst: href,
    landingLast: href,
    at: Date.now(),
  } satisfies AttributionTouch;
}

export function hasAttributionSignal(touch: AttributionTouch): boolean {
  return Boolean(
    touch.utmSource ||
    touch.utmMedium ||
    touch.utmCampaign ||
    touch.utmContent ||
    touch.utmTerm ||
    touch.referrer,
  );
}

/**
 * Merge with a fixed precedence: first touch from the cookie always wins for
 * `landingFirst`, last touch from the session always wins for everything else.
 */
export function mergeTouches(
  first: AttributionTouch | null,
  last: AttributionTouch | null,
): Attribution {
  return {
    utmSource: last?.utmSource ?? first?.utmSource ?? null,
    utmMedium: last?.utmMedium ?? first?.utmMedium ?? null,
    utmCampaign: last?.utmCampaign ?? first?.utmCampaign ?? null,
    utmContent: last?.utmContent ?? first?.utmContent ?? null,
    utmTerm: last?.utmTerm ?? first?.utmTerm ?? null,
    referrer: first?.referrer ?? last?.referrer ?? null,
    landingFirst: first?.landingFirst ?? last?.landingFirst ?? null,
    landingLast: last?.landingLast ?? first?.landingLast ?? null,
  };
}

export function encodeTouch(touch: AttributionTouch): string {
  return encodeURIComponent(JSON.stringify(touch));
}

export function decodeTouch(raw: string | null | undefined): AttributionTouch | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(raw));
    if (parsed && typeof parsed === 'object') return parsed as AttributionTouch;
  } catch {
    // A corrupted cookie is not worth failing a submission over.
  }
  return null;
}

export const COOKIE_ATTRS = `path=/; max-age=${COOKIE_MAX_AGE_DAYS * 24 * 60 * 60}; samesite=lax`;
