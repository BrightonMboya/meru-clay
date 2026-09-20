import { Btn, Eyebrow } from '@/components/admin/ui';

/**
 * The court agent — the club's booking desk, sitting in the members' own
 * WhatsApp group chats.
 *
 * ⚠️ DEMO. The transcript below is the design's sample conversation; nothing
 * on this screen is wired up. See the note at the top of src/lib/bookings.ts.
 *
 * The screen's argument is in the two lists on the right: what the agent may
 * do on its own, and what it always fetches Elias for. An agent that books
 * courts is useful; an agent that decides refunds is a liability. The
 * transcript on the left exists to show it obeying that line — the last
 * exchange is it declining to answer and handing over.
 */

type Line =
  | { who: 'member'; initials: string; name: string; text: string; stamp: string }
  | {
      who: 'agent';
      text: string;
      /** A quieter second paragraph. */
      aside?: string;
      /** Quick-reply buttons under the bubble. */
      buttons?: string[];
      /** A small two-row receipt inside the bubble. */
      receipt?: { label: string; value: string }[];
      stamp: string;
      /** Drawn in clay under the bubble — the agent stepping back. */
      handover?: string;
    }
  | { who: 'divider'; label: string };

const TRANSCRIPT: Line[] = [
  {
    who: 'member',
    initials: 'NL',
    name: 'Neema Laizer',
    text: 'Anyone for a hit tomorrow evening? Juma?',
    stamp: '09:12',
  },
  {
    who: 'member',
    initials: 'JK',
    name: 'Juma Kimaro',
    text: "I'm free after six 👍",
    stamp: '09:14',
  },
  {
    who: 'member',
    initials: 'NL',
    name: 'Neema Laizer',
    text: '@Meru Clay book us a court tomorrow at 18:00',
    stamp: '09:14',
  },
  {
    who: 'agent',
    text: 'Court 1 is free tomorrow, Wed 17 Sept, 18:00–19:00. TSh 15,000 for the hour, lights come on at 18:45.',
    aside: 'Holding it for ten minutes.',
    buttons: ['Book it', 'Another time'],
    stamp: '09:14 · answered in 3 seconds',
  },
  {
    who: 'member',
    initials: 'JK',
    name: 'Juma Kimaro',
    text: 'Book it',
    stamp: '09:15 · tapped the button',
  },
  {
    who: 'agent',
    text: 'Done — Court 1, Wednesday 17 September, 18:00 to 19:00. Neema and Juma.',
    receipt: [
      { label: 'To pay', value: 'TSh 7,500 each' },
      { label: 'M-Pesa till', value: '5512' },
    ],
    aside: "Or pay at the gate. I'll nudge you both at 16:00 tomorrow.",
    stamp: '09:15 · court desk updated',
  },
  { who: 'divider', label: 'Later that afternoon' },
  {
    who: 'member',
    initials: 'DM',
    name: 'Daniel Massawe',
    text: '@Meru Clay move my Saturday court to Sunday morning',
    stamp: '15:48',
  },
  {
    who: 'agent',
    text: "Daniel, that's Court 2 on Saturday at 08:00. Sunday 08:00 is the juniors squad, so the nearest free slots are:",
    buttons: ['Sunday 09:30 · Court 2', 'Sunday 11:00 · Court 1', 'Keep Saturday'],
    stamp: '15:48 · same rate either way, nothing to pay',
  },
  {
    who: 'member',
    initials: 'FU',
    name: 'Frank Urio',
    text: '@Meru Clay it rained through my hour last Thursday, can I get that money back?',
    stamp: '16:02',
  },
  {
    who: 'agent',
    text: "Money back is Elias's call, not mine. I've sent him your Thursday booking and the rain note — he usually answers within the hour.",
    stamp: '',
    handover: 'Handed to Elias · 16:02 · waiting',
  },
];

const AGENT_STATS = [
  { label: 'Booked by the agent', value: '23', detail: 'this week' },
  { label: 'Handed over', value: '4', detail: '1 still waiting', accent: true },
  { label: 'Got it wrong', value: '1', detail: 'read a date wrong' },
];

const POWERS = [
  {
    name: 'Hold and book a free court',
    limit: 'Up to 14 days ahead · holds lapse after 10 minutes',
    on: true,
  },
  {
    name: 'Move or cancel a booking',
    limit: 'Only the person who made it · not inside 2 hours of the slot',
    on: true,
  },
  {
    name: 'Quote prices and read the diary',
    limit: 'Court hire, clinics, the punch card · from the live price list',
    on: true,
  },
  { name: 'Add someone to a booked court', limit: 'Asks the person who booked first', on: true },
  {
    name: 'Take payment',
    limit: 'Off — it gives the till number and lets the gate mark it paid',
    on: false,
  },
];

const FETCHES_ELIAS = [
  'Money going back out — refunds, credits, rain calls.',
  'Coaching, memberships and anything about a junior.',
  'A cross message, or the same person asking twice.',
  'Anything it is not sure about. It says so rather than guessing.',
];

const GROUPS = [
  {
    name: 'Tuesday Social · Meru Clay',
    detail: '14 members · 11 bookings this week',
    state: 'on' as const,
  },
  {
    name: 'Saturday Round Robin',
    detail: '22 members · 7 bookings this week',
    state: 'on' as const,
  },
  {
    name: 'Meru Clay Juniors · parents',
    detail: '31 members · reads only, never books',
    state: 'limited' as const,
  },
  { name: 'Morning Crew', detail: '9 members · 5 bookings this week', state: 'on' as const },
];

const ASKS = [
  { what: 'Book me a court', share: 61 },
  { what: "What's free on …?", share: 18 },
  { what: 'Move or cancel mine', share: 12 },
  { what: 'What does it cost?', share: 9 },
];

/** The ask bars descend with the ranking, so the list reads top-down. */
const askInk = ['bg-pine', 'bg-neutral-600', 'bg-neutral-500', 'bg-neutral-400'];

export default function CourtAgentPage() {
  return (
    <div className="flex flex-col items-start gap-10 xl:flex-row">
      <Transcript />
      <div className="flex min-w-0 grow flex-col">
        <section className="flex flex-col border-b border-neutral-200 pb-6 sm:flex-row">
          {AGENT_STATS.map((stat, i) => (
            <div
              key={stat.label}
              className={`flex min-w-0 grow basis-0 flex-col gap-[5px] ${
                i < AGENT_STATS.length - 1 ? 'sm:border-r sm:border-neutral-200 sm:pr-5' : ''
              } ${i > 0 ? 'mt-4 sm:mt-0 sm:pl-5' : ''}`}
            >
              <span className="font-sans text-[12px] leading-4 text-neutral-500">{stat.label}</span>
              <span className="text-[26px] font-semibold leading-8 tracking-[-0.01em] text-pine">
                {stat.value}
              </span>
              <span
                className={`font-sans text-[12px] leading-4 ${
                  stat.accent ? 'text-clay' : 'text-neutral-500'
                }`}
              >
                {stat.detail}
              </span>
            </div>
          ))}
        </section>

        <section className="flex flex-col border-b border-neutral-200 py-[26px]">
          <div className="pb-4">
            <Eyebrow>WHAT IT MAY DO ON ITS OWN</Eyebrow>
          </div>
          {POWERS.map((power) => (
            <div
              key={power.name}
              className="flex items-center gap-[14px] border-t border-neutral-200 py-[14px]"
            >
              <Toggle on={power.on} label={power.name} />
              <span className="flex min-w-0 grow flex-col gap-0.5">
                <span
                  className={`text-[14px] font-medium leading-[19px] ${
                    power.on ? 'text-pine' : 'text-neutral-500'
                  }`}
                >
                  {power.name}
                </span>
                <span className="font-sans text-[12px] leading-[17px] text-neutral-500">
                  {power.limit}
                </span>
              </span>
            </div>
          ))}
        </section>

        {/* The limits, stated as plainly as the powers above them, and sat
            flush under their rule because it is the same list continued. This
            is what makes the agent safe to leave running. */}
        <section className="mb-[26px] flex flex-col gap-3 rounded-2xl bg-clay-wash p-5">
          <h2 className="text-[15px] font-semibold leading-[21px] text-[#7A3218]">
            It always fetches Elias for
          </h2>
          <ul className="flex flex-col gap-[7px]">
            {FETCHES_ELIAS.map((rule) => (
              <li key={rule} className="font-sans text-[13px] leading-5 text-[#8A4A30]">
                {rule}
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col border-b border-neutral-200 pb-[26px]">
          <div className="flex items-baseline justify-between gap-4 pb-[14px]">
            <Eyebrow>GROUPS IT SITS IN</Eyebrow>
            <span className="text-[12px] leading-4 text-neutral-500">4 of 7</span>
          </div>
          {GROUPS.map((group) => (
            <div
              key={group.name}
              className="flex items-center gap-3 border-t border-neutral-200 py-[13px]"
            >
              {/* Amber where the agent is present but may not book. */}
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  group.state === 'on' ? 'bg-[#2F7D4F]' : 'bg-[#C99A2E]'
                }`}
              />
              <span className="flex min-w-0 grow flex-col gap-0.5">
                <span className="truncate text-[14px] font-medium leading-[18px] text-pine">
                  {group.name}
                </span>
                <span className="truncate font-sans text-[12px] leading-4 text-neutral-500">
                  {group.detail}
                </span>
              </span>
              <Btn size="sm">Open</Btn>
            </div>
          ))}
        </section>

        <section className="flex flex-col pt-[26px]">
          <div className="flex items-baseline justify-between gap-4 pb-4">
            <Eyebrow>WHAT PEOPLE ASK IT</Eyebrow>
            <span className="text-[12px] leading-4 text-neutral-500">last 30 days</span>
          </div>
          {ASKS.map((ask, i) => (
            <div key={ask.what} className="flex items-center gap-4 py-[11px]">
              <span className="w-[200px] shrink-0 text-[14px] font-medium leading-[18px] text-pine">
                {ask.what}
              </span>
              <span className="flex h-2 min-w-0 grow overflow-clip rounded-full bg-neutral-100">
                <span className={`rounded-full ${askInk[i]}`} style={{ width: `${ask.share}%` }} />
              </span>
              <span className="w-11 shrink-0 text-right text-[13px] font-semibold leading-[18px] text-pine">
                {ask.share}%
              </span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

/**
 * The sample conversation, drawn as WhatsApp draws it — member bubbles white
 * on a warm ground, the agent's in pine so it is never mistaken for a person.
 */
function Transcript() {
  return (
    <section className="flex w-full shrink-0 flex-col overflow-clip rounded-2xl border border-neutral-200 xl:w-[680px]">
      <header className="flex items-center gap-[14px] border-b border-neutral-200 p-[18px]">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-clay-wash text-[13px] font-semibold leading-4 text-clay-ink">
          TS
        </span>
        <span className="flex min-w-0 grow flex-col gap-0.5">
          <span className="truncate text-[16px] font-semibold leading-[22px] text-pine">
            Tuesday Social · Meru Clay
          </span>
          <span className="truncate font-sans text-[12px] leading-4 text-neutral-500">
            14 members · the agent is in this group
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-neutral-100 px-[11px] py-[5px]">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#2F7D4F]" />
          <span className="font-sans text-[12px] font-semibold leading-4 text-pine">Answering</span>
        </span>
      </header>

      <div className="flex flex-col gap-[18px] bg-[#F1EDE6] p-[22px]">
        {TRANSCRIPT.map((line, i) =>
          line.who === 'divider' ? (
            <div key={`divider-${i}`} className="flex items-center gap-[14px] py-1.5">
              <span className="h-px grow bg-[#DDD8D0]" />
              <span className="shrink-0 font-sans text-[11px] font-semibold uppercase leading-[14px] tracking-[0.1em] text-[#9A9A9A]">
                {line.label}
              </span>
              <span className="h-px grow bg-[#DDD8D0]" />
            </div>
          ) : line.who === 'member' ? (
            <MemberBubble key={`${line.name}-${i}`} line={line} />
          ) : (
            <AgentBubble key={`agent-${i}`} line={line} />
          ),
        )}
      </div>
    </section>
  );
}

function MemberBubble({ line }: { line: Extract<Line, { who: 'member' }> }) {
  return (
    <div className="flex items-start gap-[10px]">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#D9D4CC] text-[11px] font-semibold leading-[14px] text-[#4A463F]">
        {line.initials}
      </span>
      <div className="flex max-w-[430px] flex-col gap-1">
        <div className="flex flex-col gap-[3px] rounded-[14px] bg-white p-3">
          <span className="text-[12px] font-semibold leading-4 text-[#8A5A3B]">{line.name}</span>
          <span className="text-[14px] leading-[21px] text-pine">{line.text}</span>
        </div>
        <span className="pl-1 font-sans text-[11px] leading-[14px] text-[#9A9A9A]">
          {line.stamp}
        </span>
      </div>
    </div>
  );
}

function AgentBubble({ line }: { line: Extract<Line, { who: 'agent' }> }) {
  return (
    <div className="flex items-start gap-[10px]">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-clay text-[11px] font-bold leading-[14px] text-cream">
        M
      </span>
      <div className="flex max-w-[470px] flex-col gap-1">
        <div className="flex flex-col rounded-[14px] bg-pine">
          <div className="flex flex-col gap-[10px] p-[14px]">
            <div className="flex items-center gap-[7px]">
              <span className="text-[12px] font-semibold leading-4 text-clay-light">Meru Clay</span>
              {/* Labelled, always. Nobody in the group should have to guess
                  whether they are talking to Elias or to software. */}
              <span className="flex h-[17px] items-center rounded-[4px] bg-[#2C4436] px-1.5 font-sans text-[10px] font-semibold leading-[13px] tracking-[0.06em] text-[#8FA396]">
                AGENT
              </span>
            </div>
            <p className="text-[14px] leading-[21px] text-[#EDF2EE]">{line.text}</p>
            {line.receipt && (
              <div className="flex flex-col rounded-lg bg-[#213B2C] p-3">
                {line.receipt.map((row, i) => (
                  <div
                    key={row.label}
                    className={`flex items-center justify-between gap-3 ${
                      i === 0 ? 'pb-2' : 'border-t border-[#2C4436] pt-2'
                    }`}
                  >
                    <span className="font-sans text-[12px] leading-4 text-[#8FA396]">
                      {row.label}
                    </span>
                    <span className="text-[14px] font-semibold leading-[18px] text-cream">
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {line.aside && (
              <p className="text-[14px] leading-[21px] text-[#8FA396]">{line.aside}</p>
            )}
          </div>
          {line.buttons?.map((button) => (
            <span
              key={button}
              className="flex items-center justify-center border-t border-[#2C4436] py-[11px] text-[14px] font-medium leading-[18px] text-[#7FC4E8]"
            >
              {button}
            </span>
          ))}
        </div>
        {line.handover ? (
          <span className="flex items-center gap-[7px] pl-1">
            <svg width="13" height="13" viewBox="0 0 13 13" className="shrink-0" aria-hidden>
              <path
                d="M1.8 6.5h8.4M7.4 3.7l2.8 2.8-2.8 2.8"
                fill="none"
                stroke="var(--color-clay)"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="font-sans text-[11px] font-medium leading-[14px] text-clay">
              {line.handover}
            </span>
          </span>
        ) : (
          <span className="pl-1 font-sans text-[11px] leading-[14px] text-[#9A9A9A]">
            {line.stamp}
          </span>
        )}
      </div>
    </div>
  );
}

/** The same switch as the automations tab. */
function Toggle({ on, label }: { on: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`flex h-[22px] w-[38px] shrink-0 items-center rounded-full p-[3px] transition-colors ${
        on ? 'justify-end bg-pine' : 'justify-start bg-neutral-300'
      }`}
    >
      <span className="h-4 w-4 shrink-0 rounded-full bg-white" />
    </button>
  );
}
