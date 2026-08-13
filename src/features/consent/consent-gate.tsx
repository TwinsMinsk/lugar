import { cookies } from 'next/headers';

import { ConsentBanner } from './consent-banner';
import { CONSENT_COOKIE, parseConsent } from './consent';

/**
 * Decides server-side whether the consent banner is needed.
 *
 * Consent is per-visitor, so it is genuinely dynamic data and belongs behind a
 * Suspense boundary — which is exactly what Cache Components makes explicit.
 * The rest of the page stays fully prerendered; only this decision streams.
 *
 * Doing it here rather than in the client removes two problems at once: the
 * banner never appears in the static HTML and then vanishes for someone who
 * already decided, and the client component no longer needs an effect to
 * discover state it could not know during render.
 */
export async function ConsentGate({ privacyHref }: { privacyHref: string }) {
  const store = await cookies();
  const existing = parseConsent(store.get(CONSENT_COOKIE)?.value);

  // Always mounted — even when there is nothing to ask — because the footer's
  // "Cookie preferences" link has to be able to reopen it. Only the initial
  // visibility depends on the stored record.
  return <ConsentBanner privacyHref={privacyHref} initiallyOpen={existing === null} />;
}
