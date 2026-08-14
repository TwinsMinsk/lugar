import { NextResponse, type NextRequest } from 'next/server';

import {
  getLocaleAlternates,
  getPortfolioIndexSlug,
  resolvePage,
  resolveProject,
} from '@/data/public/documents';
import { DEFAULT_LOCALE, LOCALES, type Locale } from '@/i18n/routing';
import { documentPath, localePath } from '@/lib/routes';

/**
 * Language switch.
 *
 * Resolves the *equivalent document* in the target locale rather than swapping
 * a prefix in the URL, so a page whose Spanish slug differs from its Russian
 * one still switches correctly instead of 404ing.
 *
 * Falls back to the target locale's home page whenever the current path cannot
 * be resolved (a 404, an admin path, a malformed `from`), because sending a
 * visitor to a broken URL is worse than sending them to a working one.
 */
/** Relative Location, so the origin cannot drift. See
 *  src/app/api/preview/route.ts for the full reasoning. */
function relativeRedirect(pathname: string): NextResponse {
  return new NextResponse(null, { status: 307, headers: { Location: pathname } });
}

function stripLocalePrefix(pathname: string): { locale: Locale; path: string } {
  const segments = pathname.split('/').filter(Boolean);
  const first = segments[0];
  if (first && (LOCALES as readonly string[]).includes(first)) {
    return { locale: first as Locale, path: `/${segments.slice(1).join('/')}` };
  }
  return { locale: DEFAULT_LOCALE, path: pathname || '/' };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale: rawTarget } = await params;

  if (!(LOCALES as readonly string[]).includes(rawTarget)) {
    return relativeRedirect('/');
  }
  const target = rawTarget as Locale;

  const from = request.nextUrl.searchParams.get('from') ?? '/';
  // Only same-origin relative paths are honoured — never an absolute URL from
  // the query string, which would make this an open redirect.
  const safeFrom = from.startsWith('/') && !from.startsWith('//') ? from : '/';

  const fallback = relativeRedirect(localePath(target, '/'));

  try {
    const { locale: currentLocale, path } = stripLocalePrefix(safeFrom);
    const segments = path.split('/').filter(Boolean);

    let documentId: string | null = null;

    if (segments.length === 0) {
      const page = await resolvePage(currentLocale, '');
      documentId = page?.documentId ?? null;
    } else if (segments.length === 1) {
      const page = await resolvePage(currentLocale, segments[0]!);
      documentId = page?.documentId ?? null;
    } else if (segments.length === 2) {
      const indexSlug = await getPortfolioIndexSlug(currentLocale);
      if (indexSlug && segments[0] === indexSlug) {
        const project = await resolveProject(currentLocale, segments[1]!);
        documentId = project?.documentId ?? null;
      }
    }

    if (!documentId) return fallback;

    const alternates = await getLocaleAlternates(documentId);
    const match = alternates.find((alternate) => alternate.locale === target);
    if (!match) return fallback;

    const targetIndexSlug = match.kind === 'project' ? await getPortfolioIndexSlug(target) : null;

    return relativeRedirect(
      localePath(target, documentPath(match.kind, match.slug, targetIndexSlug)),
    );
  } catch {
    return fallback;
  }
}
