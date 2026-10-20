import type { Instrumentation } from 'next';

/**
 * Server errors Next catches on its own — a page that throws while rendering,
 * a Route Handler that is not wrapped in `withAxiom` — go to Axiom too, so an
 * error anywhere on the server is an error in one place.
 *
 * The logger is imported here rather than at the top: this file is loaded by
 * every runtime, and the logger is Node-only.
 */
export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const [{ log }, { createOnRequestError }] = await Promise.all([
    import('@/lib/log'),
    import('@axiomhq/nextjs'),
  ]);
  await createOnRequestError(log)(...args);
};
