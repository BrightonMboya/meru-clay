/**
 * Invitations to the club office.
 *
 * An invitation is a row saying "this address may become an operator". It is
 * deliberately separate from the magic link that carries someone through the
 * door: Better Auth mints and verifies that token, and it lives for minutes.
 * This lives for days and answers the other half of the question. A link
 * forwarded to a stranger is still a genuine link — it is the absence of a
 * row here that stops it also being an account.
 *
 * Nothing in this file checks whether the caller is allowed to invite. That
 * is the route handler's job, and it does it with `requireOperatorApi`.
 */

import 'server-only';

import { and, desc, eq, gt, isNull } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { adminInvites, user, type AdminInviteRecord } from '@/lib/db/schema';

/** How long an invitation stands before it has to be sent again. */
export const INVITE_TTL_DAYS = 7;

/**
 * Emails are compared, not displayed, so they are stored one way only.
 * Better Auth lowercases addresses too; if these two disagreed, an invited
 * person would be refused by the very row that was meant to admit them.
 */
export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Enough to catch a typo, not so much that it argues with real addresses. */
export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

export type InviteStatus = 'pending' | 'accepted' | 'expired';

export type Invite = {
  id: number;
  email: string;
  invitedByName: string | null;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  status: InviteStatus;
};

function statusOf(row: AdminInviteRecord, now: Date): InviteStatus {
  if (row.acceptedAt) return 'accepted';
  return row.expiresAt > now ? 'pending' : 'expired';
}

/** Dates cross to the client as ISO strings; see the note on `Board`. */
function toInvite(row: AdminInviteRecord, now: Date): Invite {
  return {
    id: row.id,
    email: row.email,
    invitedByName: row.invitedByName,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    status: statusOf(row, now),
  };
}

/** The roll, newest first. */
export async function listInvites(): Promise<Invite[]> {
  const now = new Date();
  const rows = await db.select().from(adminInvites).orderBy(desc(adminInvites.createdAt));
  return rows.map((r) => toInvite(r, now));
}

/**
 * Whether this address may create an account right now.
 *
 * Called from `user.validateUserInfo` on every sign-up, so it has to be
 * cheap and it has to be exact: one unaccepted, unexpired row.
 */
export async function hasOpenInvite(email: string): Promise<boolean> {
  const [row] = await db
    .select({ id: adminInvites.id })
    .from(adminInvites)
    .where(
      and(
        eq(adminInvites.email, normaliseEmail(email)),
        isNull(adminInvites.acceptedAt),
        gt(adminInvites.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Who invited this address, for the signature on the email.
 *
 * Read back from the row rather than threaded through the magic-link call:
 * the invitation is written before the link is requested, so by the time
 * `sendMagicLink` runs the answer is already in the database, and passing it
 * along as metadata would just be a second copy that could disagree.
 */
export async function inviterNameFor(email: string): Promise<string | null> {
  const [row] = await db
    .select({ name: adminInvites.invitedByName })
    .from(adminInvites)
    .where(and(eq(adminInvites.email, normaliseEmail(email)), isNull(adminInvites.acceptedAt)))
    .limit(1);
  return row?.name ?? null;
}

/** Whether someone already has an account, so we do not invite a colleague twice. */
export async function userExists(email: string): Promise<boolean> {
  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, normaliseEmail(email)))
    .limit(1);
  return Boolean(row);
}

/**
 * Write the invitation down.
 *
 * Upsert rather than insert: inviting the same address again is how you
 * re-send a link that expired, and it should refresh the existing row rather
 * than fail on the unique index or leave two rows disagreeing about when the
 * invitation runs out. `acceptedAt` is reset to null for the same reason —
 * the row is being re-opened.
 */
export async function recordInvite(input: {
  email: string;
  invitedBy: string;
  invitedByName: string | null;
}): Promise<Invite> {
  const email = normaliseEmail(input.email);
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  const [row] = await db
    .insert(adminInvites)
    .values({
      email,
      invitedBy: input.invitedBy,
      invitedByName: input.invitedByName,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: adminInvites.email,
      set: {
        invitedBy: input.invitedBy,
        invitedByName: input.invitedByName,
        expiresAt,
        acceptedAt: null,
        createdAt: new Date(),
      },
    })
    .returning();

  return toInvite(row!, new Date());
}

/**
 * Close an invitation off once it has been used.
 *
 * Called from the `user.create.after` hook, so it runs for every new account
 * and finds nothing for the founding operator, who had no invitation. That is
 * why it is a silent no-op rather than an error.
 */
export async function markInviteAccepted(email: string): Promise<void> {
  await db
    .update(adminInvites)
    .set({ acceptedAt: new Date() })
    .where(and(eq(adminInvites.email, normaliseEmail(email)), isNull(adminInvites.acceptedAt)));
}

/** Withdraw an invitation. Deleting the row is what takes the permission away. */
export async function revokeInvite(id: number): Promise<boolean> {
  const gone = await db.delete(adminInvites).where(eq(adminInvites.id, id)).returning({
    id: adminInvites.id,
  });
  return gone.length > 0;
}

/* ------------------------------------------------------------- the email */

/** Anything that reaches HTML from a person rather than from this file. */
function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const CLUB = () => process.env.CLUB_NAME ?? 'Meru Clay';

/**
 * The invitation itself.
 *
 * Plain and short on purpose. It is asking someone to click a link that hands
 * them a staff account, which is exactly the shape of a phishing mail, so it
 * says who sent it and what it is for rather than dressing itself up.
 */
export function inviteEmail(to: string, url: string, invitedByName: string | null) {
  const club = CLUB();
  const who = invitedByName ? `${invitedByName} has` : 'Someone at the club has';
  const days = INVITE_TTL_DAYS;

  return {
    to,
    subject: `You have been invited to the ${club} club office`,
    text: [
      `${who} invited you to the ${club} club office — the staff side of the`,
      `booking site, where the desk, the roster and the lead pipeline live.`,
      ``,
      `Open this link to create your account:`,
      url,
      ``,
      `The link is good for 24 hours. The invitation itself stands for ${days} days,`,
      `so if the link expires, ask for another one.`,
      ``,
      `If you were not expecting this, ignore it — nothing happens until the`,
      `link is opened.`,
    ].join('\n'),
    html: [
      `<p>${escapeHtml(who)} invited you to the <strong>${escapeHtml(club)} club office</strong> —`,
      `the staff side of the booking site, where the desk, the roster and the lead`,
      `pipeline live.</p>`,
      `<p><a href="${escapeHtml(url)}">Open the club office</a></p>`,
      `<p style="color:#666;font-size:13px">The link is good for 24 hours. The invitation`,
      `itself stands for ${days} days, so if the link expires, ask for another one.</p>`,
      `<p style="color:#666;font-size:13px">If you were not expecting this, ignore it —`,
      `nothing happens until the link is opened.</p>`,
    ].join(' '),
  };
}

/** The other magic link: an operator who already has an account, signing in. */
export function signInEmail(to: string, url: string) {
  const club = CLUB();
  return {
    to,
    subject: `Your ${club} club office sign-in link`,
    text: [`Open this link to sign in to the ${club} club office:`, url, ``,
           `It is good for 24 hours and can only be used once.`,
           `If you did not ask for it, ignore it.`].join('\n'),
    html: [
      `<p>Open this link to sign in to the <strong>${escapeHtml(club)} club office</strong>:</p>`,
      `<p><a href="${escapeHtml(url)}">Sign in</a></p>`,
      `<p style="color:#666;font-size:13px">It is good for 24 hours and can only be used`,
      `once. If you did not ask for it, ignore it.</p>`,
    ].join(' '),
  };
}
