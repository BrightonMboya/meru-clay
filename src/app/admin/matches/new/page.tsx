import { Btn, Choices, Eyebrow, Fieldset, Head, Screen } from '@/components/admin/ui';

/**
 * Record a result.
 *
 * ⚠️ DEMO. Styled but unwired — see the note at the top of
 * src/lib/bookings.ts. The scores carry the design's sample match so the
 * screen reads as a form mid-completion.
 *
 * A score is provisional until the loser confirms it, which is the rule the
 * whole screen is arranged around: step 3 is about who does the confirming,
 * and the rail shows exactly what the ladder will do once they have.
 */

const CANDIDATES = [
  {
    kind: 'Ladder',
    when: 'Tue 16 · 17:00',
    pairing: 'Asha Mollel v Juma Kimaro',
    detail: 'Court 2 · 1.5 hr · court paid',
    on: true,
  },
  {
    kind: 'Friendly',
    when: 'Sun 14 · 16:00',
    pairing: 'Sofia Mushi v Baraka Meena',
    detail: 'Court 1 · 1.5 hr · club paid',
    on: false,
  },
  {
    kind: 'Walk-up',
    when: 'any two members',
    pairing: 'Not on the books',
    detail: 'Pick both players and a date by hand',
    on: false,
  },
];

const SCORE = [
  { initials: 'AM', name: 'Asha Mollel', rank: 'Competitive · 11–4', sets: [6, 3, 10], won: true },
  { initials: 'JK', name: 'Juma Kimaro', rank: 'Competitive · 14–3', sets: [4, 6, 8], won: false },
];

const SUMMARY = 'Asha Mollel wins 6–4 3–6 10–8';

const LADDER_MOVES = [
  {
    initials: 'AM',
    name: 'Asha Mollel',
    move: 'Competitive · 3rd → 1st',
    from: '11–4',
    to: '12–4',
  },
  {
    initials: 'JK',
    name: 'Juma Kimaro',
    move: 'Competitive · 1st → 2nd',
    from: '14–3',
    to: '14–4',
  },
];

const UNSCORED = [
  { pairing: 'Sofia Mushi v Baraka Meena', when: 'Sun 14 · friendly', overdue: false },
  { pairing: 'Kelvin Shirima v Frank Urio', when: 'Thu 11 · practice set', overdue: false },
  { pairing: 'Neema Laizer v Editha Mrema', when: 'Wed 10 · ladder · overdue', overdue: true },
];

export default function RecordResultPage() {
  return (
    <Screen gap={32}>
      <Head
        title="Record a result"
        blurb="Both players move on the ladder once the loser confirms. Scores stay provisional until then."
        back={{ label: 'Players', href: '/admin/players' }}
        actions={
          <>
            <Btn href="/admin/matches">Cancel</Btn>
            <Btn variant="primary">Save and send to confirm</Btn>
          </>
        }
      />

      <div className="flex flex-col items-start gap-12 xl:flex-row">
        <form className="flex min-w-0 grow flex-col">
          <Fieldset
            step={1}
            label="Which match"
            note="played in the last 7 days · not yet scored"
            gap={18}
          >
            <div className="flex flex-col gap-[14px] sm:flex-row">
              {CANDIDATES.map((match) => (
                <button
                  key={match.pairing}
                  type="button"
                  aria-pressed={match.on}
                  className={`flex min-w-0 grow basis-0 flex-col gap-[10px] rounded-[10px] p-4 text-left transition-colors ${
                    match.on
                      ? 'border-[1.5px] border-pine'
                      : 'border border-neutral-200 hover:border-neutral-300'
                  }`}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span
                      className={`font-sans text-[11px] font-semibold uppercase leading-[14px] tracking-[0.1em] ${
                        match.on ? 'text-clay' : 'text-neutral-500'
                      }`}
                    >
                      {match.kind}
                    </span>
                    <span className="shrink-0 font-sans text-[12px] leading-4 text-neutral-500">
                      {match.when}
                    </span>
                  </span>
                  <span className="text-[16px] font-semibold leading-[22px] text-pine">
                    {match.pairing}
                  </span>
                  <span className="font-sans text-[13px] leading-[18px] text-neutral-500">
                    {match.detail}
                  </span>
                </button>
              ))}
            </div>
          </Fieldset>

          <Fieldset
            step={2}
            label="The score"
            note="best of three · third set is a tie-break to 10"
            gap={18}
          >
            <ScoreCard />
          </Fieldset>

          <Fieldset step={3} label="Who confirms" gap={18}>
            <Choices
              chosenStyle="ring"
              chosen="Ask Juma to confirm"
              options={[
                { label: 'Ask Juma to confirm' },
                { label: 'Both were with me — confirm now' },
              ]}
            />
            <p className="font-sans text-[13px] leading-5 text-neutral-500">
              Elias can confirm on the spot as head coach. Otherwise Juma has 48 hours before the
              score stands on its own.
            </p>
          </Fieldset>
        </form>

        <aside className="flex w-full shrink-0 flex-col gap-7 xl:w-[380px]">
          <WhatThisMoves />
          <div className="flex flex-col">
            <div className="flex items-baseline justify-between gap-4 pb-[14px]">
              <Eyebrow>STILL TO BE SCORED</Eyebrow>
              <span className="text-[12px] leading-4 text-neutral-500">3 matches</span>
            </div>
            {UNSCORED.map((match) => (
              <div
                key={match.pairing}
                className="flex items-center gap-3 border-t border-neutral-200 py-[13px]"
              >
                <span className="flex min-w-0 grow flex-col gap-0.5">
                  <span className="truncate text-[14px] font-medium leading-[18px] text-pine">
                    {match.pairing}
                  </span>
                  <span
                    className={`truncate font-sans text-[12px] leading-4 ${
                      match.overdue ? 'font-medium text-clay' : 'text-neutral-500'
                    }`}
                  >
                    {match.when}
                  </span>
                </span>
                <Btn size="sm">Score</Btn>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </Screen>
  );
}

/**
 * The score, as a table with one row per player. Set columns are fixed 70px
 * lanes so the three boxes line up down the card however long the names are.
 */
function ScoreCard() {
  return (
    <div className="flex flex-col overflow-clip rounded-[10px] border border-neutral-200">
      <div className="flex items-center bg-neutral-100 px-[18px] py-3">
        <span className="min-w-0 grow font-sans text-[11px] font-semibold uppercase leading-[14px] tracking-[0.13em] text-neutral-500">
          Player
        </span>
        {['Set 1', 'Set 2', 'Set 3'].map((set) => (
          <span
            key={set}
            className="w-[70px] shrink-0 text-center font-sans text-[11px] font-semibold uppercase leading-[14px] tracking-[0.13em] text-neutral-500"
          >
            {set}
          </span>
        ))}
        <span className="w-[104px] shrink-0 text-right font-sans text-[11px] font-semibold uppercase leading-[14px] tracking-[0.13em] text-neutral-500">
          Winner
        </span>
      </div>

      {SCORE.map((player) => (
        <div
          key={player.name}
          className="flex items-center border-t border-neutral-200 px-[18px] py-[14px]"
        >
          <div className="flex min-w-0 grow items-center gap-3">
            <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-neutral-100 text-[12px] font-semibold leading-4 text-neutral-600">
              {player.initials}
            </span>
            <span className="flex min-w-0 flex-col gap-px">
              <span className="truncate text-[16px] font-semibold leading-[22px] text-pine">
                {player.name}
              </span>
              <span className="truncate font-sans text-[12px] leading-4 text-neutral-500">
                {player.rank}
              </span>
            </span>
          </div>
          {player.sets.map((games, i) => (
            <span key={i} className="flex w-[70px] shrink-0 items-center justify-center">
              <input
                type="text"
                inputMode="numeric"
                aria-label={`${player.name} set ${i + 1}`}
                defaultValue={games}
                className="h-[46px] w-[46px] rounded-md border border-neutral-200 bg-white text-center text-[19px] font-semibold leading-6 text-pine outline-none transition-colors focus:border-pine/40"
              />
            </span>
          ))}
          <span className="flex w-[104px] shrink-0 items-center justify-end">
            <button
              type="button"
              aria-pressed={player.won}
              className={`flex h-[34px] shrink-0 items-center gap-[7px] rounded-full px-3 font-sans text-[13px] leading-4 transition-colors ${
                player.won
                  ? 'bg-pine font-semibold text-cream'
                  : 'border border-neutral-200 font-medium text-neutral-700 hover:border-neutral-300'
              }`}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" className="shrink-0" aria-hidden>
                <path
                  d="M2.2 6.2 4.8 8.8 9.8 3.2"
                  fill="none"
                  stroke={player.won ? '#FFFFFF' : '#A3A3A3'}
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {player.won ? 'Won' : 'Mark won'}
            </button>
          </span>
        </div>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-5 border-t border-neutral-200 bg-neutral-100 px-[18px] py-[13px]">
        <span className="text-[15px] font-medium leading-5 text-pine">{SUMMARY}</span>
        <div className="flex shrink-0 items-center gap-2">
          {/* The two ways a match ends without a full score. */}
          {['Retired', 'Walkover'].map((outcome) => (
            <button
              key={outcome}
              type="button"
              className="flex h-8 items-center rounded-full border border-neutral-200 bg-white px-3 font-sans text-[12px] font-medium leading-4 text-neutral-700 transition-colors hover:border-neutral-300"
            >
              {outcome}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * What saving does to the ladder, before it is saved. The arrows are the
 * point: a result is only interesting for how it moves the two players.
 */
function WhatThisMoves() {
  return (
    <section className="flex flex-col gap-[18px] rounded-2xl bg-pine p-[22px]">
      <span className="font-sans text-[11px] font-semibold uppercase leading-[14px] tracking-[0.13em] text-[#8FA396]">
        What this moves
      </span>
      {LADDER_MOVES.map((player) => (
        <div key={player.name} className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#2C4436] text-[12px] font-semibold leading-4 text-[#E8EDE9]">
            {player.initials}
          </span>
          <span className="flex min-w-0 grow flex-col gap-0.5">
            <span className="truncate text-[15px] font-semibold leading-5 text-cream">
              {player.name}
            </span>
            <span className="truncate font-sans text-[12px] leading-4 text-[#8FA396]">
              {player.move}
            </span>
          </span>
          <span className="flex w-[112px] shrink-0 items-center justify-end gap-2">
            <span className="w-10 shrink-0 text-right text-[15px] font-medium leading-5 text-[#6F8478]">
              {player.from}
            </span>
            <svg width="14" height="10" viewBox="0 0 14 10" className="shrink-0" aria-hidden>
              <path
                d="M1 5h11M8.6 1.6 12 5l-3.4 3.4"
                fill="none"
                stroke="#6F8478"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="w-10 shrink-0 text-right text-[15px] font-semibold leading-5 text-cream">
              {player.to}
            </span>
          </span>
        </div>
      ))}
      <div className="flex items-start gap-[9px] border-t border-[#2C4436] pt-4">
        <svg width="14" height="14" viewBox="0 0 14 14" className="mt-[3px] shrink-0" aria-hidden>
          <path
            d="M7 2.2v7.4M4.2 5 7 2.2 9.8 5"
            fill="none"
            stroke="var(--color-clay-light)"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <p className="font-sans text-[13px] leading-[19px] text-[#C9D3CC]">
          Asha takes top of Competitive. Neither changes level — a level move needs three wins
          against the one above.
        </p>
      </div>
    </section>
  );
}
