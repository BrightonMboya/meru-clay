import { Choices, Eyebrow, Fieldset } from '@/components/admin/ui';

/**
 * Broadcasts — one marketing template to a list of people.
 *
 * ⚠️ DEMO. Styled but unwired; see the note at the top of
 * src/lib/bookings.ts.
 *
 * Nobody in a broadcast has written to the club first, so every message here
 * is a *marketing* template and is billed. The rail counts the cost before
 * anything is sent, and the opted-out are subtracted from the list rather
 * than filtered at send time — an opt-out is a promise, not a preference.
 */

const SEGMENTS = [
  {
    name: 'Trialled, never joined',
    count: '17',
    detail: 'Came to a trial in the last 90 days',
    on: true,
  },
  { name: 'Membership due', count: '6', detail: 'Members owing TSh 540,000', on: false },
  { name: 'Quiet 60 days', count: '23', detail: 'Members who have not booked', on: false },
];

const MESSAGE =
  'Hi Hassan — a 12-class punch card at Meru Clay is TSh 180,000 and never expires. You hit well on your trial. Want us to keep one aside?';

const BEFORE_SEND = [
  { label: 'In the segment', value: '17 people' },
  { label: 'Opted out · removed', value: '2' },
  { label: 'Actually sending to', value: '15 people' },
];

const HISTORY = [
  {
    name: 'punch_card_prices',
    when: '2 Sept',
    sent: '90 sent',
    replied: '16 replied',
    won: '4 joined',
    lost: '1 opted out',
    lostMatters: true,
  },
  {
    name: 'clinic_times',
    when: '19 Aug',
    sent: '34 sent',
    replied: '21 replied',
    won: '2 joined',
    lost: 'none opted out',
    lostMatters: false,
  },
  {
    name: 'dues_reminder',
    when: '1 Aug',
    sent: '11 sent',
    replied: '9 replied',
    won: 'TSh 420,000 paid',
    lost: 'none opted out',
    lostMatters: false,
  },
];

export default function BroadcastsPage() {
  return (
    <div className="flex flex-col items-start gap-12 xl:flex-row">
      <form className="flex min-w-0 grow flex-col">
        <div className="flex flex-col gap-[18px] pb-[30px] pt-[26px]">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <Eyebrow>1 · WHO GETS IT</Eyebrow>
            <span className="text-[12px] leading-4 text-neutral-500">
              opted-out numbers are removed automatically
            </span>
          </div>
          <div className="flex flex-col gap-[14px] sm:flex-row">
            {SEGMENTS.map((segment) => (
              <button
                key={segment.name}
                type="button"
                aria-pressed={segment.on}
                className={`flex min-w-0 grow basis-0 flex-col gap-2 rounded-[10px] p-4 text-left transition-colors ${
                  segment.on
                    ? 'border-[1.5px] border-pine'
                    : 'border border-neutral-200 hover:border-neutral-300'
                }`}
              >
                <span className="text-[15px] font-semibold leading-5 text-pine">
                  {segment.name}
                </span>
                <span className="text-[28px] font-semibold leading-8 tracking-[-0.01em] text-pine">
                  {segment.count}
                </span>
                <span className="font-sans text-[13px] leading-[18px] text-neutral-500">
                  {segment.detail}
                </span>
              </button>
            ))}
            <button
              type="button"
              className="flex min-w-0 grow basis-0 flex-col gap-2 rounded-[10px] border border-dashed border-neutral-300 p-4 text-left transition-colors hover:border-neutral-400"
            >
              <span className="text-[15px] font-semibold leading-5 text-neutral-500">
                Build a list
              </span>
              <span className="font-sans text-[13px] leading-[18px] text-neutral-500">
                Filter by level, age, source or last visit
              </span>
            </button>
          </div>
        </div>

        <Fieldset step={2} label="What it says" note="approved marketing templates only" gap={18}>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-pressed
              className="flex h-[38px] shrink-0 items-center gap-2 rounded-full bg-pine px-[14px]"
            >
              <span className="font-sans text-[13px] font-semibold leading-4 text-cream">
                punch_card_prices
              </span>
              <span className="font-sans text-[12px] leading-4 text-[#8FA396]">TSh 11 each</span>
            </button>
            <button
              type="button"
              className="flex h-[38px] shrink-0 items-center gap-2 rounded-full border border-neutral-200 px-[14px] transition-colors hover:border-neutral-300"
            >
              <span className="font-sans text-[13px] font-medium leading-4 text-neutral-700">
                members_round_robin
              </span>
              {/* Amber, the same as on the Templates tab: Meta has not passed
                  it yet, so it cannot actually be sent. */}
              <span className="font-sans text-[12px] leading-4 text-[#C99A2E]">in review</span>
            </button>
          </div>

          <div className="flex flex-col gap-3 rounded-[10px] bg-neutral-100 p-[18px]">
            <p className="text-[15px] leading-[23px] text-pine">{MESSAGE}</p>
            <div className="flex flex-wrap items-center gap-2">
              {['Yes, keep one', 'Stop these messages'].map((reply) => (
                <span
                  key={reply}
                  className="flex h-7 shrink-0 items-center rounded-full border border-neutral-200 bg-white px-[11px] font-sans text-[12px] font-medium leading-4 text-neutral-700"
                >
                  {reply}
                </span>
              ))}
              <span className="font-sans text-[12px] leading-4 text-neutral-500">
                quick-reply buttons · the second one opts them out
              </span>
            </div>
          </div>
        </Fieldset>

        <Fieldset step={3} label="When" gap={18}>
          <Choices
            chosenStyle="ring"
            chosen="Thursday 10:00"
            options={['Send now', 'Thursday 10:00', 'Pick a time']}
          />
          <p className="font-sans text-[13px] leading-5 text-neutral-500">
            Mid-morning on a weekday gets the most replies here. Nothing sends between 20:00 and
            08:00 whatever you pick.
          </p>
        </Fieldset>
      </form>

      <aside className="flex w-full shrink-0 flex-col gap-7 xl:w-[380px]">
        <section className="flex flex-col gap-4 rounded-2xl bg-pine p-[22px]">
          <span className="font-sans text-[11px] font-semibold uppercase leading-[14px] tracking-[0.13em] text-[#8FA396]">
            Before you send
          </span>
          <dl className="flex flex-col">
            {BEFORE_SEND.map((row, i) => (
              <div
                key={row.label}
                className={`flex items-center justify-between gap-4 ${
                  i === 0 ? 'pb-[11px]' : 'border-t border-[#2C4436] py-[11px]'
                }`}
              >
                <dt className="font-sans text-[13px] leading-[18px] text-[#8FA396]">{row.label}</dt>
                <dd className="text-[14px] font-semibold leading-[18px] text-cream">{row.value}</dd>
              </div>
            ))}
            <div className="flex items-center justify-between gap-4 border-t border-[#2C4436] pt-[11px]">
              <dt className="font-sans text-[13px] leading-[18px] text-[#8FA396]">Cost</dt>
              <dd className="text-[18px] font-semibold leading-6 tracking-[-0.01em] text-cream">
                TSh 165
              </dd>
            </div>
          </dl>
          <button
            type="button"
            className="flex h-11 shrink-0 items-center justify-center rounded-full bg-clay font-sans text-[14px] font-semibold leading-[18px] text-cream transition-colors hover:bg-clay/90"
          >
            Schedule for Thursday
          </button>
        </section>

        <div className="flex flex-col">
          <div className="pb-[14px]">
            <Eyebrow>SENT BEFORE</Eyebrow>
          </div>
          {HISTORY.map((broadcast) => (
            <div
              key={broadcast.name}
              className="flex flex-col gap-2 border-t border-neutral-200 py-[14px]"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-[14px] font-semibold leading-[18px] text-pine">
                  {broadcast.name}
                </span>
                <span className="shrink-0 font-sans text-[12px] leading-4 text-neutral-500">
                  {broadcast.when}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-[14px] gap-y-1 font-sans text-[12px] leading-4">
                <span className="text-neutral-500">{broadcast.sent}</span>
                <span className="font-medium text-pine">{broadcast.replied}</span>
                <span className="font-medium text-[#2F7D4F]">{broadcast.won}</span>
                {/* An opt-out is the real cost of a broadcast, so it is the
                    only figure here that gets clay. */}
                <span className={broadcast.lostMatters ? 'text-clay' : 'text-neutral-500'}>
                  {broadcast.lost}
                </span>
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
