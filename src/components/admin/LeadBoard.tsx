'use client';

import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDndContext,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Search, errorText } from '@/components/admin/ui';
import { useLeadChanges } from '@/hooks/use-lead-changes';
import type { Column, FootTone, Lead } from '@/lib/admin/leads';
import { LANE_PAGE, isStage, type LaneLimits, type LeadStage } from '@/lib/pipeline';
import {
  board as boardCache,
  moveLead,
  moveOnBoard,
  type Board,
  type BoardFilters,
} from '@/lib/queries/leads';

/**
 * The pipeline. Five stages, each a recessed lane of white cards, and the
 * cards can be dragged between them.
 *
 * Served from what the page already fetched, and re-fetched on its own key
 * afterwards — see src/lib/queries/leads.ts for why this one is allowed to go
 * stale faster than the roster: a lead replying is what opens the 24-hour
 * window the cards count down, and it can happen while the screen is open.
 *
 * ── What a drag does, and what it deliberately does not ──────────────────
 *
 * Dropping a card in another lane is exactly the PATCH the stage picker on
 * the lead's own page sends, so the two cannot drift: one endpoint, one
 * broadcast, every other open screen redrawn. The drop is optimistic and
 * rolls back if the server refuses.
 *
 * Cards cannot be reordered *within* a lane, and that is on purpose. The lane
 * has an order of its own and it is not arbitrary — see `urgency` in
 * src/lib/admin/leads.ts — so a hand-sorted lane would look right until the
 * next poll and then snap back. Rather than offer a gesture that quietly
 * undoes itself, the board only offers the move it can actually keep.
 *
 * Dragging is a mouse-and-touch gesture; there is no keyboard drag. That is
 * not an oversight either — the same move is a labelled `<select>` on the
 * lead's page, which is a better keyboard and screen-reader path than
 * nudging a card with the arrow keys would ever be.
 *
 * ── At several hundred leads ─────────────────────────────────────────────
 *
 * A lane draws a page and says how many more it is holding. Nothing here
 * would have fallen over at seven hundred leads, but the screen would: the
 * payload was 1.5MB, the board was forty screens tall, and the six people
 * who were actually waiting for a reply were somewhere in the middle of it.
 * Searching and the owner filter go to the server for the same reason — the
 * lead being looked for is usually not one of the cards on screen.
 */
export default function LeadBoard({
  initial,
  scope,
}: {
  initial: Board;
  /** What the page's URL fixes. Everything else is this screen's own. */
  scope: Pick<BoardFilters, 'campaign' | 'days'>;
}) {
  const qc = useQueryClient();

  // The campaign and the window come from the page's URL; these three are the
  // screen's own and live here, because the board is the only thing they
  // change and a reload should not remember a half-typed search.
  const [search, setSearch] = useState('');
  const [owner, setOwner] = useState<string | null>(null);
  const [limits, setLimits] = useState<LaneLimits>({});

  const filters: BoardFilters = {
    ...scope,
    // Typing must not fire a request per keystroke.
    search: useDebounced(search.trim(), 300) || null,
    owner,
    limits,
  };

  const move = useMutation({
    mutationFn: ({ id, to }: { id: number; to: LeadStage }) => moveLead(id, to),

    // The card has to land where it was dropped, now — a card that hovers in
    // its old lane until the round trip finishes reads as a board that did
    // not hear you.
    onMutate: async ({ id, to }) => {
      const key = boardCache.key(filters);
      await qc.cancelQueries({ queryKey: key });
      const before = qc.getQueryData<Board>(key);
      if (before) qc.setQueryData<Board>(key, moveOnBoard(before, id, to));
      return { key, before };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.before) qc.setQueryData(ctx.key, ctx.before);
    },
    // The bare key is a prefix, so every filtered board refetches, not just
    // the one that was dragged on.
    onSettled: () => qc.invalidateQueries({ queryKey: boardCache.key() }),
  });

  const sensors = useSensors(
    // Six pixels of travel before it counts as a drag, so a click on a card
    // still opens the lead instead of picking it up.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // On a phone the lane scrolls under the finger; a card is picked up by
    // holding it, not by the first pixel of a swipe.
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over) return;

    const to = String(over.id);
    if (!isStage(to)) return;

    // Read the board from the cache rather than from a render's closure: the
    // drag may have outlived the render it started in.
    const current = qc.getQueryData<Board>(boardCache.key(filters));
    const id = Number(active.id);

    // Dropping a card back where it came from is not a move.
    if (!current || stageOf(current, id) === to) return;

    move.mutate({ id, to });
  }

  return (
    // `id` is not decoration. dnd-kit generates one for the `aria-describedby`
    // it puts on every draggable, and a generated one differs between the
    // server render and the first client render — which React reports as a
    // hydration mismatch. Naming it makes both sides agree.
    <DndContext
      id="lead-board"
      sensors={sensors}
      // Pointer-inside beats rectangle-overlap on a board of tall lanes: a
      // big card overlaps two of them at once, and the one the cursor is in
      // is the one the hand means.
      collisionDetection={pointerWithin}
      // Lanes change height as cards leave them, and the "lost" strip is not
      // in the document until a drag begins. Both need re-measuring while
      // the drag is running.
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragEnd={onDragEnd}
    >
      <Pipeline
        initial={initial}
        filters={filters}
        untouched={!filters.search && !owner && Object.keys(limits).length === 0}
        search={search}
        onSearch={setSearch}
        owner={owner}
        onOwner={setOwner}
        onMore={(stage, to) => setLimits((l) => ({ ...l, [stage]: to }))}
        failure={move.isError ? errorText(move.error, 'Could not move them.') : null}
      />
    </DndContext>
  );
}

/** A value that stops changing once the typing stops. */
function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

/**
 * Everything the board draws, inside the drag context.
 *
 * It lives in here rather than in `LeadBoard` so that what is being dragged
 * is read from dnd-kit itself with `useDndContext`, and never mirrored into
 * a piece of our own state. A mirror has to be cleared by a handler, and a
 * handler that does not run — dnd-kit skips `onDragEnd` for a drag that
 * starts and finishes inside one frame — would leave the board stuck looking
 * as though something were still in the air.
 */
function Pipeline({
  initial,
  filters,
  untouched,
  search,
  onSearch,
  owner,
  onOwner,
  onMore,
  failure,
}: {
  initial: Board;
  filters: BoardFilters;
  untouched: boolean;
  search: string;
  onSearch: (v: string) => void;
  owner: string | null;
  onOwner: (v: string | null) => void;
  onMore: (stage: LeadStage, to: number) => void;
  failure: string | null;
}) {
  const { active } = useDndContext();

  const { data, isPlaceholderData } = useQuery({
    ...boardCache.options(filters),
    // The server-rendered board answers the unfiltered question only. Seeding
    // a searched key with it would show the whole pipeline as the result of
    // a search; `keepPreviousData` holds the last board on screen instead
    // while the new one is fetched, so the lanes never blink empty.
    initialData: untouched ? initial : undefined,
    placeholderData: keepPreviousData,
    // A poll landing mid-drag would pull the lane out from under the cursor.
    // Half a minute of staleness is much the cheaper of the two.
    refetchInterval: active ? false : 30_000,
  });

  // Any change anywhere in the pipeline redraws the board.
  useLeadChanges(null);

  const view = data ?? initial;
  const held = active ? findLead(view, Number(active.id)) : null;
  const filtered = Boolean(filters.search || owner);

  return (
    <section className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-[26px] font-semibold leading-8 tracking-[-0.02em] text-pine">
            Where everyone stands
          </h2>
          <p className="text-[13px] leading-4 text-neutral-500">
            <Subtitle board={view} filters={filters} filtered={filtered} />
          </p>
        </div>
        {/* Counted from the messages table — see `buildMeter`. */}
        <div className="flex shrink-0 flex-wrap gap-5 rounded-[10px] bg-neutral-100 px-4 py-[10px]">
          {view.meter.map((item, i) => (
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

      {/* Searching goes to the server, not over the cards on screen: past a
          page per lane the person being looked for is usually not one of
          them, and a box that only searched what was already drawn would be
          the most quietly misleading control on the screen. */}
      <div className="flex flex-wrap items-center gap-3">
        <Search
          placeholder="Search a name, number or message"
          width={288}
          value={search}
          onChange={onSearch}
        />
        {view.owners.length > 0 && (
          <span className="relative inline-flex h-[34px] shrink-0 items-center rounded-full border border-neutral-200 bg-white pl-[15px] pr-[30px] transition-colors focus-within:border-neutral-400 hover:border-neutral-300">
            <select
              aria-label="Owner"
              value={owner ?? ''}
              onChange={(e) => onOwner(e.target.value || null)}
              className="cursor-pointer appearance-none bg-transparent text-[13px] font-semibold leading-4 text-pine outline-none"
            >
              <option value="">Anyone</option>
              {view.owners.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            <svg
              width="9"
              height="6"
              viewBox="0 0 9 6"
              aria-hidden
              className="pointer-events-none absolute right-[13px]"
            >
              <path d="M1 1.2L4.5 4.6L8 1.2" fill="none" stroke="#5A6559" strokeWidth="1.3" />
            </svg>
          </span>
        )}
        {filtered && (
          <button
            type="button"
            onClick={() => {
              onSearch('');
              onOwner(null);
            }}
            className="text-[12px] font-semibold leading-4 text-neutral-500 underline-offset-2 hover:text-pine hover:underline"
          >
            Clear
          </button>
        )}
        {/* Only while a *new* question is being answered and the old board
            is still on screen — never during the routine 30-second poll,
            which would otherwise claim to be searching twice a minute. */}
        {isPlaceholderData && (
          <span className="text-[12px] leading-4 text-neutral-400">Searching…</span>
        )}
      </div>

      {failure && (
        <p
          role="alert"
          className="rounded-[10px] bg-clay-wash px-4 py-3 text-[13px] leading-[19px] text-clay-ink"
        >
          {failure} They have been put back where they were.
        </p>
      )}

      <div className="flex flex-col gap-[14px] lg:flex-row">
        {view.columns.map((column) => (
          <Lane
            key={column.stageKey}
            column={column}
            dragging={held !== null}
            onMore={() => onMore(column.stageKey, column.leads.length + LANE_PAGE)}
          />
        ))}
      </div>

      {held && <LostZone name={held.name} />}

      {/* The card that follows the cursor. Rendered outside the lanes so it
          is never clipped by one. */}
      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2,0,0,1)' }}>
        {held && <Card lead={held} held />}
      </DragOverlay>
    </section>
  );
}

/** The line under the heading — what is on screen and what is not. */
function Subtitle({
  board,
  filters,
  filtered,
}: {
  board: Board;
  filters: BoardFilters;
  filtered: boolean;
}) {
  if (board.total === 0) {
    return filters.campaign
      ? `Nothing on ${filters.campaign} yet. Clear the campaign filter to see the rest.`
      : 'No leads yet. Add one, or wait for the first WhatsApp message to arrive.';
  }

  if (filtered) {
    return board.matched === 0
      ? 'Nobody matches. Try part of a name, or the last few digits of a number.'
      : `${board.matched} of ${board.total} leads match.`;
  }

  return `Drag a card to move someone along. Open one to read the conversation and reply.${
    board.lost ? ` ${board.lost} lost, not drawn.` : ''
  }`;
}

/** Which lane a lead is currently drawn in, or null if it is not drawn. */
function stageOf(board: Board, id: number): LeadStage | null {
  for (const column of board.columns) {
    if (column.leads.some((lead) => lead.id === id)) return column.stageKey;
  }
  return null;
}

function findLead(board: Board, id: number): Lead | null {
  for (const column of board.columns) {
    const found = column.leads.find((lead) => lead.id === id);
    if (found) return found;
  }
  return null;
}

/* --------------------------------------------------------------- the lanes */

function Lane({
  column,
  dragging,
  onMore,
}: {
  column: Column;
  dragging: boolean;
  onMore: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.stageKey });
  const hidden = column.count - column.leads.length;

  return (
    <div
      ref={setNodeRef}
      className={`flex min-w-0 grow basis-0 flex-col gap-[10px] rounded-[14px] px-3 py-[14px] transition-colors ${
        isOver ? 'bg-neutral-200 ring-2 ring-inset ring-pine/30' : 'bg-neutral-100'
      }`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-0.5 pb-2">
        <span className="text-[11px] font-bold leading-[14px] tracking-[0.1em] text-pine">
          {column.stage}
        </span>
        {/* The whole lane, not the part of it drawn. */}
        <span className="text-[15px] font-semibold leading-[18px] text-pine">{column.count}</span>
      </div>

      {column.leads.length === 0 ? (
        <p
          className={`px-0.5 py-1 text-[12px] leading-4 ${
            dragging ? 'text-neutral-500' : 'text-neutral-400'
          }`}
        >
          {dragging ? 'Drop here.' : 'Nobody here.'}
        </p>
      ) : (
        // The lane scrolls inside itself. Five lanes of two hundred cards
        // would otherwise make the page forty screens tall and the lane
        // headings unreachable from the bottom of it.
        <div className="flex max-h-[620px] flex-col gap-[10px] overflow-y-auto overscroll-contain pr-0.5">
          {column.leads.map((lead) => (
            <DraggableCard key={lead.id} lead={lead} />
          ))}

          {hidden > 0 && (
            <button
              type="button"
              onClick={onMore}
              className="rounded-lg border border-dashed border-neutral-300 py-[9px] text-[12px] font-semibold leading-4 text-neutral-500 transition-colors hover:border-neutral-400 hover:text-pine"
            >
              Show {Math.min(hidden, LANE_PAGE)} more
              {hidden > LANE_PAGE ? ` of ${hidden}` : ''}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Where a lead goes when they stop being one.
 *
 * `lost` is a real stage with no column — a lane of dead leads would be a
 * fifth of the board earning nothing — so it is a strip that only exists
 * while something is in the air. It sends the same PATCH as any other lane.
 */
function LostZone({ name }: { name: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'lost' satisfies LeadStage });

  return (
    <div
      ref={setNodeRef}
      className={`flex items-center justify-center rounded-[14px] border border-dashed py-4 text-[12px] font-semibold leading-4 transition-colors ${
        isOver ? 'border-clay bg-clay-wash text-clay-ink' : 'border-neutral-300 text-neutral-400'
      }`}
    >
      {isOver ? `Mark ${name} lost` : 'Drag here to mark lost'}
    </div>
  );
}

/* --------------------------------------------------------------- the cards */

const footInk: Record<FootTone, string> = {
  free: 'text-pine',
  overdue: 'text-clay-ink',
  money: 'text-neutral-900',
  plain: 'text-neutral-600',
};

function DraggableCard({ lead }: { lead: Lead }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id });

  return (
    <Link
      ref={setNodeRef}
      href={`/admin/leads/${lead.id}`}
      {...listeners}
      // dnd-kit's own attributes would make this anchor a `role="button"`,
      // which would cost the card everything a link is good at — middle
      // click, open in a new tab, the status bar saying where it goes. Only
      // the description it generates is worth keeping.
      aria-describedby={attributes['aria-describedby']}
      aria-roledescription="Draggable card"
      // The card keeps its place in the lane while it is in the air, faded,
      // so the other cards do not shuffle around underneath the cursor.
      className={`group block shrink-0 rounded-lg transition-shadow ${
        isDragging ? 'opacity-25' : 'hover:shadow-[0_1px_6px_rgba(0,0,0,0.08)]'
      }`}
    >
      <Card lead={lead} />
    </Link>
  );
}

/** The card itself — drawn identically in the lane and under the cursor. */
function Card({ lead, held = false }: { lead: Lead; held?: boolean }) {
  return (
    <div
      className={`flex cursor-grab flex-col gap-[9px] rounded-lg bg-white p-[13px] ${
        held ? 'rotate-1 cursor-grabbing shadow-[0_8px_24px_rgba(0,0,0,0.16)]' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 text-[14px] font-semibold leading-[18px] text-pine">{lead.name}</h3>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="text-[11px] font-semibold leading-[14px] text-neutral-400">
            {lead.age}
          </span>
          {/* The affordance. Nothing is dragged by it — the whole card is
              draggable — it is there to say that the card can be. */}
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            aria-hidden
            className={`shrink-0 transition-opacity ${
              held ? 'opacity-60' : 'opacity-0 group-hover:opacity-50'
            }`}
          >
            <g fill="#7A857C">
              <circle cx="3.5" cy="2" r="0.9" />
              <circle cx="6.5" cy="2" r="0.9" />
              <circle cx="3.5" cy="5" r="0.9" />
              <circle cx="6.5" cy="5" r="0.9" />
              <circle cx="3.5" cy="8" r="0.9" />
              <circle cx="6.5" cy="8" r="0.9" />
            </g>
          </svg>
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
    </div>
  );
}
