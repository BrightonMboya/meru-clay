import type { Entry } from '@/lib/admin/desk';
import { CLOSE_MIN, OPEN_MIN, fmtTime24 } from '@/lib/time';

/**
 * The day, drawn to scale: one pixel per minute, 06:00 at the top, 21:00 at
 * the bottom. That is the whole layout model — every block is positioned by
 * `top: start - OPEN_MIN` and sized by its duration, so two bookings can never
 * disagree with the clock down the side, and an hour always looks like an
 * hour.
 */
const MINUTES = CLOSE_MIN - OPEN_MIN;

/** Minutes from midnight -> pixels down the track. */
const y = (minute: number) => minute - OPEN_MIN;

/** Hours to label down the gutter, 06:00 … 21:00 inclusive. */
const hours = Array.from({ length: MINUTES / 60 + 1 }, (_, i) => OPEN_MIN + i * 60);

/**
 * A player on the court, hatched in clay. One look says "this hour is spoken
 * for", which is the only question the board is ever asked from across the
 * room — whether the hour is still settling is a detail the block carries in
 * its dashed edge, not a second colour.
 */
const BOOKED =
  'border border-clay/45 bg-clay/[0.12] bg-[repeating-linear-gradient(45deg,rgba(158,67,39,0.15)_0_6px,transparent_6px_12px)]';

const legend = [
  {
    label: 'Booked',
    swatch:
      'border border-clay/50 bg-clay/[0.14] bg-[repeating-linear-gradient(45deg,rgba(158,67,39,0.4)_0_3px,transparent_3px_6px)]',
  },
  { label: 'Club class', swatch: 'bg-[#2C4A36]' },
  { label: 'Watering', swatch: 'bg-neutral-500/20 border border-neutral-500/35' },
  {
    label: 'Court closed',
    swatch:
      'bg-[repeating-linear-gradient(45deg,#3C3F38_0_3px,transparent_3px_6px)] border border-neutral-900/30',
  },
  { label: 'Too dark to play', swatch: 'bg-neutral-900/12 border border-neutral-900/25' },
];

export default function DayTimeline({
  entries,
  now,
  courts,
  onPick,
}: {
  entries: Entry[];
  /** Minutes from local midnight; drives the now-line. */
  now: number;
  courts: { id: number; name: string; note: string }[];
  /**
   * Called with a block the operator clicked. Only bookings and closures are
   * actionable — a class or the watering slot is not something the desk
   * decides, so those stay inert however they are clicked.
   */
  onPick?: (entry: Entry) => void;
}) {
  const inHours = now >= OPEN_MIN && now <= CLOSE_MIN;

  return (
    <section className="flex w-full min-w-0 flex-col xl:flex-1">
      {/* Court headers, sitting directly on top of their track */}
      <div className="flex w-full gap-[14px]">
        <div className="w-[54px] shrink-0" />
        {courts.map((court) => (
          <div
            key={court.id}
            className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-t-[10px] bg-pine px-4 py-[11px]"
          >
            <span className="shrink-0 whitespace-nowrap text-[18px] font-medium leading-[22px] text-white">
              {court.name}
            </span>
            {/* The court's name always wins the space; the lighting note is
                the part that gives way when the column is narrow. */}
            <span className="truncate text-right text-[11px] font-bold leading-[14px] tracking-[0.12em] text-[#9AAAA1]">
              {court.note}
            </span>
          </div>
        ))}
      </div>

      {/* The grid itself */}
      <div className="relative flex w-full gap-[14px]">
        {/* Hour gutter */}
        <div className="relative w-[54px] shrink-0" style={{ height: MINUTES }}>
          {hours.map((hour) => (
            <span
              key={hour}
              className="absolute right-0 text-[11px] font-semibold leading-[14px] text-neutral-500"
              // -7px lifts the label so its centre sits on the hour, not below it.
              style={{ top: y(hour) - 7 }}
            >
              {fmtTime24(hour)}
            </span>
          ))}
        </div>

        {/* One track per court */}
        {courts.map((court) => (
          <div
            key={court.id}
            className="relative min-w-0 flex-1 rounded-b-[10px] border border-pine/[0.14] bg-neutral-50"
            style={{ height: MINUTES }}
          >
            {entries
              .filter((e) => e.court === court.id)
              .map((entry) => (
                <Block key={entry.id} entry={entry} onPick={onPick} />
              ))}
          </div>
        ))}

        {/* Now. Drawn over both tracks, and tagged in the gutter so the time
            is readable without counting rows. */}
        {inHours && (
          <>
            <div
              className="pointer-events-none absolute left-[54px] right-0 h-0.5 bg-clay"
              style={{ top: y(now) - 1 }}
              aria-hidden
            />
            <div
              className="absolute left-0 flex h-[19px] w-12 items-center justify-center rounded-[5px] bg-clay"
              style={{ top: y(now) - 9 }}
            >
              <span className="text-[10px] font-bold leading-3 tracking-[0.04em] text-white">
                {fmtTime24(now)}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Legend */}
      <div className="mt-5 flex w-full flex-wrap items-center gap-x-6 gap-y-3 border-t border-pine/[0.13] pt-[18px]">
        {legend.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <span className={`h-[13px] w-[13px] shrink-0 rounded-[4px] ${item.swatch}`} />
            <span className="text-[13px] leading-4 text-neutral-600">{item.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * One block on a track. The 1px top offset and 3px off the height are what
 * give touching bookings a hairline between them without overlapping the
 * minute they actually end.
 */
function Block({ entry, onPick }: { entry: Entry; onPick?: (entry: Entry) => void }) {
  const top = y(entry.start) + 1;
  const actionable = Boolean(onPick) && (entry.kind === 'hire' || entry.kind === 'hold' || entry.kind === 'closed');
  // Never let a late block spill past the close of play.
  const height = Math.min(entry.end, CLOSE_MIN) - entry.start - 3;

  // Dusk is not an event on the court, it is the end of the court's day —
  // so it fills the column edge to edge rather than insetting like a booking.
  if (entry.kind === 'dark') {
    return (
      <div
        className="absolute inset-x-0 bottom-0 flex items-center justify-center rounded-b-[9px] border-t border-dashed border-neutral-900/25 bg-neutral-900/[0.07]"
        style={{ top: y(entry.start) }}
      >
        <span className="px-3 text-center text-[11px] font-bold leading-[14px] tracking-[0.14em] text-neutral-500">
          {entry.title}
        </span>
      </div>
    );
  }

  if (entry.kind === 'closed') {
    return (
      <button
        type="button"
        onClick={actionable ? () => onPick?.(entry) : undefined}
        disabled={!actionable}
        title={actionable ? 'Reopen this court' : undefined}
        className="absolute left-[5px] right-[5px] flex items-center justify-between gap-2 overflow-hidden rounded-md border border-neutral-900/30 bg-neutral-900/[0.05] bg-[repeating-linear-gradient(45deg,rgba(19,39,29,0.13)_0_5px,transparent_5px_10px)] px-3 text-left enabled:hover:bg-neutral-900/[0.1]"
        style={{ top, height }}
      >
        <span className="truncate text-[11px] font-bold leading-[14px] tracking-[0.11em] text-neutral-600">
          {entry.title}
        </span>
        {actionable && (
          <span className="shrink-0 text-[10px] font-bold tracking-[0.08em] text-neutral-500">
            REOPEN
          </span>
        )}
      </button>
    );
  }

  if (entry.kind === 'watering') {
    return (
      <div
        className="absolute left-[5px] right-[5px] flex items-center rounded-md border border-neutral-500/35 bg-neutral-500/12 px-3"
        style={{ top, height }}
      >
        <span className="text-[11px] font-bold leading-[14px] tracking-[0.11em] text-neutral-600">
          {entry.title}
        </span>
      </div>
    );
  }

  const skin =
    entry.kind === 'class'
      ? 'bg-[#2C4A36]'
      : entry.kind === 'hold'
        ? // Dashed on three sides, solid on the left: it is a real claim on the
          // court, but not a settled one.
          `${BOOKED} border-dashed [border-left-style:solid]`
        : BOOKED;

  const titleColor = entry.kind === 'class' ? 'text-white' : 'text-clay-ink';
  const detailColor = entry.kind === 'class' ? 'text-[#B4C0B8]' : 'text-clay-ink/80';

  const Tag = actionable ? 'button' : 'div';

  return (
    <Tag
      {...(actionable
        ? {
            type: 'button' as const,
            onClick: () => onPick?.(entry),
            title: 'Open this booking',
          }
        : {})}
      className={`absolute left-[5px] right-[5px] flex items-center justify-between gap-[10px] overflow-hidden rounded-lg px-3 py-2 text-left ${skin} ${
        actionable ? 'cursor-pointer hover:brightness-[0.97]' : ''
      }`}
      style={{ top, height }}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className={`truncate text-[14px] font-semibold leading-[18px] ${titleColor}`}>
          {entry.title}
        </span>
        <span className={`truncate text-[12px] leading-4 ${detailColor}`}>{entry.detail}</span>
      </div>
      {entry.badge && (
        <span
          className={`shrink-0 rounded-full px-[9px] py-1 ${
            entry.kind === 'class' ? 'bg-cream/15' : 'bg-clay'
          }`}
        >
          <span
            className={`text-[10px] font-bold leading-3 ${
              entry.kind === 'class'
                ? 'tracking-[0.1em] text-neutral-200'
                : 'tracking-[0.06em] text-white'
            }`}
          >
            {entry.badge}
          </span>
        </span>
      )}
    </Tag>
  );
}
