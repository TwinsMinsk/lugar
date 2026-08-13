import createIntlMiddleware from 'next-intl/middleware';
import { type NextRequest, NextResponse } from 'next/server';

import { routing } from '@/i18n/routing';

/**
 * Next 16 renamed `middleware.ts` to `proxy.ts` (Node runtime only).
 *
 * Two responsibilities, in order:
 *   1. Keep /admin out of locale routing and require a session cookie.
 *      This is a cheap gate only — every admin query and mutation re-checks
 *      the session and role on the server. UI-level hiding is not access
 *      control, and neither is this.
 *   2. Delegate everything else to next-intl for locale resolution.
 */
const intlMiddleware = createIntlMiddleware(routing);

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/admin')) {
    // Cookie presence only — never trust its contents here.
    const hasSession =
      request.cookies.has('better-auth.session_token') ||
      request.cookies.has('__Secure-better-auth.session_token');

    if (!hasSession && !pathname.startsWith('/admin/login')) {
      const url = request.nextUrl.clone();
      url.pathname = '/admin/login';
      url.search = `?next=${encodeURIComponent(pathname)}`;
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  return intlMiddleware(request);
}

export const config = {
  /**
   * `/api/whatsapp/*` is deliberately excluded.
   *
   * The webhook verifies an HMAC over the RAW request body. Anything that
   * touches, buffers or re-serialises the body silently breaks the signature
   * check — and because Meta retries a non-200 for seven days, that failure
   * mode is a week-long 403 storm rather than a single error. Do not add it
   * back to this matcher.
   */
  matcher: ['/((?!api/whatsapp|_next|_vercel|.*\..*).*)'],
};
