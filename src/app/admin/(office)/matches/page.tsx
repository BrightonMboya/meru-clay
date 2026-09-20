import {
  Avatar,
  Badge,
  Btn,
  Cell,
  Eyebrow,
  Head,
  Readings,
  Screen,
  Segmented,
  StepRule,
  Table,
  Row,
  icons,
  type BadgeTone,
  type Col,
} from '@/components/admin/ui';
import {
  CHALLENGE_DAYS,
  CHALLENGE_SLOTS,
  CHALLENGE_TOTAL,
  FIXTURES,
  HEAD_TO_HEAD,
  MATCH_READINGS,
  OPPONENTS,
  SCORE_TO_CONFIRM,
  URGENT_CHALLENGE,
  WAITING,
  type Fixture,
  type MatchState,
} from '@/lib/admin/matches';

/** Column lanes for the fixture list. Its headings are off (see below), so
    these only carry widths. */
const cols: Col[] = [
  { head: '', w: 132 },
  { head: '' },
  { head: '', w: 112 },
  { head: '', w: 150 },
  { head: '', w: 130 },
  { head: '', w: 84, align: 'right' },
];

/** An unanswered challenge is the only state worth colouring. */
const stateTone: Record<MatchState, BadgeTone> = {
  CONFIRMED: 'stone',
  'AWAITING REPLY': 'clay',
  PLAYED: 'stone',
};

export default function MatchesPage() {
  return (
    <Screen>
      <Head
        title="Matches"
        blurb="A challenge holds the court for both players. Accepted in under two hours or the slot goes back on sale."
        actions={
          <>
            <Btn icon={icons.download}>Match history</Btn>
            <Btn variant="primary" icon={icons.plus} href="/admin/matches/new">
              Arrange a match
            </Btn>
          </>
        }
      />

      <Readings readings={MATCH_READINGS} />

      <div className="flex items-start gap-8 xl:flex-row">
        <ChallengeBuilder />
        <aside className="hidden w-[352px] shrink-0 flex-col gap-4 xl:flex">
          <div className="flex items-baseline justify-between">
            <Eyebrow tone="loud">WAITING ON A REPLY</Eyebrow>
            <span className="text-[12px] leading-4 text-neutral-500">expires in order</span>
          </div>
          <UrgentChallenge />
          <div className="flex flex-col">
            {WAITING.map((item) => (
              <div
                key={item.pairing}
                className="flex items-center gap-3 border-b border-neutral-200 px-0.5 py-[13px]"
              >
                <span className="w-11 shrink-0 text-[12px] font-semibold leading-4 text-neutral-500">
                  {item.age}
                </span>
                <span className="flex min-w-0 grow flex-col gap-0.5">
                  <span className="truncate text-[14px] font-medium leading-[18px] text-pine">
                    {item.pairing}
                  </span>
                  <span className="truncate text-[12px] leading-4 text-neutral-500">
                    {item.detail}
                  </span>
                </span>
              </div>
            ))}
          </div>
          <ScoreToConfirm />
        </aside>
      </div>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-[26px] font-semibold leading-8 tracking-[-0.02em] text-pine">
              Matches on the books
            </h2>
            <p className="text-[13px] leading-4 text-neutral-500">
              These also show on the coach&rsquo;s court desk, so the courts are never double-sold.
            </p>
          </div>
          <Segmented options={['Next 7 days', 'Played']} chosen="Next 7 days" />
        </div>

        {/* No column headings — the section's own heading does that work, and
            the design keeps this list as quiet as possible. */}
        <Table cols={cols} headings={false}>
          {FIXTURES.map((fixture) => (
            <FixtureRow key={fixture.when} fixture={fixture} />
          ))}
        </Table>
      </section>
    </Screen>
  );
}

function FixtureRow({ fixture }: { fixture: Fixture }) {
  return (
    <Row>
      <Cell col={cols[0]}>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[17px] font-semibold leading-[22px] text-pine">{fixture.when}</span>
          <span className="truncate text-[12px] leading-4 text-neutral-500">{fixture.court}</span>
        </div>
      </Cell>
      <Cell col={cols[1]} className="flex-wrap gap-x-[14px] gap-y-2">
        {fixture.players.map((player, i) => (
          <span key={player.initials} className="flex items-center gap-[14px]">
            {i > 0 && <span className="text-[13px] leading-4 text-neutral-400">v</span>}
            <span className="flex items-center gap-[9px]">
              <Avatar initials={player.initials} size={28} />
              <span className="text-[15px] font-semibold leading-[18px] text-pine">
                {player.name}
              </span>
            </span>
          </span>
        ))}
      </Cell>
      <Cell col={cols[2]}>
        <Badge>{fixture.kind}</Badge>
      </Cell>
      <Cell col={cols[3]}>
        <span className="truncate text-[13px] leading-4 text-neutral-600">{fixture.money}</span>
      </Cell>
      <Cell col={cols[4]}>
        <Badge tone={stateTone[fixture.state]}>{fixture.state}</Badge>
      </Cell>
      <Cell col={cols[5]}>
        <Btn size="sm">Open</Btn>
      </Cell>
    </Row>
  );
}

/**
 * Arranging a match, as three numbered steps inside one card: who, when, and
 * what it costs. The card is the only bordered surface on the screen, which is
 * what marks it out as the thing being composed rather than reported.
 */
function ChallengeBuilder() {
  return (
    <section className="flex min-w-0 grow flex-col gap-6 rounded-[18px] border border-neutral-200 bg-white px-[30px] py-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-[5px]">
          <h2 className="text-[24px] font-semibold leading-[30px] tracking-[-0.015em] text-pine">
            Challenge a player
          </h2>
          <p className="text-[13px] leading-4 text-neutral-500">
            Asha Mollel · Competitive · 11–4 this season
          </p>
        </div>
        <Segmented options={['Ladder match', 'Friendly hit', 'Doubles']} chosen="Ladder match" />
      </div>

      <div className="flex flex-col gap-3">
        <StepRule step={1} label="WHO YOU'RE PLAYING" note="Competitive and Club only" />
        <div className="flex flex-col gap-[10px] sm:flex-row">
          {OPPONENTS.map((opponent) => (
            <button
              key={opponent.initials}
              type="button"
              aria-pressed={opponent.chosen}
              className={`flex min-w-0 grow basis-0 flex-col gap-2 rounded-xl p-[14px] text-left transition-colors ${
                opponent.chosen
                  ? 'border-[1.5px] border-pine bg-neutral-100'
                  : 'border border-neutral-200 hover:border-neutral-300'
              }`}
            >
              <span className="flex items-center gap-[9px]">
                {/* The chosen opponent's disc goes clay — the one piece of
                    colour in the step, so the choice is unmistakable. */}
                <span
                  className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                    opponent.chosen ? 'bg-clay text-white' : 'bg-neutral-100 text-neutral-700'
                  }`}
                >
                  {opponent.initials}
                </span>
                <span className="truncate text-[14px] font-semibold leading-[18px] text-pine">
                  {opponent.name}
                </span>
              </span>
              <span className="text-[12px] leading-4 text-neutral-500">{opponent.note}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <StepRule step={2} label="WHEN YOU BOTH PLAY" note="Only slots free on both diaries" />
        <div className="flex flex-wrap items-center gap-2">
          {CHALLENGE_DAYS.map((day) => (
            <button
              key={day.weekday}
              type="button"
              aria-pressed={day.chosen}
              className={`flex w-16 shrink-0 flex-col items-center gap-0.5 rounded-[10px] py-[9px] transition-colors ${
                day.chosen ? 'bg-pine' : 'bg-neutral-100 hover:bg-neutral-200'
              }`}
            >
              <span
                className={`text-[10px] font-bold leading-3 tracking-[0.1em] ${
                  day.chosen ? 'text-neutral-400' : 'text-neutral-500'
                }`}
              >
                {day.weekday}
              </span>
              <span
                className={`text-[17px] font-semibold leading-[22px] ${
                  day.chosen ? 'text-cream' : 'text-pine'
                }`}
              >
                {day.day}
              </span>
            </button>
          ))}
          <div className="grow" />
          <span className="flex shrink-0 items-center gap-[7px]">
            <span className="h-[9px] w-[9px] shrink-0 rounded-[2px] bg-neutral-400" />
            <span className="text-[12px] leading-4 text-neutral-600">Floodlit after 18:45</span>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {CHALLENGE_SLOTS.map((slot) => (
            <button
              key={slot.label}
              type="button"
              disabled={slot.state === 'held'}
              aria-pressed={slot.state === 'chosen'}
              className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-[10px] text-[13px] leading-4 transition-colors ${
                slot.state === 'chosen'
                  ? 'bg-pine font-semibold text-cream'
                  : slot.state === 'held'
                    ? 'cursor-not-allowed border border-dashed border-neutral-300 font-medium text-neutral-400'
                    : 'border border-neutral-200 font-medium text-neutral-700 hover:border-neutral-300'
              }`}
            >
              {slot.label}
              {'floodlit' in slot && slot.floodlit && (
                <span className="h-[7px] w-[7px] shrink-0 rounded-[2px] bg-neutral-400" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-7 rounded-xl bg-neutral-50 px-5 py-[18px]">
        <div className="flex w-[150px] shrink-0 flex-col gap-[3px]">
          <Eyebrow>HEAD TO HEAD</Eyebrow>
          <span className="text-[20px] font-semibold leading-6 text-pine">
            {HEAD_TO_HEAD.record}
          </span>
        </div>
        <span className="hidden h-[38px] w-px shrink-0 bg-neutral-200 sm:block" />
        <div className="flex min-w-0 grow flex-col gap-[3px]">
          <span className="text-[13px] font-medium leading-4 text-pine">
            {HEAD_TO_HEAD.headline}
          </span>
          <span className="text-[12px] leading-4 text-neutral-500">{HEAD_TO_HEAD.detail}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {HEAD_TO_HEAD.form.map((result) => (
            <span
              key={result}
              className="rounded-md bg-neutral-100 px-[9px] py-[5px] text-[11px] font-semibold leading-[14px] text-neutral-600"
            >
              {result}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-6 border-t border-neutral-200 pt-[22px]">
        <div className="flex flex-col gap-[5px]">
          <div className="flex items-baseline gap-2">
            <span className="text-[22px] font-semibold leading-7 text-pine">
              {CHALLENGE_TOTAL.price}
            </span>
            <span className="text-[13px] leading-4 text-neutral-500">{CHALLENGE_TOTAL.split}</span>
          </div>
          <span className="text-[12px] leading-4 text-neutral-500">{CHALLENGE_TOTAL.detail}</span>
        </div>
        <div className="flex shrink-0 items-center gap-[10px]">
          <Btn>Save as draft</Btn>
          <Btn variant="primary">Send challenge on WhatsApp</Btn>
        </div>
      </div>
    </section>
  );
}

/**
 * The challenge closest to expiry, on the screen's only clay-washed ground.
 * Once it lapses the court goes back on sale, so it is the one thing here
 * that is genuinely time-critical.
 */
function UrgentChallenge() {
  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-clay/25 bg-clay-wash p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-bold leading-[14px] tracking-[0.1em] text-clay-ink">
          EXPIRES IN {URGENT_CHALLENGE.expiresIn}
        </span>
        <span className="text-[11px] font-semibold leading-[14px] text-neutral-400">
          {URGENT_CHALLENGE.kind}
        </span>
      </div>
      <span className="text-[18px] font-semibold leading-[22px] tracking-[-0.01em] text-pine">
        {URGENT_CHALLENGE.pairing}
      </span>
      <span className="text-[13px] leading-4 text-neutral-600">{URGENT_CHALLENGE.detail}</span>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded-full bg-pine px-[14px] py-2 text-[12px] font-semibold leading-4 text-cream transition-colors hover:bg-pine-700"
        >
          Nudge on WhatsApp
        </button>
        <button
          type="button"
          className="rounded-full border border-clay/30 px-[14px] py-2 text-[12px] font-semibold leading-4 text-neutral-600 transition-colors hover:bg-white/50"
        >
          Withdraw
        </button>
      </div>
    </div>
  );
}

/**
 * A result one player has entered and the other has not yet agreed to. The
 * ladder will not move until it is confirmed, which is why it sits in the rail
 * rather than in a list somewhere.
 */
function ScoreToConfirm() {
  return (
    <div className="flex flex-col gap-[14px] rounded-[14px] bg-neutral-100 p-[18px]">
      <Eyebrow tone="loud">A SCORE NEEDS CONFIRMING</Eyebrow>
      {SCORE_TO_CONFIRM.rows.map((row) => (
        <div key={row.name} className="flex items-center justify-between gap-3">
          <span
            className={`min-w-0 truncate text-[14px] leading-[18px] ${
              row.won ? 'font-semibold text-pine' : 'text-neutral-600'
            }`}
          >
            {row.name}
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            {row.sets.map((games, i) => (
              <span
                key={i}
                className={`flex h-7 w-7 items-center justify-center rounded-md bg-white text-[14px] font-semibold leading-[18px] ${
                  row.won ? 'text-pine' : 'text-neutral-500'
                }`}
              >
                {games}
              </span>
            ))}
          </span>
        </div>
      ))}
      <p className="text-[12px] leading-[18px] text-neutral-500">{SCORE_TO_CONFIRM.note}</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="grow rounded-full bg-clay p-[10px] text-[12px] font-semibold leading-4 text-white transition-colors hover:bg-clay/90"
        >
          Confirm result
        </button>
        <button
          type="button"
          className="shrink-0 rounded-full border border-neutral-300 px-[14px] py-[10px] text-[12px] font-semibold leading-4 text-neutral-600 transition-colors hover:bg-white"
        >
          Dispute
        </button>
      </div>
    </div>
  );
}
