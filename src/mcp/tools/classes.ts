/**
 * Club classes — the timetable, the register, and a place on one.
 *
 * A class is not a row in any table. The weekly grid is code, in
 * src/lib/schedule.ts, because the booking engine has to read the same
 * timetable the desk draws — if the two ever disagreed, the club would sell
 * a court that is in the middle of a class. So a class occurrence is named
 * the only way one can be: the court and start minute it runs at on a date.
 *
 * Two consequences the tools below have to be honest about. There is no
 * `classId` and there never will be; every tool takes date, court and
 * start. And `list_classes` is the only way to discover what runs on a day —
 * a model cannot list classes from the enrolment table, because a class
 * nobody has signed up to has no rows at all.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { courtName } from '@/lib/availability';
import { classRoll, enrol, enrolmentCounts, getEnrolment, unenrol } from '@/lib/enrolments';
import { normalisePhone } from '@/lib/roster';
import { classKey, classesOn } from '@/lib/schedule';
import { nowLocal, weekdayOf } from '@/lib/time';

import { clockTime, fail, isoDate, minutesOf, ok, timeOf } from '../reply';

export function registerClassTools(server: McpServer) {
  server.registerTool(
    'list_classes',
    {
      title: 'Classes on a day',
      description:
        'What the timetable runs on a date, with how many places are taken on each. The ' +
        'timetable is fixed weekly, so this answers for any date, past or future. There is no ' +
        'class id — a class is identified by its date, court and start time, and every other ' +
        'class tool takes those three.',
      inputSchema: {
        date: isoDate.optional().describe('The day to look at. Defaults to today at the club.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ date }) => {
      const day = date ?? nowLocal().date;
      const rows = classesOn(weekdayOf(day));
      const counts = await enrolmentCounts(day);

      return ok({
        date: day,
        weekday: weekdayOf(day),
        classes: rows.map((row) => ({
          name: row.name,
          court: row.court,
          courtName: courtName(row.court),
          start: timeOf(row.start),
          end: timeOf(row.end),
          fee: row.fee ?? 0,
          age: row.age ?? null,
          enrolled: counts[classKey(row.court, row.start)] ?? 0,
        })),
        note:
          rows.length === 0
            ? 'Nothing on the timetable that weekday. The courts are still bookable.'
            : 'A class occupies its court, and the coach, for its whole window — the booking page will not sell over it.',
      });
    },
  );

  server.registerTool(
    'class_roll',
    {
      title: 'Who is signed up to a class',
      description:
        'The register for one running of a class, in the order people signed up, with what ' +
        'each place cost and whether it has been paid for.',
      inputSchema: {
        date: isoDate.describe('The day it runs (YYYY-MM-DD).'),
        court: z.number().int().describe('Which court it is on — list_classes says.'),
        start: clockTime.describe('Its start time, e.g. "18:30".'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ date, court, start }) => {
      const startMin = minutesOf(start);
      const scheduled = classesOn(weekdayOf(date)).find(
        (row) => row.court === court && row.start === startMin,
      );

      const roll = await classRoll(date, court, startMin);

      return ok({
        date,
        court,
        courtName: courtName(court),
        start,
        // Worth saying: a roll can be non-empty for a class the timetable no
        // longer runs, because enrolments keep the name they were sold under.
        onTheTimetable: Boolean(scheduled),
        className: scheduled?.name ?? roll[0]?.className ?? null,
        enrolled: roll.length,
        unpaidTotal: roll.filter((r) => !r.paid).reduce((n, r) => n + r.amount, 0),
        places: roll.map((r) => ({
          enrolmentId: r.id,
          name: r.name,
          phone: r.phone || null,
          amount: r.amount,
          paid: r.paid,
        })),
      });
    },
  );

  server.registerTool(
    'enrol_in_class',
    {
      title: 'Give somebody a place in a class',
      description:
        'Sign a player up. The fee is copied from the timetable as it stands today and stored ' +
        'on the place, so repricing a class next season does not rewrite what somebody paid ' +
        'for it last one. Refused if that phone number already has a place. Enrolment does ' +
        'not touch availability — the class already occupies the court whether nine turn up or none.',
      inputSchema: {
        date: isoDate.describe('The day it runs (YYYY-MM-DD).'),
        court: z.number().int().describe('Which court — list_classes says.'),
        start: clockTime.describe('Its start time, e.g. "18:30".'),
        name: z.string().min(2).max(80).describe('Who the place is for.'),
        phone: z.string().default('').describe('Their number, or empty for none on file.'),
        paid: z.boolean().default(false).describe('They settled up at the counter on the way in.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ date, court, start, name, phone, paid }) => {
      const startMin = minutesOf(start);
      const scheduled = classesOn(weekdayOf(date)).find(
        (row) => row.court === court && row.start === startMin,
      );

      if (!scheduled) {
        const running = classesOn(weekdayOf(date));
        return fail(
          `No class runs on ${courtName(court)} at ${start} on ${date}.`,
          running.length === 0
            ? 'Nothing is on the timetable that weekday.'
            : `That day runs: ${running.map((r) => `${r.name} on ${courtName(r.court)} at ${timeOf(r.start)}`).join('; ')}.`,
        );
      }

      const normalised = normalisePhone(phone);
      if (normalised === null) return fail(`"${phone}" is not a Tanzanian mobile number.`);

      const place = await enrol({
        date,
        court,
        start: startMin,
        className: scheduled.name,
        name,
        phone: normalised,
        amount: scheduled.fee ?? 0,
        paid,
      });

      if (!place) {
        return fail(
          `${normalised} already has a place in that class.`,
          'class_roll lists who is signed up.',
        );
      }

      return ok({
        enrolmentId: place.id,
        date: place.date,
        court: place.court,
        courtName: courtName(place.court),
        start: timeOf(place.start),
        className: place.className,
        name: place.name,
        phone: place.phone || null,
        amount: place.amount,
        paid: place.paid,
        note:
          place.amount === 0
            ? 'A free session — there is nothing to collect.'
            : 'send_payment_link with kind "class" will put a payment link on their phone.',
      });
    },
  );

  server.registerTool(
    'cancel_enrolment',
    {
      title: 'Take somebody off a class',
      description:
        'Give up a place. The row is kept and marked cancelled, the way a cancelled booking ' +
        'is — a place that was given up is part of the record.',
      inputSchema: {
        enrolmentId: z.number().int().positive().describe('The enrolment id, from class_roll.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ enrolmentId }) => {
      const place = await getEnrolment(enrolmentId);
      if (!place) return fail(`No enrolment with id ${enrolmentId}.`);

      const done = await unenrol(enrolmentId);
      if (!done) return fail(`${place.name}'s place has already been given up.`);

      return ok({
        enrolmentId,
        name: place.name,
        className: place.className,
        date: place.date,
        cancelled: true,
        refundDue: place.paid ? place.amount : 0,
      });
    },
  );
}
