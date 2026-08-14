import { draftMode } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';

import { getPortfolioIndexSlug } from '@/data/public/documents';
import { getDocumentSlug } from '@/data/public/navigation';
import { LOCALES, type Locale } from '@/i18n/routing';
import { getSession } from '@/lib/auth/guards';
import { documentPath, localePath } from '@/lib/routes';
import { verifyPreviewToken } from '@/lib/preview';

/**
 * Enter preview.
 *
 * Two ways in, both authorised before draft mode is enabled:
 *   - a signed, time-limited token, so a link can be shared with a reviewer who
 *     has no account;
 *   - an authenticated admin session, for the "Preview" button in the editor.
 *
 * Nothing here trusts the redirect target from the query string: the
 * destination is derived from the document the token names, so this cannot be
 * turned into an open redirect or used to enable draft mode on a page the
 * bearer was not granted.
 */
/**
 * Redirect to a path on the origin the client actually used.
 *
 * A *relative* Location header is the only reliable way to do this. Both
 * `new URL(path, request.url)` and cloning `request.nextUrl` can report a
 * different host than the client sent — `localhost` where the request said
 * `127.0.0.1`, or the apex where a proxy said `www`. Cookies set on the first
 * host are then not sent to the second, which silently breaks anything relying
 * on one. Here that meant a preview link redirecting to a page that no longer
 * had the draft-mode cookie, so it quietly rendered the published version.
 *
 * RFC 7231 permits a relative Location, and every browser resolves it against
 * the request URL — so the origin cannot drift.
 */
function relativeRedirect(pathname: string, status: 302 | 307 = 307): NextResponse {
  return new NextResponse(null, { status, headers: { Location: pathname } });
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  const claims = verifyPreviewToken(token);

  let documentId = claims?.documentId ?? null;
  let locale = (claims?.locale ?? null) as Locale | null;

  if (!documentId) {
    // No valid token — fall back to an admin session.
    const session = await getSession();
    if (!session?.user) {
      return new NextResponse('Not found', { status: 404 });
    }
    documentId = request.nextUrl.searchParams.get('documentId');
    locale = request.nextUrl.searchParams.get('locale') as Locale | null;
  }

  if (!documentId || !locale || !LOCALES.includes(locale)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const target = await getDocumentSlug(documentId, locale);
  if (!target) {
    // Never published in this locale, so there is no public URL to preview at.
    return new NextResponse('Not found', { status: 404 });
  }

  const draft = await draftMode();
  draft.enable();

  const indexSlug = target.kind === 'project' ? await getPortfolioIndexSlug(locale) : null;
  return relativeRedirect(localePath(locale, documentPath(target.kind, target.slug, indexSlug)));
}
