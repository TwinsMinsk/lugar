import { draftMode } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';

/** Leaves preview and returns to the published site. */
export async function GET(request: NextRequest) {
  const draft = await draftMode();
  draft.disable();

  const from = request.nextUrl.searchParams.get('from');
  // Same-origin relative paths only.
  const safe = from && from.startsWith('/') && !from.startsWith('//') ? from : '/';

  // A relative Location keeps the browser on the origin it used, so the cookie
  // this route just cleared is actually the one the next request omits.
  return new NextResponse(null, { status: 307, headers: { Location: safe } });
}
