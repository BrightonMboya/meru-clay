/**
 * The door.
 *
 * Everything staff-only lives under two prefixes — /admin and /api/desk — so
 * that turning strangers away could be done in one place. This is that place.
 *
 * In Next 16 this file is `proxy.ts`; it was `middleware.ts` until the rename
 * (see node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions
 * /proxy.md). It runs on the Node.js runtime, which is what lets it read a
 * real session here rather than trusting the shape of a cookie.
 *
 * It is still not the lock. `matcher` is statically analysed and easy to
 * narrow by accident, and Server Functions are POSTs to whatever route they
 * are used on — which a matcher can miss. The real check is `requireOperator`
 * in src/lib/admin/session.ts, called inside the layout and the handlers. This
 * turns visitors around early and keeps the login redirect in one place.
 */

import { NextResponse, type NextRequest } from 'next/server';

import { auth } from '@/lib/auth';

/** The two pages a signed-out person is allowed to reach under /admin. */
const PUBLIC_ADMIN_PATHS = ['/admin/login', '/admin/signup'];

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (PUBLIC_ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const session = await auth.api.getSession({ headers: request.headers });
  if (session) return NextResponse.next();

  // The screens' own fetches. A redirect to HTML would surface at the caller
  // as a JSON parse error instead of as "signed out", so say it plainly.
  if (pathname.startsWith('/api/desk')) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const login = new URL('/admin/login', request.url);
  // Where they were going, so signing in finishes the journey.
  login.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/admin/:path*', '/api/desk/:path*'],
};
