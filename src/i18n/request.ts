import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';

import { DEFAULT_LOCALE, LOCALE_TAG, routing } from './routing';

/**
 * Per-request i18n config.
 *
 * These messages are UI chrome only — button labels, form errors, aria text.
 * Editorial page content does NOT live here: it comes from the CMS as
 * localised leaves on content blocks. Keeping the two separate means the owner
 * edits copy in /admin and developers edit UI strings in the repo, with no
 * overlap.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    // Operational dates are shown in the studio's local time regardless of
    // where the visitor or the server is.
    timeZone: 'Europe/Madrid',
    formats: {
      dateTime: {
        short: { day: 'numeric', month: 'short', year: 'numeric' },
      },
    },
    onError(error) {
      // A missing translation must never blank out a page. Log in dev, fall
      // back to the message key in production.
      if (process.env.NODE_ENV === 'development') console.warn('[i18n]', error.message);
    },
    getMessageFallback({ key }) {
      return key.split('.').pop() ?? key;
    },
  };
});

export { LOCALE_TAG };
