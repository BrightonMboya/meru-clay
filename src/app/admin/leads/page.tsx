import { Btn, Eyebrow, Head, Screen, icons } from '@/components/admin/ui';
import {
  AD_VERDICT,
  ADS,
  BOARD,
  CONVERSATION,
  DRAFT,
  FUNNEL,
  FUNNEL_PERIOD,
  LEAD,
  MEMBER_WORTH,
  MESSAGE_COST,
  NUMBER_HEALTH,
  TEMPLATE_CHIPS,
  WINDOW_CLOSED,
  type Ad,
  type Column,
  type FootTone,
  type Lead,
  type Moment,
} from '@/lib/admin/leads';

export default function LeadsPage() {
  return (
    <Screen gap={32}>
      <Head
        title="Leads"
        blurb="Every enquiry from Instagram and Facebook lands here the moment the form is filled. Nobody gets forgotten."
        actions={
          <>
            <Btn>
              <span className="flex items-center gap-[9px]">
                <span className="h-2 w-2 shrink-0 rounded-full bg-neutral-400" />
                All campaigns
              </span>
            </Btn>
            <Btn>Last 30 days</Btn>
            <Btn icon={icons.chat} href="/admin/whatsapp/templates">
              WhatsApp
            </Btn>
            <Btn variant="primary" icon={icons.plus} href="/admin/leads/new">
              Add a lead
            </Btn>
          </>
        }
      />

      <section className="flex flex-col border-y border-neutral-200">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-3 pt-[14px]">
          <Eyebrow tone="loud">{FUNNEL_PERIOD}</Eyebrow>
          <span className="text-[12px] leading-4 text-neutral-500">{MEMBER_WORTH}</span>
        </div>
        {/* The funnel reads as one figure per step, ruled rather than boxed —
            the same treatment the court desk gives its day. */}
        <div className="flex flex-col pb-[22px] sm:flex-row">
          {FUNNEL.map((step, i) => (
            <div
              key={step.label}
              className={`flex min-w-0 grow basis-0 flex-col gap-[10px] pt-1 ${
                i < FUNNEL.length - 1 ? 'sm:border-r sm:border-neutral-200 sm:pr-5' : ''
              } ${i > 0 ? 'mt-4 sm:mt-0 sm:pl-5' : ''}`}
            >
              <span className="text-[11px] font-semibold leading-[14px] tracking-[0.1em] text-neutral-500">
                {step.label}
              </span>
              <span
                className={`text-[28px] font-semibold leading-[34px] tracking-[-0.02em] ${
                  step.accent ? 'text-clay' : 'text-pine'
                }`}
              >
                {step.value}
              </span>
              <span className="text-[12px] leading-4 text-neutral-600">{step.detail}</span>
            </div>
          ))}
        </div>
      </section>

      <Board />

      <div className="flex flex-col items-start gap-8 xl:flex-row">
        <LeadDetail />
        <Ads />
      </div>
    </Screen>
  );
}

/** The pipeline. Five stages, each a recessed lane of white cards. */
function Board() {
  return (
    <section className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-[26px] font-semibold leading-8 tracking-[-0.02em] text-pine">
            Where everyone stands
          </h2>
          <p className="text-[13px] leading-4 text-neutral-500">
            Drag a card along as the conversation moves. A lead with no touch for two days is
            flagged overdue.
          </p>
        </div>
        {/* What the month's messaging has cost. Free replies are the ones sent
            inside WhatsApp's 24-hour window; templates are billed. */}
        <div className="flex shrink-0 gap-5 rounded-[10px] bg-neutral-100 px-4 py-[10px]">
          {MESSAGE_COST.map((item, i) => (
            <div key={item.label} className="flex gap-5">
              {i > 0 && <span className="w-px shrink-0 bg-neutral-300" />}
              <div className="flex flex-col gap-[3px]">
                <span className="font-sans text-[11px] font-semibold uppercase leading-[14px] tracking-[0.12em] text-neutral-400">
                  {item.label}
                </span>
                <span className="font-sans text-[13px] font-semibold leading-4 text-pine">
                  {item.value}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-[14px] lg:flex-row">
        {BOARD.map((column) => (
          <Lane key={column.stage} column={column} />
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
      {column.leads.map((lead) => (
        <LeadCard key={lead.name} lead={lead} />
      ))}
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
    <article className="flex flex-col gap-[9px] rounded-lg bg-white p-[13px]">
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 text-[14px] font-semibold leading-[18px] text-pine">{lead.name}</h3>
        <span className="shrink-0 text-[11px] font-semibold leading-[14px] text-neutral-400">
          {lead.age}
        </span>
      </div>
      <p className="text-[12px] leading-[17px] text-neutral-600">{lead.note}</p>
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
    </article>
  );
}

/**
 * One lead, opened. The whole point of the card is the composer at the
 * bottom: outside WhatsApp's 24-hour window the coach cannot type freely, so
 * the screen offers the approved templates instead of a disabled text box and
 * no explanation.
 */
function LeadDetail() {
  return (
    <section className="flex min-w-0 grow flex-col gap-[22px] rounded-[18px] border border-neutral-200 bg-white px-[30px] py-7">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex items-center gap-[14px]">
          <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-neutral-100 text-[15px] font-semibold leading-[18px] text-neutral-700">
            {LEAD.initials}
          </span>
          <div className="flex flex-col gap-1">
            <h2 className="text-[24px] font-semibold leading-[30px] tracking-[-0.015em] text-pine">
              {LEAD.name}
            </h2>
            <p className="text-[13px] leading-4 text-neutral-500">{LEAD.sub}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Asking permission to phone is its own step: WhatsApp gives us a
              number, not consent to ring it. */}
          <button
            type="button"
            className="flex items-center gap-[7px] rounded-full border border-neutral-200 px-[15px] py-[9px] transition-colors hover:border-neutral-300"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" className="shrink-0" aria-hidden>
              <path
                d="M2.4 3.4c0-.6.5-1 1-1h1.5c.5 0 .9.3 1 .8l.4 1.7c.1.4-.1.8-.4 1l-.9.6c.7 1.4 1.8 2.5 3.2 3.2l.6-.9c.2-.3.6-.5 1-.4l1.7.4c.5.1.8.5.8 1v1.5c0 .5-.4 1-1 1A11 11 0 0 1 2.4 3.4z"
                fill="none"
                stroke="#A3A3A3"
                strokeWidth="1.3"
                strokeLinejoin="round"
              />
            </svg>
            <span className="font-sans text-[13px] font-medium leading-4 text-pine">
              Ask to call
            </span>
            <span className="font-sans text-[11px] leading-[14px] text-neutral-400">
              not granted
            </span>
          </button>
          <Btn size="sm">Book a trial</Btn>
          <button
            type="button"
            aria-label="More actions"
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border border-neutral-300 text-[14px] font-semibold text-neutral-500 transition-colors hover:bg-neutral-50"
          >
            ···
          </button>
        </div>
      </div>

      <div className="flex flex-col border-y border-neutral-200 py-4 sm:flex-row">
        {LEAD.facts.map((fact, i) => (
          <div
            key={fact.label}
            className={`flex min-w-0 grow basis-0 flex-col gap-[5px] ${
              i < LEAD.facts.length - 1 ? 'sm:border-r sm:border-neutral-200 sm:pr-5' : ''
            } ${i > 0 ? 'mt-3 sm:mt-0 sm:pl-5' : ''}`}
          >
            <span className="text-[10px] font-bold leading-3 tracking-[0.12em] text-neutral-500">
              {fact.label}
            </span>
            <span
              className={`text-[13px] leading-4 ${
                fact.accent ? 'font-semibold text-clay-ink' : 'font-medium text-pine'
              }`}
            >
              {fact.value}
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-col">
        <div className="pb-4">
          <Eyebrow tone="loud">THE CONVERSATION SO FAR</Eyebrow>
        </div>
        {CONVERSATION.map((moment, i) => (
          <MomentRow
            key={`${moment.day}-${moment.time}`}
            moment={moment}
            last={i === CONVERSATION.length - 1}
          />
        ))}
      </div>

      <Composer />
    </section>
  );
}

const momentDot: Record<Moment['kind'], string> = {
  inbound: 'bg-neutral-400',
  outbound: 'bg-neutral-300',
  due: 'bg-clay',
};

function MomentRow({ moment, last }: { moment: Moment; last: boolean }) {
  const due = moment.kind === 'due';
  return (
    <div className={`flex items-start gap-[14px] ${last ? '' : 'pb-[18px]'}`}>
      <div className="flex w-[78px] shrink-0 flex-col gap-0.5">
        <span
          className={`text-[12px] font-semibold leading-4 ${due ? 'text-clay-ink' : 'text-pine'}`}
        >
          {moment.day}
        </span>
        <span className="text-[11px] leading-[14px] text-neutral-400">{moment.time}</span>
      </div>
      <span className={`mt-1 h-[9px] w-[9px] shrink-0 rounded-full ${momentDot[moment.kind]}`} />
      <div className="flex min-w-0 grow flex-col gap-[3px]">
        <span className="text-[14px] font-medium leading-[18px] text-pine">{moment.what}</span>
        <span className="text-[13px] leading-4 text-neutral-600">{moment.detail}</span>
        {(moment.tag || moment.aside) && (
          <div className="flex flex-wrap items-center gap-2 pt-[5px]">
            {moment.tag && (
              <span className="flex items-center gap-[5px] rounded-md bg-neutral-100 px-[7px] py-0.5">
                {moment.kind === 'outbound' ? (
                  // Two ticks, in WhatsApp's blue — the message was read.
                  <svg width="12" height="10" viewBox="0 0 12 10" className="shrink-0" aria-hidden>
                    <path
                      d="M1 5.4 3 7.6 7.2 2.2M5.2 6.6l.9 1L10.6 2"
                      fill="none"
                      stroke="#4A8FE0"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <svg width="10" height="10" viewBox="0 0 10 10" className="shrink-0" aria-hidden>
                    <path
                      d="M5.6 1.8 2.8 8.2 1 5.8"
                      fill="none"
                      stroke="#A3A3A3"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
                <span className="font-sans text-[11px] font-medium leading-[14px] text-neutral-500">
                  {moment.tag}
                </span>
              </span>
            )}
            {moment.aside && (
              <span className="font-sans text-[11px] font-medium leading-[14px] text-neutral-400">
                {moment.aside}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Composer() {
  return (
    <div className="flex flex-col overflow-clip rounded-xl border border-neutral-200">
      <div className="flex items-start gap-[10px] bg-clay-wash px-4 py-[13px]">
        <svg width="15" height="15" viewBox="0 0 15 15" className="mt-px shrink-0" aria-hidden>
          <circle
            cx="7.5"
            cy="7.5"
            r="6"
            fill="none"
            stroke="var(--color-clay)"
            strokeWidth="1.3"
          />
          <path
            d="M7.5 4.6v3.2l2 1.4"
            fill="none"
            stroke="var(--color-clay)"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
        <div className="flex flex-col gap-[3px]">
          <span className="font-sans text-[13px] font-semibold leading-4 text-clay">
            {WINDOW_CLOSED.headline}
          </span>
          <p className="font-sans text-[13px] leading-[19px] text-[#8A5540]">
            {WINDOW_CLOSED.detail}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-[10px] border-b border-neutral-200 bg-neutral-100 px-4 py-[15px]">
        <svg width="14" height="14" viewBox="0 0 14 14" className="shrink-0" aria-hidden>
          <rect
            x="2.6"
            y="6.2"
            width="8.8"
            height="6.2"
            rx="1.3"
            fill="none"
            stroke="#A3A3A3"
            strokeWidth="1.3"
          />
          <path
            d="M4.8 6.2V4.6a2.2 2.2 0 0 1 4.4 0v1.6"
            fill="none"
            stroke="#A3A3A3"
            strokeWidth="1.3"
          />
        </svg>
        <span className="text-[15px] leading-[18px] text-neutral-400">{WINDOW_CLOSED.locked}</span>
      </div>

      <div className="flex flex-col gap-[11px] p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <span className="text-[11px] font-semibold uppercase leading-[14px] tracking-[0.13em] text-neutral-400">
            Approved templates
          </span>
          <span className="text-[13px] leading-4 text-neutral-500">4 approved · 1 in review</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {TEMPLATE_CHIPS.map((template) => (
            <button
              key={template.name}
              type="button"
              disabled={template.state === 'pending'}
              aria-pressed={template.state === 'chosen'}
              className={`flex shrink-0 items-center gap-2 rounded-full px-[13px] py-2 transition-colors ${
                template.state === 'chosen'
                  ? 'bg-pine'
                  : template.state === 'pending'
                    ? 'cursor-not-allowed bg-neutral-100'
                    : 'border border-neutral-200 hover:border-neutral-300'
              }`}
            >
              <span
                className={`text-[13px] leading-4 ${
                  template.state === 'chosen'
                    ? 'font-semibold text-cream'
                    : template.state === 'pending'
                      ? 'font-medium text-neutral-400'
                      : 'font-medium text-pine'
                }`}
              >
                {template.name}
              </span>
              <span
                className={`text-[11px] font-medium leading-[14px] ${
                  template.state === 'chosen' ? 'text-[#9AAAA1]' : 'text-neutral-400'
                }`}
              >
                {template.cost}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 px-4 pb-4">
        <div className="flex flex-col gap-[7px] rounded-xl bg-neutral-100 px-4 py-[14px]">
          <p className="text-[15px] leading-[23px] text-pine">{DRAFT.body}</p>
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            {DRAFT.meta.map((item, i) => (
              <span key={item} className="flex items-center gap-2">
                {i > 0 && <span className="h-[10px] w-px shrink-0 bg-neutral-300" />}
                <span className="text-[11px] font-medium leading-[14px] text-neutral-400">
                  {item}
                </span>
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <span className="min-w-0 grow text-[13px] leading-4 text-neutral-500">{DRAFT.note}</span>
          <Btn variant="primary">Send template</Btn>
        </div>
      </div>
    </div>
  );
}

/**
 * Which ads actually work, ranked by cost per member won rather than by leads
 * — an ad that brings twenty people who never join is worse than one that
 * brings five who do.
 */
function Ads() {
  return (
    <aside className="flex w-full shrink-0 flex-col gap-4 xl:w-[452px]">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-[22px] font-semibold leading-7 tracking-[-0.015em] text-pine">
          Which ads actually work
        </h2>
        <span className="shrink-0 text-[12px] leading-4 text-neutral-500">by member won</span>
      </div>

      <div className="flex flex-col border-t border-neutral-200">
        {ADS.map((ad) => (
          <AdRow key={ad.name} ad={ad} />
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-[14px] bg-pine p-5">
        <Eyebrow tone="inverse">WHAT THE NUMBERS SAY</Eyebrow>
        <p className="text-[19px] font-semibold leading-[26px] tracking-[-0.01em] text-cream">
          {AD_VERDICT.headline}
        </p>
        <p className="text-[13px] leading-5 text-neutral-400">{AD_VERDICT.detail}</p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            className="rounded-full bg-clay px-4 py-[10px] text-[12px] font-semibold leading-4 text-white transition-colors hover:bg-clay/90"
          >
            Move the budget
          </button>
          <button
            type="button"
            className="rounded-full border border-[#3C5244] px-4 py-[10px] text-[12px] font-semibold leading-4 text-cream transition-colors hover:bg-white/5"
          >
            Open Meta Ads
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-[14px] rounded-[14px] border border-neutral-200 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-[3px]">
            <span className="text-[17px] font-semibold leading-[22px] tracking-[-0.01em] text-pine">
              {NUMBER_HEALTH.name}
            </span>
            <span className="font-sans text-[13px] leading-4 text-neutral-500">
              {NUMBER_HEALTH.number}
            </span>
          </div>
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-neutral-100 px-[10px] py-1">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-pine" />
            <span className="font-sans text-[11px] font-semibold leading-[14px] text-pine">
              Verified
            </span>
          </span>
        </div>
        <dl className="flex flex-col border-t border-neutral-200">
          {NUMBER_HEALTH.facts.map((fact, i) => (
            <div
              key={fact.label}
              className={`flex items-center justify-between gap-4 py-[11px] ${
                i < NUMBER_HEALTH.facts.length - 1 ? 'border-b border-neutral-200' : ''
              }`}
            >
              <dt className="text-[13px] leading-4 text-neutral-500">{fact.label}</dt>
              <dd className="text-[13px] font-semibold leading-4 text-pine">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </aside>
  );
}

function AdRow({ ad }: { ad: Ad }) {
  return (
    <div className="flex items-center gap-[14px] border-b border-neutral-200/70 px-0.5 py-[15px]">
      <div className="flex min-w-0 grow flex-col gap-1">
        <span className="truncate text-[14px] font-semibold leading-[18px] text-pine">
          {ad.name}
        </span>
        <span className="truncate text-[12px] leading-4 text-neutral-500">{ad.detail}</span>
      </div>
      <div className="flex w-[104px] shrink-0 flex-col gap-[5px]">
        {/* The best-performing ad sets the scale, so the bars compare with each
            other rather than against a notional target. */}
        <span
          className={`h-[5px] rounded-full ${ad.share === 1 ? 'bg-pine' : ad.share < 0.1 ? 'bg-neutral-300' : 'bg-neutral-400'}`}
          style={{ width: `${Math.max(ad.share * 100, 6)}%` }}
        />
        <span className="text-[11px] leading-[14px] text-neutral-500">{ad.cost}</span>
      </div>
      <div className="flex w-[60px] shrink-0 justify-end">
        <span
          className={`text-[17px] font-semibold leading-[22px] ${
            ad.rate === '0%' ? 'text-neutral-400' : 'text-pine'
          }`}
        >
          {ad.rate}
        </span>
      </div>
    </div>
  );
}
