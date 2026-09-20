/**
 * Better Auth — the browser half.
 *
 * Client components import from here; everything it calls lands on
 * /api/auth/*, which is served by src/lib/auth.ts. Nothing secret lives in
 * this file, and nothing in it runs on the server.
 *
 * `baseURL` is left to the default (the page's own origin) so the same build
 * works on localhost, previews and production without a rebuild.
 */

import { createAuthClient } from 'better-auth/react';
import { magicLinkClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  // Mirrors the server's plugin list — the client needs the matching half to
  // know `signIn.magicLink` exists. See src/lib/auth.ts.
  plugins: [magicLinkClient()],
});

export const { signIn, signUp, signOut, useSession, getSession } = authClient;
