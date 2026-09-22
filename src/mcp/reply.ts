/**
 * What a tool hands back, and the argument types every tool shares.
 *
 * Three decisions live here rather than in each tool:
 *
 * `ok` serialises to indented JSON. A tool result is read by a model, not a
 * screen, so the shape has to be unambiguous — but it is also read by a
 * person in a transcript when something has gone wrong, and two spaces of
 * indentation is the difference between those two readers being served and
 * only the first one being.
 *
 * `fail` sets `isError`, which is not the same as throwing. A tool that
 * throws is a broken tool; a tool that refuses is a working tool reporting
 * that the club's rules say no. The model can act on the second — try
 * another slot, ask the operator — and can only apologise for the first, so
 * every refusal in this directory goes through here and every unexpected
 * exception is left to propagate.
 *
 * `clockTime` is the reason the tools read well. The database stores minutes
 * from local midnight (see the note in src/lib/time.ts) and a model asked to
 * book "1110" will get it wrong eventually. Every tool takes and returns
 * "18:30", and this file is the only place the two representations meet.
 */

import { z } from 'zod';

import { fmtTime24, isValidDate, parseHHMM } from '@/lib/time';

export type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

/** A tool that worked. */
export function ok(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

/**
 * A tool that refused.
 *
 * `hint` is for the thing the model should try next, and is worth supplying
 * whenever there is one: "that slot is taken" sends it back to guessing,
 * "that slot is taken — court_availability lists what is free" does not.
 */
export function fail(error: string, hint?: string): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(hint ? { error, hint } : { error }, null, 2) }],
    isError: true,
  };
}

/* ------------------------------------------------------------- arguments */

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates are YYYY-MM-DD.')
  .refine(isValidDate, 'That is not a real date.');

export const clockTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Times are HH:MM on the 24-hour clock, e.g. "18:30".');

/** "18:30" → 1110. Safe only on a string `clockTime` has accepted. */
export const minutesOf = parseHHMM;

/** 1110 → "18:30". Re-exported so a tool needs one import, not two. */
export const timeOf = fmtTime24;

/**
 * A window of dates, as every report here takes one.
 *
 * Both ends inclusive, which is what somebody asking "how many came in
 * September" means by the 30th.
 */
export const dateWindow = {
  from: isoDate.describe('First day of the window, inclusive (YYYY-MM-DD).'),
  to: isoDate.describe('Last day of the window, inclusive (YYYY-MM-DD).'),
};

/** Refuse a window that runs backwards before it reaches the database. */
export function badWindow(from: string, to: string): ToolResult | null {
  return from > to ? fail(`"from" (${from}) is after "to" (${to}).`) : null;
}
