/**
 * Logging, to Axiom.
 *
 * One logger for the server. With AXIOM_TOKEN and AXIOM_DATASET set, every
 * event goes to Axiom as structured JSON; without them (a laptop, the test
 * suite) it goes to the console only, so nothing has to be configured for the
 * app to run. Under Vitest it is silent.
 *
 * Two kinds of event, and both are worth knowing the shape of:
 *
 *   REQUESTS — `withAxiom` wraps a Route Handler and records one event per
 *   request: path, method, status, duration. A 4xx is a warning and a 5xx an
 *   error, so an Axiom monitor on `level == "error"` is a monitor on the
 *   site falling over.
 *
 *   DOMAIN EVENTS — named things the club cares about, logged where they
 *   happen: `pack.credited`, `booking.pack_spent`, `payment.fulfilment_blocked`.
 *   Named `noun.verb` so a query can group by them. Fields are ids and
 *   amounts; phone numbers and names are left out on purpose.
 *
 * Logs are flushed inside `after()`, once the response has gone: a serverless
 * function is frozen the moment it answers, and a batch still sitting in
 * memory then is a batch lost.
 */

import 'server-only';

import { Axiom } from '@axiomhq/js';
import { AxiomJSTransport, ConsoleTransport, Logger, type Transport } from '@axiomhq/logging';
import {
  getLogLevelFromStatusCode,
  nextJsFormatters,
  transformRouteHandlerErrorResult,
  transformRouteHandlerSuccessResult,
} from '@axiomhq/nextjs';
import { after } from 'next/server';

const token = process.env.AXIOM_TOKEN;
const dataset = process.env.AXIOM_DATASET;
const testing = Boolean(process.env.VITEST);

const transports: [Transport, ...Transport[]] = [
  new ConsoleTransport({ prettyPrint: process.env.NODE_ENV !== 'production', logLevel: testing ? 'off' : 'info' }),
];
if (token && dataset && !testing) {
  transports.push(new AxiomJSTransport({ axiom: new Axiom({ token }), dataset }));
}

export const log = new Logger({ transports, formatters: nextJsFormatters });

/** Whether events are reaching Axiom, for anything that wants to say so. */
export const axiomEnabled = transports.length > 1;

/** An error as fields Axiom can index, rather than `[object Object]`. */
export function errorFields(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    const cause = (err as { cause?: { message?: string; code?: string } }).cause;
    return {
      error: err.message,
      errorName: err.name,
      stack: err.stack,
      ...(cause ? { cause: cause.message, causeCode: cause.code } : {}),
    };
  }
  return { error: String(err) };
}

/**
 * Wrap a Route Handler so every request is one event in Axiom.
 *
 * The handler's own signature passes straight through, so Next's route types
 * still check the wrapped export.
 */
export function withAxiom<Args extends [Request, ...unknown[]]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    const req = args[0];
    const start = Date.now();
    try {
      const res = await handler(...args);
      const [message, report] = transformRouteHandlerSuccessResult({ req, res, start, end: Date.now() });
      const level = res.status >= 400 ? getLogLevelFromStatusCode(res.status) : 'info';
      after(async () => {
        log.log(level, message, report);
        await log.flush();
      });
      return res;
    } catch (error) {
      const [message, report] = transformRouteHandlerErrorResult({ req, error, start, end: Date.now() });
      after(async () => {
        log.error(message, { ...report, ...errorFields(error) });
        await log.flush();
      });
      throw error;
    }
  };
}
