'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import type { Column, FootTone, Lead } from '@/lib/admin/leads';
import { useLeadChanges } from '@/hooks/use-lead-changes';
import { board as boardCache, type Board, type BoardFilters } from '@/lib/queries/leads';

/**
 * The pipeline. Five stages, each a recessed lane of white cards.
 *
 * Served from what the page already fetched, and re-fetched on its own key
 * afterwards — see src/lib/queries/leads.ts for why this one is allowed to go
 * stale faster than the roster: a lead replying is what opens the 24-hour
 * window the cards count down, and it can happen while the screen is open.
 */
export default function LeadBoard({
  initial,
  filters,
}: {
  initial: Board;
  filters: BoardFilters;
}) {
  const { data } = useQuery({ ...boardCache.options(filters), initialData: initial });

  // Any change anywhere in the pipeline redraws the board.
  useLeadChanges(null);

  return (
    <section className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-[26px] font-semibold leading-8 tracking-[-0.02em] text-pine">
            Where everyone stands
          </h2>
          <p className="text-[13px] leading-4 text-neutral-500">
            {data.total === 0
              ? filters.campaign
                ? `Nothing on ${filters.campaign} yet. Clear the campaign filter to see the rest.`
                : 'No leads yet. Add one, or wait for the first WhatsApp message to arrive.'
              : `Open a lead to read the conversation and reply. The footer of each card says whether a reply is still free.${
                  data.lost ? ` ${data.lost} lost, not drawn.` : ''
                }`}
          </p>
        </div>
        {/* Counted from the messages table — see `buildMeter`. */}
        <div className="flex shrink-0 flex-wrap gap-5 rounded-[10px] bg-neutral-100 px-4 py-[10px]">
          {data.meter.map((item, i) => (
            <div key={item.label} className="flex gap-5">
              {i > 0 && <span className="w-px shrink-0 bg-neutral-300" />}
              <div className="flex flex-col gap-[3px]">
                <span className="font-sans text-[11px] font-semibold uppercase leading-[14px] tracking-[0.12em] text-neutral-400">
                  {item.label}
                </span>
                <span
                  className={`font-sans text-[13px] font-semibold leading-4 ${
                    item.accent ? 'text-clay' : 'text-pine'
                  }`}
                >
                  {item.value}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-[14px] lg:flex-row">
        {data.columns.map((column) => (
          <Lane key={column.stageKey} column={column} />
        ))}
      </div>
    </section>
  );
}

function Lane({ column }: { column: Column }) {
  return (
    <div className="flex min-w-0 grow basis-0 flex-col gap-[10px] rounded-[14px] bg-neutral-100 px-3 py-[14px]">
      <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-0.5 pb-2">
        <span className="text-[11px] font-bold leading-[14px] tracking-[0.1em] text-pine">
          {column.stage}
        </span>
        <span className="text-[15px] font-semibold leading-[18px] text-pine">{column.count}</span>
      </div>
      {column.leads.length === 0 ? (
        <p className="px-0.5 py-1 text-[12px] leading-4 text-neutral-400">Nobody here.</p>
      ) : (
        column.leads.map((lead) => <LeadCard key={lead.id} lead={lead} />)
      )}
    </div>
  );
}

const footInk: Record<FootTone, string> = {
  free: 'text-pine',
  overdue: 'text-clay-ink',
  money: 'text-neutral-900',
  plain: 'text-neutral-600',
};

function LeadCard({ lead }: { lead: Lead }) {
  return (
    <Link
      href={`/admin/leads/${lead.id}`}
      className="flex flex-col gap-[9px] rounded-lg bg-white p-[13px] transition-shadow hover:shadow-[0_1px_6px_rgba(0,0,0,0.08)]"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 text-[14px] font-semibold leading-[18px] text-pine">{lead.name}</h3>
        <span className="shrink-0 text-[11px] font-semibold leading-[14px] text-neutral-400">
          {lead.age}
        </span>
      </div>
      <p className="line-clamp-3 text-[12px] leading-[17px] text-neutral-600">{lead.note}</p>
      <div className="flex">
        <span className="flex items-center gap-[5px] rounded-md bg-neutral-100 px-2 py-1">
          <svg width="10" height="10" viewBox="0 0 10 10" className="shrink-0" aria-hidden>
            <rect
              x="0.7"
              y="0.7"
              width="8.6"
              height="8.6"
              rx="2.6"
              fill="none"
              stroke="#7A857C"
              strokeWidth="1.2"
            />
            <circle cx="5" cy="5" r="2.1" fill="none" stroke="#7A857C" strokeWidth="1.2" />
          </svg>
          <span className="text-[10px] font-semibold leading-3 tracking-[0.04em] text-neutral-600">
            {lead.source}
          </span>
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 pt-[3px]">
        <span
          className={`min-w-0 truncate text-[12px] font-semibold leading-4 ${footInk[lead.tone]}`}
        >
          {lead.foot}
        </span>
        <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-neutral-100 text-[9px] font-semibold leading-3 text-neutral-600">
          {lead.owner}
        </span>
      </div>
    </Link>
  );
}
