/**
 * Takings — the club's money, as the screen reads it.
 *
 * Pure, like `desk.ts` and `players.ts` next door: it takes rows somebody
 * else fetched and arranges them. Nothing here touches Postgres, which is
 * what lets the Client Component re-filter the same payload without a round
 * trip, and what makes every number on the screen a count rather than a
 * stored total.
 *
 * ── What this screen is for ──────────────────────────────────────────────
 * Before the payments table, "what came in this week" was unanswerable: the
 * club had `bookings.paid` and `players.paid_until`, two booleans that say a
 * payment happened and nothing whatever about it. This is the answer, and it
 * is arranged around the one question that has a deadline attached.
 *
 * The ledger fills from whatever the club is paid — mobile money through
 * Snippe, and whatever the desk records — and this screen has never known
 * which provider it was reporting on. That is deliberate: it survived one
 * being torn out and will survive the next.
 *
 * NEEDS ATTENTION comes first and is the only part of the screen that is a
 * to-do list. A payment lands there when the money arrived and the club
 * could not deliver — almost always a court resold while somebody was
 * entering a mobile-money PIN. It is somebody's money and they are waiting;
 * everything else on this screen can be read tomorrow.
 *
 * ── What it deliberately does not show ───────────────────────────────────
 * Cash taken at the court. The desk marking a booking paid moves
 * `bookings.paid` without writing a payment row, so that money reaches
 * "still owed" — by leaving it — and never reaches the ledger. Closing that
 * gap is a write at the desk, not a migration: `payments.method` already
 * holds 'cash'.
 */

import type { Reading } from '@/components/admin/ui';
import {
  PURPOSE_LABEL,
  STATUS_LABEL,
  type PaymentPurpose,
  type PaymentStatus,
} from '@/lib/checkout';
import type { Payment } from '@/lib/payments';
import { fmtTsh } from '@/lib/pricing';

/** One line of the ledger. */
export type Entry = {
  id: string;
  /** The first eight characters of the id — what a receipt quotes. */
  reference: string;
  name: string;
  /** Their number, or a dash. The desk rings people from this column. */
  phone: string;
  what: string;
  purpose: PaymentPurpose;
  purposeLabel: string;
  status: PaymentStatus;
  statusLabel: string;
  /** "45,000" — the currency is stated once, in the column heading. */
  amount: string;
  /** Raw, for totalling in the client without reparsing the string. */
  amountRaw: number;
  /** "14:02" on the day it happened, "19 Sep" before that. */
  when: string;
  /** Sortable. Epoch ms of payment, or of creation if it never got that far. */
  at: number;
  /** The provider's own reference, for finding the row in their dashboard. */
  providerRef: string | null;
  /** Set when something is wrong, or when a failure was explained. */
  note: string | null;
  /** Paid, and the club has not delivered. Drives Needs attention. */
  stuck: boolean;
};

export type Takings = {
  readings: Reading[];
  /** Paid and undelivered, oldest first. Empty on a good day. */
  attention: Entry[];
  /** Everything in the window, newest first. */
  entries: Entry[];
  /** For the filter row: which purposes and statuses actually occur. */
  purposes: string[];
  statuses: string[];
};

export type TakingsSource = {
  /** Epoch ms of the club's now. */
  epochMs: number;
  /** Start of today at the club, epoch ms. */
  startOfToday: number;
  /** Start of the week the screen is showing, epoch ms. */
  startOfWeek: number;
  payments: Payment[];
  /** Confirmed, unpaid bookings in the past — money still to collect. */
  owedOnCourts: number;
  /** Membership fees outstanding across the roster. */
  owedOnMemberships: number;
};

/** 45000 -> "45,000". The currency is in the heading, not on every row. */
const amountOf = (n: number) => fmtTsh(n);

/**
 * A sum short enough to sit in a reading.
 *
 * Whole thousands lose their zeros, which is what the club's prices are —
 * the same rule, and the same reasoning, as `fmtMoney` on the court desk.
 */
function short(amount: number): string {
  if (amount < 1000) return String(amount);
  const thousands = amount / 1000;
  return `${Number.isInteger(thousands) ? thousands : thousands.toFixed(1)}k`;
}

/** "14:02" today, "19 Sep" before that. A time is only useful while recent. */
function when(at: number, startOfToday: number): string {
  const d = new Date(at);
  if (at >= startOfToday) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    d.getMonth()
  ];
  return `${d.getDate()} ${mon}`;
}

/**
 * What one payment bought, in a phrase.
 *
 * Built from the payment row alone — no joins — because the ledger may run
 * to hundreds of lines and a query per line is how a screen stops loading.
 * The full description lives on /pay/<id>, which the desk can open.
 */
function what(p: Payment): string {
  switch (p.purpose) {
    case 'booking':
      return 'Court hire';
    case 'membership':
      return p.playerId !== null ? 'Membership renewal' : 'Joining the club';
    case 'class':
      return 'Class place';
  }
}

function toEntry(p: Payment, startOfToday: number): Entry {
  const stuck = p.status === 'successful' && p.fulfilledAt === null;

  return {
    id: p.id,
    reference: p.id.slice(0, 8),
    name: p.name,
    phone: p.phone || '—',
    what: what(p),
    purpose: p.purpose,
    purposeLabel: PURPOSE_LABEL[p.purpose],
    status: p.status,
    statusLabel: stuck ? 'Needs attention' : STATUS_LABEL[p.status],
    amount: amountOf(p.amount),
    amountRaw: p.amount,
    when: when(p.paidAt ?? p.createdAt, startOfToday),
    at: p.paidAt ?? p.createdAt,
    providerRef: p.providerRef,
    note: p.failureReason,
    stuck,
  };
}

/**
 * The whole screen, from the rows.
 *
 * The readings are counted here rather than queried, on the rule the roster
 * already follows: nothing on this screen can disagree with the ledger under
 * it, because there is nothing left for it to disagree with.
 */
export function buildTakings(src: TakingsSource): Takings {
  const entries = src.payments
    .map((p) => toEntry(p, src.startOfToday))
    .sort((a, b) => b.at - a.at);

  const settled = src.payments.filter((p) => p.status === 'successful');
  const today = sum(settled.filter((p) => (p.paidAt ?? 0) >= src.startOfToday));
  const week = sum(settled.filter((p) => (p.paidAt ?? 0) >= src.startOfWeek));

  // Money that started and did not arrive. Worth a reading of its own: a
  // rising number here is a broken checkout, not unlucky players.
  const lost = src.payments.filter(
    (p) => (p.status === 'failed' || p.status === 'abandoned') && p.createdAt >= src.startOfWeek,
  );

  const attention = entries.filter((e) => e.stuck).sort((a, b) => a.at - b.at);
  const owed = src.owedOnCourts + src.owedOnMemberships;

  const readings: Reading[] = [
    {
      label: 'Taken today',
      value: `TSh ${short(today)}`,
      detail: `${settled.filter((p) => (p.paidAt ?? 0) >= src.startOfToday).length} payments`,
    },
    {
      label: 'This week',
      value: `TSh ${short(week)}`,
      detail: `${settled.filter((p) => (p.paidAt ?? 0) >= src.startOfWeek).length} payments`,
    },
    {
      label: 'Still owed',
      value: `TSh ${short(owed)}`,
      detail: `${short(src.owedOnCourts)} courts · ${short(src.owedOnMemberships)} members`,
      accent: owed > 0,
    },
    // The one reading that is a problem rather than a fact — so it takes the
    // accent, and only when there is something in it.
    attention.length > 0
      ? {
          label: 'Needs attention',
          value: String(attention.length),
          detail: 'paid, not delivered',
          accent: true,
        }
      : {
          label: 'Did not complete',
          value: String(lost.length),
          detail: 'this week',
          accent: false,
        },
  ];

  return {
    readings,
    attention,
    entries,
    purposes: unique(entries.map((e) => e.purposeLabel)),
    statuses: unique(entries.map((e) => e.statusLabel)),
  };
}

function sum(rows: Payment[]): number {
  return rows.reduce((total, p) => total + p.amount, 0);
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}
