import { WEEK_IN_DISPLAY_ORDER } from '@/lib/schedule';
import { fmtRange, fmtTime } from '@/lib/time';

const dropin = [
  {
    kicker: 'ADULTS',
    name: 'Adults',
    ages: '18 +',
    rows: [
      { label: 'Group clinic', dur: '1 hr', price: '15,000' },
      { label: 'Group social', dur: '1.5 hr', price: '15,000' },
      { label: 'Private', dur: '1 hr', price: '30,000' },
      { label: 'Private', dur: '1.5 hr', price: '45,000' },
    ],
  },
  {
    kicker: 'TEENAGERS',
    name: 'Teens',
    ages: '10 – 17 yrs',
    rows: [
      { label: 'Group clinic', dur: '1.5 hr', price: '15,000' },
      { label: 'Private', dur: '1 hr', price: '30,000' },
    ],
  },
  {
    kicker: 'KIDS',
    name: 'Kids',
    ages: '4 – 9 yrs',
    rows: [
      { label: 'Group clinic', dur: '1 hr', price: '15,000' },
      { label: 'Private', dur: '1 hr', price: '30,000' },
    ],
  },
];

const punch = [
  {
    qty: '12 CLASSES / 6 PRIVATES',
    total: '180,000',
    per: '15,000 per class',
    badge: 'STANDARD',
    highlight: false,
  },
  {
    qty: '24 CLASSES / 12 PRIVATES',
    total: '324,000',
    per: '13,500 per class',
    badge: 'SAVE 10%',
    highlight: true,
  },
  {
    qty: '40 CLASSES / 20 PRIVATES',
    total: '480,000',
    per: '12,000 per class',
    badge: 'SAVE 20%',
    highlight: true,
  },
];

// The weekly grid lives in src/lib/schedule.ts so that the booking engine and
// this table can never disagree about when a court is in use.
const schedule = WEEK_IN_DISPLAY_ORDER.map((day) => ({
  day: day.label,
  weekend: day.weekend,
  rows: day.rows.map((row) => ({
    time: day.showRange ? fmtRange(row.start, row.end) : fmtTime(row.start),
    name: row.name,
    age: row.age,
  })),
}));

export default function Pricing() {
  return (
    <section id="pricing" className="bg-cream">
      <div className="mx-auto max-w-[1440px] px-6 py-20 md:px-16 md:py-[118px]">
        {/* Head */}
        <div className="flex flex-col gap-8 pb-12 md:flex-row md:items-start md:justify-between md:gap-20 md:pb-[58px]">
          <div className="flex flex-col gap-[26px]">
            <div className="flex items-center gap-[14px]">
              <span className="text-[13px] font-bold tracking-[0.2em] text-clay">03</span>
              <span className="text-[13px] font-semibold tracking-[0.2em] text-[#7E8C84]">
                SCHEDULE &amp; PRICING
              </span>
            </div>
            <h2 className="flex flex-col font-display text-[48px] font-medium tracking-[-0.02em] lg:text-[64px]">
              <span className="leading-[0.97] text-[#1B1C18]">Play more.</span>
              <span className="italic leading-[1.0] text-clay">Pay less.</span>
            </h2>
          </div>
          <div className="flex max-w-[430px] flex-col gap-[18px] md:pt-2">
            <p className="text-[16px] leading-[27px] text-[#3C3F38]">
              Punch cards reward the players who keep showing up. Twelve, twenty-four or forty
              classes: the more you commit, the less you pay per session. Drop-ins are still
              welcome while you find your rhythm.
            </p>
            <span className="font-display text-[15px] italic text-[#7E8C84]">
              All prices in Tanzanian shillings.
            </span>
          </div>
        </div>

        {/* 01 Drop-in */}
        <div className="flex items-center gap-[14px] border-t border-pine/20 pb-[26px] pt-[22px]">
          <span className="h-px w-[24px] bg-clay" />
          <span className="text-[12px] font-bold tracking-[0.18em] text-[#1B1C18]">
            SINGLE CLASS · DROP-IN
          </span>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {dropin.map((card) => (
            <div
              key={card.name}
              className="flex flex-col rounded-[10px] border border-pine/10 bg-[#FBF8F1] px-[30px] pb-3 pt-[30px]"
            >
              <span className="mb-3 text-[11px] font-bold tracking-[0.18em] text-clay">
                {card.kicker}
              </span>
              <span className="mb-1.5 font-display text-[30px] font-medium italic leading-[36px] text-[#1B1C18]">
                {card.name}
              </span>
              <span className="mb-[22px] text-[14px] text-[#7E8C84]">{card.ages}</span>
              {card.rows.map((row, i) => (
                <div
                  key={`${row.label}-${row.dur}-${i}`}
                  className="flex items-baseline justify-between gap-4 border-t border-pine/10 py-[14px]"
                >
                  <span className="flex items-baseline gap-2">
                    <span className="text-[15px] font-medium text-[#1B1C18]">{row.label}</span>
                    <span className="font-display text-[13px] italic text-[#7E8C84]">
                      {row.dur}
                    </span>
                  </span>
                  <span className="text-[16px] font-bold text-[#1B1C18]">{row.price}</span>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* 02 Punch cards */}
        <div className="mt-6 flex flex-col gap-8 rounded-[12px] bg-clay p-8 md:flex-row md:gap-11 md:p-11">
          <div className="flex shrink-0 flex-col justify-center gap-[14px] md:basis-[230px]">
            <span className="text-[11px] font-bold tracking-[0.18em] text-[#FBE6DE]">
              PUNCH CARDS
            </span>
            <span className="font-display text-[34px] font-medium italic leading-[34px] text-cream">
              Save up to 20%.
            </span>
          </div>
          <div className="flex flex-1 flex-col sm:flex-row">
            {punch.map((tier) => (
              <div
                key={tier.qty}
                className="flex flex-1 flex-col gap-3 border-cream/25 py-4 first:border-t-0 first:pt-1 [border-top-width:1px] sm:border-l sm:border-t-0 sm:px-7 sm:py-1 sm:first:pt-1"
              >
                <span className="text-[12px] font-semibold tracking-[0.1em] text-[#FBE6DE]">
                  {tier.qty}
                </span>
                <span className="text-[34px] font-bold leading-[42px] tracking-[0.01em] text-cream">
                  {tier.total}
                </span>
                <span className="font-display text-[15px] italic text-[#FBE6DE]">{tier.per}</span>
                {tier.highlight ? (
                  <span className="mt-1.5 self-start rounded-[6px] bg-cream px-[13px] py-1.5 text-[11px] font-semibold tracking-[0.12em] text-[#B0492E]">
                    {tier.badge}
                  </span>
                ) : (
                  <span className="mt-1.5 self-start rounded-[6px] border border-cream/45 px-[13px] py-1.5 text-[11px] font-semibold tracking-[0.12em] text-cream">
                    {tier.badge}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 03 Weekly schedule */}
        <div className="mt-14 flex items-center justify-between border-t border-pine/20 pb-6 pt-[22px]">
          <div className="flex items-center gap-[14px]">
            <span className="h-px w-[24px] bg-clay" />
            <span className="text-[12px] font-bold tracking-[0.18em] text-[#1B1C18]">
              WEEKLY SCHEDULE
            </span>
          </div>
          <span className="hidden font-display text-[14px] italic text-[#7E8C84] sm:block">
            two clay courts · floodlit court 1
          </span>
        </div>

        <div className="flex flex-col border-t border-pine/15 md:flex-row">
          {schedule.map((col) => (
            <div
              key={col.day}
              className={`flex flex-1 flex-col border-t border-pine/10 py-5 first:border-t-0 md:border-l md:border-t-0 md:px-4 md:first:border-l-0 ${
                col.weekend ? 'bg-clay/5' : ''
              }`}
            >
              <span
                className={`pb-2 text-[13px] font-bold tracking-[0.1em] md:pb-4 ${
                  col.weekend ? 'text-clay' : 'text-[#1B1C18]'
                }`}
              >
                {col.day}
              </span>
              {/* mobile: sessions in a row-wrap grid; desktop: stacked column */}
              <div className="grid grid-cols-2 gap-x-4 sm:grid-cols-3 md:grid-cols-1 md:gap-x-0">
                {col.rows.length === 0 ? (
                  /* A day with no club session is not an empty day — both
                     courts are open from six to nine and can be booked by the
                     hour. Saying so is the point of the column. */
                  <div className="flex flex-col gap-0.5 border-t border-pine/10 py-3">
                    <span className="text-[12px] font-semibold tracking-[0.02em] text-[#9AA39B]">
                      6:00 AM – 9:00 PM
                    </span>
                    <span className="font-display text-[15px] italic leading-[18px] text-[#7E8C84]">
                      Courts open
                    </span>
                  </div>
                ) : (
                  col.rows.map((row, i) => (
                    <div
                      key={`${row.name}-${i}`}
                      className="flex flex-col gap-0.5 border-t border-pine/10 py-3 md:border-t"
                    >
                      <span className="text-[12px] font-semibold tracking-[0.02em] text-[#3C3F38]">
                        {row.time}
                      </span>
                      <span className="font-display text-[15px] italic leading-[18px] text-[#1B1C18]">
                        {row.name}
                      </span>
                      {row.age && <span className="text-[12px] text-[#9AA39B]">{row.age}</span>}
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
