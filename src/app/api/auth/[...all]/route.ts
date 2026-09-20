/**
 * Every Better Auth endpoint — sign-in, sign-up, sign-out, session, callbacks.
 *
 * The catch-all is deliberate: Better Auth routes internally off the rest of
 * the path, so this one file answers /api/auth/anything. The logic lives in
 * src/lib/auth.ts; this is only the seam between it and Next.
 */

import { toNextJsHandler } from 'better-auth/next-js';

import { auth } from '@/lib/auth';

export const { GET, POST } = toNextJsHandler(auth.handler);
