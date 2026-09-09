import createIntlMiddleware from 'next-intl/middleware';
import { type NextRequest, NextResponse } from 'next/server';

import { routing } from '@/i18n/routing';
import { REQUEST_ID_HEADER, resolveRequestId } from '@/lib/request-id';

/**
 * Next 16 renamed `middleware.ts` to `proxy.ts` (Node runtime only).
 *
 * Two responsibilities, in order:
 *   1. Keep /admin out of locale routing and require a session cookie. This is
 *      a cheap gate only — every admin query and mutation re-checks the session
 *      and role on the server. UI hiding is not access control, and neither is
 *      this.
 *   2. Delegate everything else to next-intl for locale resolution.
 *
 * It also stamps every response with a request id, and passes that id to the
 * server on the paths where the documented API allows it. The one path where it
 * cannot is locale pages: next-intl builds its own response, and the supported
 * way to give the server a header is to build the response yourself. Those
 * pages still return the id to the browser, which is what a person reporting a
 * problem can quote; route handlers and the panel — where the logging actually
 * is — get it on the request as well.
 */
const intlMiddleware = createIntlMiddleware(routing);

/**
 * Paths the proxy must not touch.
 *
 * Expressed as code rather than as a negative-lookahead matcher regex on
 * purpose. The regex form needs an escaped dot inside a JS string literal, and
 * `'\.'` is not a valid escape — it silently collapses to `'.'`, which turns
 * the "skip files" guard into "skip every non-empty path" and disables the
 * proxy entirely. That failure is invisible in review and presents as a sitewide
 * 404 on the default locale. Plain string checks cannot fail that way.
 */
function isExcluded(pathname: string): boolean {
  // Route handlers are never locale-prefixed, so running locale resolution
  // over them rewrites /api/locale/es into a page path and 404s it.
  //
  // /api/whatsapp in particular must never be touched: the webhook verifies an
  // HMAC over the RAW request body, and anything that buffers or re-serialises
  // the body breaks the signature. Because Meta retries a non-200 for seven
  // days, that is a week-long 403 storm rather than one error.
  if (pathname.startsWith('/api')) return true;

  if (pathname.startsWith('/_next') || pathname.startsWith('/_vercel')) return true;

  // Anything with a file extension in the last segment (favicon.ico, og.png).
  const lastSegment = pathname.slice(pathname.lastIndexOf('/') + 1);
  return lastSegment.includes('.');
}

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);

  const forward = () => {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set(REQUEST_ID_HEADER, requestId);
    return response;
  };

  // Route handlers included, and deliberately: the WhatsApp webhook is the
  // single place where knowing which delivery a log line came from matters
  // most. Only headers are touched, so the raw body the signature is computed
  // over is untouched.
  if (isExcluded(pathname)) return forward();

  if (pathname.startsWith('/admin')) {
    // Cookie presence only — never trust its contents here.
    const hasSession =
      request.cookies.has('better-auth.session_token') ||
      request.cookies.has('__Secure-better-auth.session_token');

    // /admin/invite and /admin/reset-password are deliberately open: in both
    // the token is the authorisation, and requiring a session would make them
    // impossible to use — nobody accepting an invitation has an account yet,
    // and nobody resetting a forgotten password can sign in to reach the form.
    const isPublicAdminPath =
      pathname.startsWith('/admin/login') ||
      pathname.startsWith('/admin/invite') ||
      pathname.startsWith('/admin/reset-password');

    if (!hasSession && !isPublicAdminPath) {
      const url = request.nextUrl.clone();
      url.pathname = '/admin/login';
      url.search = `?next=${encodeURIComponent(pathname)}`;
      const redirect = NextResponse.redirect(url);
      redirect.headers.set(REQUEST_ID_HEADER, requestId);
      return redirect;
    }
    return forward();
  }

  const response = intlMiddleware(request);
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

export const config = {
  // Match everything; exclusions live in isExcluded() above.
  matcher: '/:path*',
};
