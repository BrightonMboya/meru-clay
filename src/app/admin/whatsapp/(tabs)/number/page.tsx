import { Eyebrow } from '@/components/admin/ui';

/**
 * Number & opt-outs — the health of the club's single sending number, and
 * everyone who has told it to stop.
 *
 * ⚠️ DEMO. See the note at the top of src/lib/bookings.ts.
 *
 * The daily cap counts *conversations the club starts*, not messages: a reply
 * inside the 24-hour window is free and uncapped. Meta raises the cap on its
 * own while the quality rating holds, which is why the rating sits beside it.
 */

const DELIVERY = [
  { label: 'Sent', value: '78' },
  { label: 'Delivered', value: '76' },
  { label: 'Read', value: '69' },
  { label: 'Failed', value: '2', accent: true },
];

const PLUMBING = [
  { label: 'Webhook', value: 'Receiving · last event 2 min ago' },
  { label: 'Phone number ID', value: '109882447301556' },
  { label: 'Billing', value: 'TSh 990 this month · card ending 4417' },
];

const OPTED_OUT = [
  { name: 'Zawadi Lyimo', how: 'replied STOP · 3 Sept', still: 'replies still free' },
  {
    name: 'Salma Juma',
    how: 'tapped Stop these messages · 2 Sept',
    still: 'replies still free',
  },
  { name: 'Frank Urio', how: 'asked Elias in person · 28 Aug', still: 'replies still free' },
  { name: 'Joseph Temba', how: 'blocked the number · 21 Aug', still: 'cannot message' },
];

const CAP = { used: 14, limit: 250 };

export default function NumberPage() {
  return (
    <div className="flex flex-col items-start gap-12 xl:flex-row">
      <div className="flex min-w-0 grow flex-col">
        <section className="flex flex-col gap-5 pb-[30px] pt-[26px]">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="flex flex-col gap-1">
              <span className="text-[22px] font-semibold leading-7 tracking-[-0.01em] text-pine">
                +255 736 118 400
              </span>
              <span className="font-sans text-[14px] leading-5 text-neutral-500">
                Meru Clay Tennis · display name approved 12 June
              </span>
            </div>
            <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-neutral-100 px-[11px] py-[5px]">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#2F7D4F]" />
              <span className="font-sans text-[12px] font-semibold leading-4 text-pine">
                Connected
              </span>
            </span>
          </div>

          <div className="flex flex-col gap-[10px] rounded-[10px] bg-neutral-100 p-[18px]">
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <span className="font-sans text-[13px] font-medium leading-[18px] text-neutral-700">
                People the club may start a conversation with, per day
              </span>
              <span className="text-[15px] font-semibold leading-5 text-pine">
                {CAP.used} of {CAP.limit}
              </span>
            </div>
            <div className="flex h-2 overflow-clip rounded-full bg-neutral-200">
              <span
                className="rounded-full bg-pine"
                style={{ width: `${(CAP.used / CAP.limit) * 100}%` }}
              />
            </div>
            <p className="font-sans text-[13px] leading-[19px] text-neutral-500">
              Meta raises this on its own while the quality rating stays high. Replies inside the
              24-hour window never count against it.
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-[18px] border-t border-neutral-200 pb-[30px] pt-[26px]">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <Eyebrow>DELIVERY · LAST 7 DAYS</Eyebrow>
            <span className="text-[12px] leading-4 text-neutral-500">quality rating: high</span>
          </div>
          <div className="flex flex-col sm:flex-row">
            {DELIVERY.map((stat, i) => (
              <div
                key={stat.label}
                className={`flex min-w-0 grow basis-0 flex-col gap-[5px] ${
                  i < DELIVERY.length - 1 ? 'sm:border-r sm:border-neutral-200 sm:pr-6' : ''
                } ${i > 0 ? 'mt-4 sm:mt-0 sm:pl-6' : ''}`}
              >
                <span className="font-sans text-[12px] leading-4 text-neutral-500">
                  {stat.label}
                </span>
                <span
                  className={`text-[24px] font-semibold leading-[30px] tracking-[-0.01em] ${
                    stat.accent ? 'text-clay' : 'text-pine'
                  }`}
                >
                  {stat.value}
                </span>
              </div>
            ))}
          </div>
          <p className="font-sans text-[13px] leading-5 text-neutral-500">
            Both failures were numbers not on WhatsApp — Peter Mwakalinga and one lead from the clay
            court ad. They are flagged on the board to call instead.
          </p>
        </section>

        <section className="flex flex-col border-t border-neutral-200 pt-[26px]">
          <div className="pb-4">
            <Eyebrow>THE PLUMBING</Eyebrow>
          </div>
          <dl className="flex flex-col">
            {PLUMBING.map((row) => (
              <div
                key={row.label}
                className="flex flex-wrap items-center justify-between gap-4 border-t border-neutral-200 py-[13px]"
              >
                <dt className="font-sans text-[14px] leading-[18px] text-neutral-500">
                  {row.label}
                </dt>
                <dd className="text-[14px] font-medium leading-[18px] text-pine">{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <aside className="flex w-full shrink-0 flex-col gap-7 pt-[26px] xl:w-[380px]">
        <div className="flex flex-col">
          <div className="flex items-baseline justify-between gap-4 pb-[14px]">
            <Eyebrow>OPTED OUT OF MARKETING</Eyebrow>
            <span className="text-[12px] leading-4 text-neutral-500">
              {OPTED_OUT.length} people
            </span>
          </div>
          {OPTED_OUT.map((person) => (
            <div
              key={person.name}
              className="flex items-center gap-3 border-t border-neutral-200 py-[13px]"
            >
              <span className="flex min-w-0 grow flex-col gap-0.5">
                <span className="truncate text-[14px] font-medium leading-[18px] text-pine">
                  {person.name}
                </span>
                <span className="truncate font-sans text-[12px] leading-4 text-neutral-500">
                  {person.how}
                </span>
              </span>
              <span className="shrink-0 font-sans text-[12px] leading-4 text-neutral-500">
                {person.still}
              </span>
            </div>
          ))}
        </div>

        {/* Said plainly, because the consequence is permanent and the screen is
            the only place anyone will read it. */}
        <div className="flex flex-col gap-[10px] rounded-2xl bg-clay-wash p-5">
          <p className="text-[15px] font-semibold leading-[21px] text-[#7A3218]">
            An opt-out is forever, not for this campaign
          </p>
          <p className="font-sans text-[13px] leading-5 text-[#8A4A30]">
            Broadcasts skip these four automatically and there is no way to add them back from here.
            If someone changes their mind they have to message the club first.
          </p>
        </div>
      </aside>
    </div>
  );
}
