import { NextRequest, NextResponse } from 'next/server';
import { challengePage, gateDecision, GATE_COOKIE } from '@/lib/access-gate';

/**
 * Whole-app access gate.
 * Active only when the configured access token is present.
 * When unset, development remains open.
 */

export function middleware(req: NextRequest) {
  const decision = gateDecision({
    token: process.env.STARTUP_ACCESS_TOKEN,
    cookie: req.cookies.get(GATE_COOKIE)?.value ?? null,
    queryToken: req.nextUrl.searchParams.get('token'),
  });

  switch (decision.kind) {
    case 'open':
    case 'pass':
      return NextResponse.next();
    case 'set-cookie': {
      // strip ?token= from the URL so it never lingers in the address bar
      const clean = req.nextUrl.clone();
      clean.searchParams.delete('token');
      const res = NextResponse.redirect(clean);
      res.cookies.set(GATE_COOKIE, decision.value, {
        httpOnly: true,
        sameSite: 'lax',
        secure: req.nextUrl.protocol === 'https:',
        maxAge: 60 * 60 * 24 * 30, // re-enter monthly
        path: '/',
      });
      return res;
    }
    case 'challenge':
      return new NextResponse(challengePage(), {
        status: 401,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
  }
}

export const config = {
  // gate pages and APIs; skip Next internals + static files so the
  // challenge page itself can render
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|.*\\.png$|.*\\.svg$).*)'],
};
