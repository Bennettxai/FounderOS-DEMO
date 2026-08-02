import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ACCESS_TOKEN_ENV, safeEqual, SESSION_COOKIE } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const UnlockSchema = z.object({
  token: z.string().min(1).max(512),
  next: z.string().optional(),
});

/** Only same-site paths, so `next` cannot be turned into an open redirect. */
function safeNext(next: string | undefined): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

function setSession(response: NextResponse, token: string): NextResponse {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true, // page scripts can never read it
    sameSite: 'lax', // another origin cannot ride it
    secure: process.env.NODE_ENV === 'production', // plain-http localhost still works
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}

/**
 * Exchange the access token for a session cookie.
 *
 * Accepts a JSON body (scripts) or a form post (the /unlock page), and answers
 * in kind: JSON callers get JSON, browsers get a redirect.
 */
export async function POST(request: Request) {
  const isForm = (request.headers.get('content-type') ?? '').includes('form');

  const raw = isForm
    ? Object.fromEntries(await request.formData().catch(() => new FormData()))
    : await request.json().catch(() => null);

  const parsed = UnlockSchema.safeParse(raw);
  const configured = process.env[ACCESS_TOKEN_ENV]?.trim() ?? '';

  if (configured.length === 0) {
    const detail = `${ACCESS_TOKEN_ENV} is not set on this server`;
    return isForm
      ? new NextResponse(detail, {
          status: 503,
          headers: { 'content-type': 'text/plain' },
        })
      : NextResponse.json({ error: detail }, { status: 503 });
  }

  if (!parsed.success) {
    return isForm
      ? NextResponse.redirect(new URL('/unlock?error=1', request.url), 303)
      : NextResponse.json({ error: 'expected { token }' }, { status: 400 });
  }

  const { token, next } = parsed.data;

  if (!safeEqual(token, configured)) {
    if (!isForm) return NextResponse.json({ error: 'incorrect token' }, { status: 401 });
    const back = new URL('/unlock', request.url);
    back.searchParams.set('error', '1');
    if (next) back.searchParams.set('next', safeNext(next));
    return NextResponse.redirect(back, 303);
  }

  // 303 so the browser follows with GET rather than re-posting the token.
  return setSession(
    isForm
      ? NextResponse.redirect(new URL(safeNext(next), request.url), 303)
      : NextResponse.json({ ok: true }),
    configured,
  );
}

/** Sign out: drop the session cookie. */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    path: '/',
    maxAge: 0,
  });
  return response;
}
