import {
  Badge,
  Btn,
  Chip,
  Eyebrow,
  Head,
  Screen,
  Segmented,
  icons,
  type BadgeTone,
} from '@/components/admin/ui';
import {
  AWAY,
  CHAMPION,
  DRAWS,
  FEATURED,
  FINAL,
  HOSTED,
  QUARTER_FINALS,
  SEMI_FINALS,
  type AwayTrip,
  type Hosted,
  type Tie,
} from '@/lib/admin/tournaments';

export default function TournamentsPage() {
  return (
    <Screen>
      <Head
        title="Tournaments"
        blurb="What we host on our own clay, and where our players travel to when the club goes on the road."
        actions={
          <>
            <Segmented options={['At the club', 'Away', 'Finished']} chosen="At the club" />
            <Btn variant="primary" icon={icons.plus}>
              Create a tournament
            </Btn>
          </>
        }
      />

      <Featured />
      <Draw />

      <div className="flex flex-col items-start gap-12 xl:flex-row">
        <section className="flex min-w-0 grow basis-0 flex-col gap-4">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="text-[24px] font-semibold leading-[30px] tracking-[-0.02em] text-pine">
              Also on our clay
            </h2>
            <span className="text-[12px] leading-4 text-neutral-500">
              blocks the courts automatically
            </span>
          </div>
          <div className="flex flex-col border-t border-neutral-200">
            {HOSTED.map((event) => (
              <HostedRow key={event.name} event={event} />
            ))}
          </div>
        </section>

        <section className="flex min-w-0 grow basis-0 flex-col gap-4">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="text-[24px] font-semibold leading-[30px] tracking-[-0.02em] text-pine">
              On the road
            </h2>
            <span className="text-[12px] leading-4 text-neutral-500">
              we enter players, club pays half
            </span>
          </div>
          <div className="flex flex-col border-t border-neutral-200">
            {AWAY.map((trip) => (
              <AwayRow key={trip.name} trip={trip} />
            ))}
          </div>
        </section>
      </div>
    </Screen>
  );
}

/**
 * The tournament that is actually happening, given the whole width and the
 * club's one dark surface. Everything else on the screen is a list; this is
 * the thing the club is selling this month.
 */
function Featured() {
  const { entries } = FEATURED;
  const remaining = entries.places - entries.in;

  return (
    <section className="flex flex-col overflow-clip rounded-[20px] bg-pine lg:flex-row">
      <div className="flex min-w-0 grow flex-col gap-5 px-10 py-9">
        <div className="flex flex-wrap items-center gap-[10px]">
          <span className="rounded-full bg-clay px-[11px] py-[5px] text-[10px] font-bold leading-3 tracking-[0.12em] text-cream">
            {FEATURED.state}
          </span>
          <span className="text-[11px] font-semibold leading-[14px] tracking-[0.12em] text-neutral-400">
            {FEATURED.closes}
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <h2 className="text-[46px] font-semibold leading-[48px] tracking-[-0.03em] text-cream">
            {FEATURED.name}
          </h2>
          <p className="text-[17px] font-medium leading-[22px] text-neutral-400">{FEATURED.when}</p>
        </div>
        <p className="max-w-[440px] text-[14px] leading-[22px] text-neutral-300">
          {FEATURED.blurb}
        </p>
        <div className="flex flex-wrap items-center gap-[10px] pt-1">
          <button
            type="button"
            className="rounded-full bg-clay px-[22px] py-3 text-[13px] font-semibold leading-4 text-white transition-colors hover:bg-clay/90"
          >
            Enter a player
          </button>
          {['Open the draw', 'Share on Meta'].map((label) => (
            <button
              key={label}
              type="button"
              className="rounded-full border border-[#3C5244] px-[22px] py-3 text-[13px] font-semibold leading-4 text-cream transition-colors hover:bg-white/5"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* The entry count, on a panel a shade lighter than the card — the one
          number the coach checks every day while entries are open. */}
      <div className="flex shrink-0 flex-col border-t border-[#2A4132] bg-[#17301F] p-9 lg:w-[392px] lg:border-l lg:border-t-0">
        <div className="flex flex-col gap-4">
          <Eyebrow tone="inverse">ENTRIES IN</Eyebrow>
          <div className="flex items-baseline gap-2">
            <span className="text-[56px] font-semibold leading-[56px] tracking-[-0.03em] text-cream">
              {entries.in}
            </span>
            <span className="text-[22px] leading-7 text-[#7E8C81]">/ {entries.places} places</span>
          </div>
          <div className="flex items-center gap-1">
            <span
              className="h-1.5 rounded-full bg-clay"
              style={{ flexGrow: entries.in, flexBasis: 0 }}
            />
            <span
              className="h-1.5 rounded-full bg-[#2A4132]"
              style={{ flexGrow: remaining, flexBasis: 0 }}
            />
          </div>
        </div>
        <dl className="mt-[22px] flex flex-col border-t border-[#2A4132] pt-[22px]">
          {FEATURED.facts.map((fact) => (
            <div key={fact.label} className="flex items-center justify-between gap-4 py-[9px]">
              <dt className="text-[13px] leading-4 text-neutral-400">{fact.label}</dt>
              <dd className="text-right text-[13px] font-semibold leading-4 text-cream">
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/**
 * The draw, left to right: quarters, semis, final, and the player defending
 * the title. Each round's column grows to the same height, so the semis and
 * the final sit centred against the ties that feed them.
 */
function Draw() {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-[26px] font-semibold leading-8 tracking-[-0.02em] text-pine">
            Men&rsquo;s singles draw
          </h2>
          <p className="text-[13px] leading-4 text-neutral-500">
            Seeded on ladder record. Winners drop into the next round automatically once a score is
            confirmed.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {DRAWS.map((draw, i) => (
            <Chip key={draw} on={i === 0}>
              {draw}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-7 rounded-2xl border border-neutral-200 bg-white p-[26px] lg:flex-row">
        <Round label="QUARTER-FINALS · FRI">
          <div className="flex flex-col gap-[14px]">
            {QUARTER_FINALS.map((tie) => (
              <TieCard key={tie.sides[0].name} tie={tie} />
            ))}
          </div>
        </Round>

        <Round label="SEMI-FINALS · SAT">
          <div className="flex grow flex-col justify-around gap-[14px] pb-[22px] pt-2">
            {SEMI_FINALS.map((tie) => (
              <TieCard key={tie.sides[0].name} tie={tie} />
            ))}
          </div>
        </Round>

        <Round label="FINAL · SUN 16:00">
          <div className="flex grow flex-col justify-center pb-[22px]">
            <TieCard tie={FINAL} />
          </div>
        </Round>

        <div className="flex shrink-0 flex-col gap-[14px] lg:w-[236px]">
          <Eyebrow>DEFENDING CHAMPION</Eyebrow>
          <div className="flex grow flex-col justify-center pb-[22px]">
            <div className="flex flex-col gap-3 rounded-xl bg-neutral-100 p-5">
              <svg width="20" height="24" viewBox="0 0 20 24" aria-hidden>
                <g fill="none" stroke="#A3A3A3" strokeWidth="1.4" strokeLinejoin="round">
                  <path d="M4 2h12v6a6 6 0 0 1-12 0V2z" />
                  <path d="M4 4H1.5v2a3.5 3.5 0 0 0 2.9 3.4M16 4h2.5v2a3.5 3.5 0 0 1-2.9 3.4" />
                  <path d="M10 14v4M6.5 22h7M8 18h4l1.5 4h-7L8 18z" />
                </g>
              </svg>
              <span className="text-[20px] font-semibold leading-6 tracking-[-0.015em] text-pine">
                {CHAMPION.name}
              </span>
              <p className="text-[12px] leading-[18px] text-neutral-600">{CHAMPION.blurb}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Round({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 grow basis-0 flex-col gap-[14px]">
      <div className="pb-0.5">
        <Eyebrow>{label}</Eyebrow>
      </div>
      {children}
    </div>
  );
}

/**
 * One tie. The winner's line is the darker of the two, which is all the
 * result the bracket needs to show; a tie nobody has reached yet is dashed.
 */
function TieCard({ tie }: { tie: Tie }) {
  return (
    <div
      className={`flex flex-col overflow-clip rounded-lg border ${
        tie.pending ? 'border-dashed border-neutral-300' : 'border-neutral-200'
      }`}
    >
      {tie.sides.map((side, i) => (
        <div
          key={`${side.name}-${i}`}
          className={`flex items-center gap-[10px] px-3 ${tie.pending ? 'py-[13px]' : 'py-[10px]'} ${
            i > 0
              ? tie.pending
                ? 'border-t border-dashed border-neutral-200'
                : 'border-t border-neutral-200/70'
              : ''
          } ${side.won && side.sets ? 'bg-neutral-50' : ''}`}
        >
          <span
            className={`w-[18px] shrink-0 text-[11px] leading-[14px] text-neutral-400 ${
              side.seed === '—' ? 'font-semibold' : 'font-bold'
            }`}
          >
            {side.seed}
          </span>
          <span
            className={`min-w-0 grow truncate text-[13px] leading-4 ${
              tie.pending
                ? 'text-neutral-400'
                : side.won
                  ? 'font-semibold text-pine'
                  : 'text-neutral-500'
            }`}
          >
            {side.name}
          </span>
          <span className="flex w-11 shrink-0 justify-end">
            {side.sets ? (
              <span
                className={`text-[13px] font-semibold leading-4 tracking-[0.18em] ${
                  side.won ? 'text-pine' : 'text-neutral-400'
                }`}
              >
                {side.sets.join(' ')}
              </span>
            ) : (
              side.note && (
                <span className="text-[11px] leading-[14px] text-neutral-400">{side.note}</span>
              )
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Rows shared by the two schedule lists: a date block, then what it is. */
function ScheduleRow({
  month,
  day,
  name,
  detail,
  accent,
  children,
}: {
  month: string;
  day: string;
  name: string;
  detail: string;
  /** Clay month label — reserved for the one event taking entries. */
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 border-b border-neutral-200/70 px-0.5 py-4">
      <div className="flex w-[52px] shrink-0 flex-col items-center gap-px">
        <span
          className={`text-[10px] font-bold leading-3 tracking-[0.1em] ${
            accent ? 'text-clay' : 'text-neutral-500'
          }`}
        >
          {month}
        </span>
        <span className="text-[22px] font-semibold leading-6 text-pine">{day}</span>
      </div>
      <div className="flex min-w-0 grow flex-col gap-[3px]">
        <span className="truncate text-[15px] font-semibold leading-[18px] text-pine">{name}</span>
        <span className="truncate text-[12px] leading-4 text-neutral-500">{detail}</span>
      </div>
      {children}
    </div>
  );
}

const hostedTone: Record<Hosted['state'], BadgeTone> = {
  OPEN: 'clay',
  PLANNING: 'stone',
  DRAFT: 'stone',
};

function HostedRow({ event }: { event: Hosted }) {
  return (
    <ScheduleRow
      month={event.month}
      day={event.day}
      name={event.name}
      detail={event.detail}
      accent={event.state === 'OPEN'}
    >
      <div className="flex w-[104px] shrink-0">
        <Badge tone={hostedTone[event.state]}>{event.state}</Badge>
      </div>
      <div className="flex w-[78px] shrink-0 justify-end">
        <button
          type="button"
          className="text-[12px] font-semibold leading-4 text-pine underline-offset-4 hover:underline"
        >
          {event.action}
        </button>
      </div>
    </ScheduleRow>
  );
}

function AwayRow({ trip }: { trip: AwayTrip }) {
  return (
    <ScheduleRow month={trip.month} day={trip.day} name={trip.name} detail={trip.detail}>
      <div className="flex w-[118px] shrink-0 items-center">
        {trip.faces.map((initials, i) => (
          <span
            key={`${initials}-${i}`}
            className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border-2 border-white bg-neutral-100 text-[9px] font-semibold leading-3 text-neutral-700 ${
              i > 0 ? '-ml-[7px]' : ''
            }`}
          >
            {initials}
          </span>
        ))}
        <span className="pl-2 text-[12px] leading-4 text-neutral-500">{trip.going}</span>
      </div>
      <div className="flex w-[78px] shrink-0 justify-end">
        <button
          type="button"
          className="text-[12px] font-semibold leading-4 text-pine underline-offset-4 hover:underline"
        >
          {trip.action}
        </button>
      </div>
    </ScheduleRow>
  );
}
