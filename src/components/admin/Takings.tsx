'use client';

import { useState } from 'react';
import {
  Badge,
  Cell,
  Chip,
  Eyebrow,
  Head,
  NameCell,
  Readings,
  Row,
  Screen,
  Search,
  Table,
  type BadgeTone,
  type Col,
} from '@/components/admin/ui';
import type { Entry, Takings as TakingsData } from '@/lib/admin/takings';
import type { PaymentStatus } from '@/lib/checkout';

const cols: Col[] = [
  { head: 'WHO', min: 180 },
  { head: 'FOR', w: 150 },
  { head: 'AMOUNT', w: 96, align: 'right' },
  { head: 'STATUS', w: 148 },
  { head: 'WHEN', w: 72 },
  { head: 'REFERENCE', w: 150 },
];

/**
 * Only two states are worth colouring: money that arrived, and money that is
 * stuck. A failed payment is a fact about somebody's card, not a problem the
 * club has to act on — the player simply tries again.
 */
const tone: Record<PaymentStatus, BadgeTone> = {
  pending: 'stone',
  processing: 'stone',
  successful: 'green',
  failed: 'grey',
  abandoned: 'grey',
  refunded: 'stone',
};

/**
 * Takings.
 *
 * Every figure on this screen is counted from the rows below it — see the
 * note at the top of src/lib/admin/takings.ts — and the filtering happens in
 * the browser over the payload the server already sent, on the same
 * reasoning as the roster: eight weeks of a two-court club is a few hundred
 * rows, and a round trip per keystroke would buy nothing.
 *
 * It does not poll. A payment that lands while somebody is reading the
 * screen shows up on the next load, and the thing that must not wait —
 * money in with nothing delivered — is pushed to the club by WhatsApp and
 * email the moment it happens, not discovered by staring here.
 */
export default function Takings({ initial }: { initial: TakingsData }) {
  const [query, setQuery] = useState('');
  const [purpose, setPurpose] = useState<string>('All');

  const shown = initial.entries.filter(
    (e) => (purpose === 'All' || e.purposeLabel === purpose) && matches(e, query),
  );

  const total = shown
    .filter((e) => e.status === 'successful')
    .reduce((sum, e) => sum + e.amountRaw, 0);

  return (
    <Screen>
      <Head
        title="Takings"
        blurb="What the courts and the memberships brought in, and what is still owed."
      />

      <Readings readings={initial.readings} />

      {/*
        Needs attention, first and only when there is something in it. This is
        the one part of the screen with a deadline: each row is money the club
        has taken and not delivered on, and somebody is waiting for a call.
      */}
      {initial.attention.length > 0 && (
        <section className="flex flex-col gap-4 rounded-[10px] border border-clay/30 bg-clay-wash/40 p-5">
          <Eyebrow tone="loud">
            NEEDS ATTENTION · {initial.attention.length}
          </Eyebrow>
          <p className="max-w-[70ch] text-[14px] leading-[21px] text-neutral-600">
            These people paid and the club could not complete it — nearly always a court that was
            taken while they were paying. Refund them, or offer another time. The money is real.
          </p>
          <div className="flex flex-col gap-3">
            {initial.attention.map((e) => (
              <div
                key={e.id}
                className="flex flex-col gap-2 rounded-[8px] border border-clay/25 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-col gap-[3px]">
                  <span className="truncate text-[15px] font-semibold leading-[18px] text-pine">
                    {e.name} · TSh {e.amount}
                  </span>
                  <span className="text-[12px] leading-4 text-neutral-500">
                    {e.note ?? 'Paid, not yet delivered.'}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {e.phone !== '—' && (
                    <a
                      href={`https://wa.me/${e.phone.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex h-[30px] shrink-0 items-center rounded-full border border-neutral-200 px-[13px] text-[12px] font-medium leading-4 text-pine transition-colors hover:bg-neutral-50"
                    >
                      WhatsApp {e.phone}
                    </a>
                  )}
                  <span className="font-mono text-[12px] text-neutral-500">{e.reference}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {['All', ...initial.purposes].map((p) => (
              <Chip key={p} on={p === purpose} onClick={() => setPurpose(p)}>
                {p}
              </Chip>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="shrink-0 text-[13px] leading-4 text-neutral-500">
              {shown.length} shown · TSh {total.toLocaleString('en-US')} taken
            </span>
            <Search placeholder="Name, phone or reference" width={230} value={query} onChange={setQuery} />
          </div>
        </div>

        {shown.length === 0 ? (
          <p className="border-t border-neutral-200 pt-7 text-[15px] leading-[23px] text-neutral-600">
            {initial.entries.length === 0
              ? 'Nothing recorded yet. Every payment the club takes will appear here, settled or not.'
              : 'Nothing matches that.'}
          </p>
        ) : (
          <Table cols={cols}>
            {shown.map((e) => (
              <Row key={e.id}>
                <Cell col={cols[0]}>
                  <NameCell name={e.name} sub={e.phone} />
                </Cell>
                <Cell col={cols[1]}>
                  <span className="truncate text-[14px] leading-[18px] text-neutral-600">
                    {e.what}
                  </span>
                </Cell>
                <Cell col={cols[2]}>
                  <span className="text-[15px] font-semibold leading-[18px] tabular-nums text-pine">
                    {e.amount}
                  </span>
                </Cell>
                <Cell col={cols[3]}>
                  <Badge tone={e.stuck ? 'clay' : tone[e.status]}>{e.statusLabel}</Badge>
                </Cell>
                <Cell col={cols[4]}>
                  <span className="text-[13px] leading-4 tabular-nums text-neutral-500">
                    {e.when}
                  </span>
                </Cell>
                {/*
                  Both references, because they answer different questions.
                  Ours is what the player quotes; the provider's is what finds
                  the transaction in their dashboard to refund it.
                */}
                <Cell col={cols[5]}>
                  <div className="flex min-w-0 flex-col gap-[3px]">
                    <span className="truncate font-mono text-[12px] leading-4 text-neutral-600">
                      {e.reference}
                    </span>
                    {e.providerRef && (
                      <span className="truncate font-mono text-[11px] leading-4 text-neutral-400">
                        {e.providerRef}
                      </span>
                    )}
                  </div>
                </Cell>
              </Row>
            ))}
          </Table>
        )}
      </section>
    </Screen>
  );
}

/**
 * Who a search matches: name, number, either reference.
 *
 * The references are in here because the commonest reason to open this
 * screen is somebody reading a code down the phone.
 */
function matches(e: Entry, needle: string): boolean {
  const q = needle.trim().toLowerCase();
  if (!q) return true;
  return `${e.name} ${e.phone} ${e.reference} ${e.providerRef ?? ''}`.toLowerCase().includes(q);
}
