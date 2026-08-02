import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_TOKEN_ENV, bearerFrom, decideAccess, isPublicPath, SESSION_COOKIE } from '@/lib/auth';

/**
 * One gate in front of every page and API route. See lib/auth.ts for why this
 * lives here rather than in each handler.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const decision = decideAccess({
    token: process.env[ACCESS_TOKEN_ENV],
    presented: request.cookies.get(SESSION_COOKIE)?.value ?? bearerFrom(request.headers.get('authorization')),
    isProduction: process.env.NODE_ENV === 'production',
  });

  if (decision.kind === 'allow') return NextResponse.next();

  const wantsJson = pathname.startsWith('/api/');

  if (decision.kind === 'misconfigured') {
    // 503, not 500: the app is fine, the deployment is incomplete.
    return wantsJson
      ? NextResponse.json({ error: decision.detail }, { status: 503 })
      : new NextResponse(decision.detail, {
          status: 503,
          headers: { 'content-type': 'text/plain' },
        });
  }

  if (wantsJson) {
    return NextResponse.json(
      {
        error: `unauthorized — present the ${ACCESS_TOKEN_ENV} as \`Authorization: Bearer …\``,
      },
      { status: 401 },
    );
  }

  const unlock = new URL('/unlock', request.url);
  // Round-trip the destination so unlocking lands where the operator was going.
  unlock.searchParams.set('next', pathname + request.nextUrl.search);
  return NextResponse.redirect(unlock);
}

export const config = {
  // Everything except Next's own static output and the favicon. Listing what to
  // skip (rather than what to guard) is deliberate: a new route is protected by
  // default instead of protected once someone remembers to add it.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
};
