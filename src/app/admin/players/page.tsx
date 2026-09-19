import {
  Avatar,
  Badge,
  Btn,
  Chip,
  Cell,
  Eyebrow,
  Head,
  LEVELS,
  LEVEL_BG,
  LevelDot,
  LevelTag,
  NameCell,
  Row,
  Screen,
  Search,
  Table,
  icons,
  type BadgeTone,
  type Col,
} from '@/components/admin/ui';
import {
  FREE_THIS_WEEK,
  LEVEL_COUNTS,
  MEMBER_COUNT,
  MEMBERSHIPS_DUE,
  PROMOTIONS,
  ROSTER,
  ROSTER_FILTERS,
  type Availability,
  type Player,
} from '@/lib/admin/players';

const cols: Col[] = [
  { head: '', w: 36 },
  { head: 'PLAYER' },
  { head: 'LEVEL', w: 118 },
  { head: 'LADDER', w: 104 },
  { head: 'LAST PLAYED', w: 92 },
  { head: 'AVAILABILITY', w: 152 },
  { head: '', w: 92, align: 'right' },
];

/** Only the unpaid membership is worth colouring; the rest is just a state. */
const availabilityTone: Record<Availability, BadgeTone> = {
  'OPEN TO A GAME': 'grey',
  'WEEKENDS ONLY': 'stone',
  'EVENINGS ONLY': 'stone',
  'JUNIOR SQUAD': 'stone',
  'AWAY · DAR OPEN': 'stone',
  'MEMBERSHIP DUE': 'clay',
};

export default function PlayersPage() {
  return (
    <Screen>
      <Head
        title="Players"
        blurb="Levels are set after a hitting assessment and move with ladder results."
        actions={
          <>
            <Btn icon={icons.download}>Export roster</Btn>
            <Btn icon={icons.list} href="/admin/matches/new">
              Record a result
            </Btn>
            <Btn variant="primary" icon={icons.plus} href="/admin/players/new">
              Add a member
            </Btn>
          </>
        }
      />

      <RosterShape />

      <div className="flex flex-col items-start gap-12 xl:flex-row">
        <div className="flex min-w-0 grow flex-col gap-[18px]">
          <div className="flex flex-wrap items-center gap-2">
            {ROSTER_FILTERS.map((filter, i) => (
              <Chip key={filter.label} count={filter.count} on={i === 0}>
                {filter.label}
              </Chip>
            ))}
            <div className="grow" />
            <Search placeholder="Search a name" />
          </div>

          <Table cols={cols}>
            {ROSTER.map((player) => (
              <PlayerRow key={player.name} player={player} />
            ))}
          </Table>
        </div>

        <aside className="flex w-full shrink-0 flex-col gap-8 xl:w-[340px]">
          <FreeToPlay />
          <MovedUp />
        </aside>
      </div>
    </Screen>
  );
}

/**
 * The roster in one band: how many members there are, how much money is
 * outstanding, and how the club spreads across the six levels.
 */
function RosterShape() {
  return (
    <section className="flex flex-col gap-[18px] border-y border-neutral-200 py-[26px]">
      <div className="flex flex-wrap items-baseline justify-between gap-6">
        <div className="flex items-baseline gap-[10px]">
          <span className="text-[40px] font-semibold leading-[44px] tracking-[-0.02em] text-pine">
            {MEMBER_COUNT}
          </span>
          <span className="font-sans text-[15px] leading-[22px] text-neutral-500">
            members · 4 joined this month
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2 rounded-full bg-clay-wash px-[14px] py-[7px]">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-clay" />
          <span className="text-[13px] font-medium leading-4 text-clay-ink">
            {MEMBERSHIPS_DUE.count} memberships due · {MEMBERSHIPS_DUE.amount}
          </span>
        </div>
      </div>

      <div className="flex h-[10px] w-full gap-1">
        {/* Segments are flex-grown by headcount, so the bar stays honest
            without any arithmetic. */}
        {LEVELS.map((level) => (
          <span
            key={level}
            className={`rounded-[3px] ${LEVEL_BG[level]}`}
            style={{ flexGrow: LEVEL_COUNTS[level], flexBasis: 0 }}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-8">
        <div className="flex flex-wrap items-center gap-[26px]">
          {LEVELS.map((level) => (
            <span key={level} className="flex items-center gap-[7px]">
              <LevelDot level={level} />
              <span className="text-[13px] font-medium leading-4 text-neutral-700">{level}</span>
              <span className="text-[13px] font-semibold leading-4 text-pine">
                {LEVEL_COUNTS[level]}
              </span>
            </span>
          ))}
        </div>
        <span className="shrink-0 text-[12px] leading-4 text-neutral-500">
          a player may challenge one level up
        </span>
      </div>
    </section>
  );
}

function PlayerRow({ player }: { player: Player }) {
  return (
    <Row>
      <Cell col={cols[0]}>
        <Avatar initials={player.initials} />
      </Cell>
      <Cell col={cols[1]}>
        <NameCell name={player.name} sub={player.sub} />
      </Cell>
      <Cell col={cols[2]}>
        <LevelTag level={player.level} />
      </Cell>
      <Cell col={cols[3]} className="items-baseline gap-1.5">
        <span className="text-[16px] font-semibold leading-5 text-pine">{player.record}</span>
        <Moved places={player.moved} />
      </Cell>
      <Cell col={cols[4]}>
        <span className="text-[13px] leading-4 text-neutral-600">{player.lastPlayed}</span>
      </Cell>
      <Cell col={cols[5]}>
        <Badge tone={availabilityTone[player.availability]}>{player.availability}</Badge>
      </Cell>
      <Cell col={cols[6]}>
        <Btn size="sm">{player.action}</Btn>
      </Cell>
    </Row>
  );
}

/**
 * Ladder movement. Up and down are both grey — the club's point is that
 * the ladder moves, not that dropping a place is a failure.
 */
function Moved({ places }: { places: number | null }) {
  if (places === null) {
    return <span className="text-[11px] font-semibold leading-[14px] text-neutral-400">—</span>;
  }
  return (
    <span
      className={`text-[11px] font-semibold leading-[14px] ${
        places > 0 ? 'text-neutral-600' : 'text-neutral-500'
      }`}
    >
      {places > 0 ? `▲${places}` : `▼${Math.abs(places)}`}
    </span>
  );
}

/**
 * The rail's one dark surface. Players who want a game are the club's best
 * lead: the court books itself once two of them are put together.
 */
function FreeToPlay() {
  return (
    <section className="flex flex-col rounded-2xl bg-pine p-[22px]">
      <div className="flex items-center gap-2 pb-1">
        <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-neutral-400" />
        <Eyebrow tone="inverse">FREE TO PLAY THIS WEEK</Eyebrow>
      </div>
      <h2 className="pb-4 text-[24px] font-semibold leading-[30px] tracking-[-0.015em] text-cream">
        {FREE_THIS_WEEK.headline}
      </h2>
      <p className="pb-[18px] text-[13px] leading-5 text-neutral-400">
        They&rsquo;ve marked themselves open for the next seven days. Pair them and the court books
        itself.
      </p>
      <div className="flex items-center pb-[18px]">
        {[...FREE_THIS_WEEK.faces, `+${FREE_THIS_WEEK.more}`].map((initials, i) => (
          <span key={initials} className={i > 0 ? '-ml-2' : ''}>
            <Avatar initials={initials} size={30} tone={i % 2 ? 'dark-alt' : 'dark'} />
          </span>
        ))}
      </div>
      <button
        type="button"
        className="flex items-center justify-center rounded-full bg-clay px-[18px] py-[11px] text-[13px] font-semibold leading-4 text-white transition-colors hover:bg-clay/90"
      >
        Make a pairing
      </button>
    </section>
  );
}

function MovedUp() {
  return (
    <section className="flex flex-col gap-[14px]">
      <div className="flex items-baseline justify-between">
        <Eyebrow tone="loud">MOVED UP A LEVEL</Eyebrow>
        <span className="text-[12px] leading-4 text-neutral-500">this month</span>
      </div>
      {PROMOTIONS.map((promotion, i) => (
        <div
          key={promotion.name}
          className={`flex items-center gap-3 ${
            i < PROMOTIONS.length - 1 ? 'border-b border-neutral-200 pb-3' : ''
          }`}
        >
          <Avatar initials={promotion.initials} size={30} />
          <span className="min-w-0 grow truncate text-[14px] font-medium leading-[18px] text-pine">
            {promotion.name}
          </span>
          <span className="shrink-0 text-[12px] leading-4 text-neutral-500">{promotion.from}</span>
          <span className="shrink-0 text-neutral-400">{icons.arrow}</span>
          <span className="shrink-0 text-[12px] font-semibold leading-4 text-pine">
            {promotion.to}
          </span>
        </div>
      ))}
    </section>
  );
}
