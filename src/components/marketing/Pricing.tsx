import JoinDialog from '@/components/marketing/JoinDialog';
import { COURT_HIRE, MEMBERSHIP_TIERS, SESSION_PACKS, fmtTsh } from '@/lib/pricing';

/**
 * Pay as you go, for everyone. The same two prices whatever the age, so one
 * card rather than three that said the same thing.
 */
const payg = [
  { label: 'Group', dur: '1 hr', price: '15,000' },
  { label: 'Private', dur: '1 hr', price: '30,000' },
];

/**
 * Membership, straight off `SESSION_PACKS` so the page, the join form and the
 * charge can never disagree. Each pack shows what it saves against paying for
 * the same number of sessions one at a time, at the hour's court price —
 * which is what a session from a pack stands in for.
 */
const packs = SESSION_PACKS.map((p, i) => ({
  sessions: p.sessions,
  label: p.label.toUpperCase(),
  total: fmtTsh(p.fee),
  save: `Save TSh ${fmtTsh(p.sessions * COURT_HIRE[60] - p.fee)}`,
  best: i === SESSION_PACKS.length - 1,
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
                PRICING
              </span>
            </div>
            <h2 className="flex flex-col font-display text-[48px] font-medium tracking-[-0.02em] lg:text-[64px]">
              <span className="leading-[0.97] text-[#1B1C18]">Play more.</span>
              <span className="italic leading-[1.0] text-clay">Pay less.</span>
            </h2>
          </div>
          <div className="flex max-w-[430px] flex-col gap-[18px] md:pt-2">
            <p className="text-[16px] leading-[27px] text-[#3C3F38]">
              Become a member with a pack of sessions, paid up front by mobile money, then book
              your courts online with your number. The bigger the pack, the less each session
              costs. Or pay as you go while you find your rhythm.
            </p>
            <span className="font-display text-[15px] italic text-[#7E8C84]">
              All prices in Tanzanian shillings.
            </span>
          </div>
        </div>

        {/* 01 Membership — session packs */}
        <div className="flex flex-col gap-8 rounded-[12px] bg-clay p-8 md:flex-row md:gap-11 md:p-11">
          <div className="flex shrink-0 flex-col justify-center gap-[14px] md:basis-[230px]">
            <span className="text-[11px] font-bold tracking-[0.18em] text-[#FBE6DE]">
              MEMBERSHIP
            </span>
            <span className="font-display text-[34px] font-medium italic leading-[38px] text-cream">
              Buy sessions. Book online.
            </span>
          </div>
          <div className="grid flex-1 sm:grid-cols-2 lg:grid-cols-4">
            {packs.map((pack) => (
              <div
                key={pack.sessions}
                className="flex flex-col gap-3 border-t border-cream/25 py-5 first:border-t-0 first:pt-1 sm:px-6 sm:py-4 sm:[&:nth-child(-n+2)]:border-t-0 sm:[&:nth-child(even)]:border-l lg:border-l lg:border-t-0 lg:py-1 lg:first:border-l-0"
              >
                <span className="text-[12px] font-semibold tracking-[0.1em] text-[#FBE6DE]">
                  {pack.label}
                </span>
                <span className="text-[34px] font-bold leading-[42px] tracking-[0.01em] text-cream">
                  {pack.total}
                </span>
                <span className="text-[15px] font-semibold text-cream">{pack.save}</span>
                <JoinDialog sessions={pack.sessions}>
                  <button
                    type="button"
                    className={`mt-1.5 self-start rounded-full px-[18px] py-2 text-[13px] font-semibold transition-transform hover:scale-[1.03] ${
                      pack.best
                        ? 'bg-cream text-[#B0492E]'
                        : 'border border-cream/45 text-cream'
                    }`}
                  >
                    {pack.best ? 'Best value — choose' : 'Choose'}
                  </button>
                </JoinDialog>
              </div>
            ))}
          </div>
        </div>

        {/* 02 Kids — a monthly membership, not a pack */}
        <div className="mt-6 flex flex-col gap-6 rounded-[10px] border border-clay/30 bg-clay/10 px-[30px] py-[26px] md:flex-row md:items-center md:gap-11">
          <div className="flex shrink-0 flex-col gap-1.5 md:basis-[230px]">
            <span className="text-[11px] font-bold tracking-[0.18em] text-clay">KIDS</span>
            <span className="font-display text-[26px] font-medium italic leading-[32px] text-[#1B1C18]">
              Unlimited group classes
            </span>
          </div>
          <div className="flex flex-1 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-baseline gap-2">
              <span className="text-[30px] font-bold leading-[38px] text-[#1B1C18]">
                {fmtTsh(MEMBERSHIP_TIERS.kids.fee)}
              </span>
              <span className="font-display text-[15px] italic text-[#7E8C84]">a month</span>
            </span>
            <JoinDialog kids>
              <button
                type="button"
                className="self-start rounded-full bg-clay px-[22px] py-2.5 text-[14px] font-semibold text-white transition-transform hover:scale-[1.03] sm:self-auto"
              >
                Choose
              </button>
            </JoinDialog>
          </div>
        </div>

        {/* 03 Pay as you go */}
        <div className="mt-6 flex flex-col gap-6 rounded-[10px] border border-pine/10 bg-[#FBF8F1] px-[30px] py-[26px] md:flex-row md:items-center md:gap-11">
          <div className="flex shrink-0 flex-col gap-1.5 md:basis-[230px]">
            <span className="text-[11px] font-bold tracking-[0.18em] text-clay">
              PAY AS YOU GO
            </span>
            <span className="font-display text-[26px] font-medium italic leading-[32px] text-[#1B1C18]">
              Session by session
            </span>
            <span className="text-[14px] text-[#7E8C84]">Kids, teens &amp; adults</span>
          </div>
          <div className="grid flex-1 gap-x-11 sm:grid-cols-2">
            {payg.map((row) => (
              <div
                key={row.label}
                className="flex items-baseline justify-between gap-4 border-t border-pine/10 py-[14px] sm:border-t-0"
              >
                <span className="flex items-baseline gap-2">
                  <span className="text-[15px] font-medium text-[#1B1C18]">{row.label}</span>
                  <span className="font-display text-[13px] italic text-[#7E8C84]">{row.dur}</span>
                </span>
                <span className="text-[16px] font-bold text-[#1B1C18]">{row.price}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
