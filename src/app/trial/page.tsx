import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import TrialForm from '@/components/checkout/TrialForm';
import Footer from '@/components/marketing/Footer';
import { TRIAL_FEE, TRIAL_WINDOW_DAYS, fmtTsh } from '@/lib/pricing';
import { closedOn } from '@/lib/schedule';
import { addDays, nowLocal, weekdayOf } from '@/lib/time';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Try tennis on clay — Meru Clay, Arusha',
  description: `Book a coached trial session at Meru Clay, Tanzania's first true clay court. TSh ${fmtTsh(TRIAL_FEE)}, paid by mobile money.`,
  alternates: { canonical: '/trial' },
};

/**
 * The paid trial — where the ads land.
 *
 * One screen, one job: name, number, a day and time, and a USSD prompt. Everything a
 * visitor off Instagram needs to decide is above the form on a phone, and
 * nothing links away from it except the club's WhatsApp.
 *
 * The days are computed here rather than in the browser, so the strip agrees
 * with what `/api/trial` will accept: tomorrow through `TRIAL_WINDOW_DAYS`,
 * at the club's clock rather than the visitor's.
 */
export default function TrialPage() {
  const today = nowLocal().date;
  // Not on a day the courts are shut every week (Monday maintenance).
  const days = Array.from({ length: TRIAL_WINDOW_DAYS }, (_, i) => addDays(today, i + 1)).filter(
    (d) => !closedOn(weekdayOf(d)),
  );

  return (
    <>
      <main className="bg-cream">
        <section className="relative overflow-clip bg-pine">
          <div className="absolute inset-0">
            <Image
              src="/images/court-lesson.jpg"
              alt="A coach feeding balls to a player on the red clay at Meru Clay"
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
          </div>
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                'linear-gradient(0deg, rgba(13,30,22,0.94) 0%, rgba(13,30,22,0.6) 45%, rgba(13,30,22,0.35) 100%)',
            }}
          />

          <nav className="relative z-10 mx-auto flex w-full max-w-[1440px] items-center px-6 py-6 md:px-16 md:py-8">
            <Link href="/" className="flex items-center gap-3">
              <Image
                src="/images/logo-badge.png"
                alt="Meru Clay crest"
                width={44}
                height={44}
                className="h-11 w-11 shrink-0 rounded-lg object-cover"
              />
              <span className="font-display text-[22px] font-semibold text-white">Meru Clay</span>
            </Link>
          </nav>

          <div className="relative z-10 mx-auto flex w-full max-w-[720px] flex-col px-6 pb-12 pt-16 md:px-10 md:pb-16 md:pt-24">
            <span className="text-[12px] font-bold tracking-[0.18em] text-clay-light">
              TRIAL SESSION · TSH {fmtTsh(TRIAL_FEE)}
            </span>
            <h1 className="pt-4 font-display text-[44px] font-medium leading-[0.98] tracking-[-0.025em] text-cream md:text-[60px]">
              Book your first <span className="italic text-clay-light">tennis</span> session.
            </h1>
            <p className="max-w-[52ch] pt-5 text-[17px] leading-[28px] text-mist">
              Pick a day and a time, book your spot, and show up on court. Need a different time
              later? Just let us know.
            </p>
          </div>
        </section>

        <div className="mx-auto flex w-full max-w-[720px] flex-col px-6 pb-24 pt-10 md:px-10">
          <TrialForm days={days} fee={TRIAL_FEE} />

          <ul className="flex flex-col gap-3 pt-10 text-[15px] leading-[25px] text-[#3C3F38]">
            <li>
              <strong className="text-[#13271D]">Where.</strong> Meru Clay Tennis Club, Oltrumet,
              Ngaramtoni — Arusha.
            </li>
            <li>
              <strong className="text-[#13271D]">How you pay.</strong> M-Pesa, Airtel Money, Mixx
              by Yas or Halotel. A prompt comes to your phone; enter your PIN to approve.
            </li>
            <li>
              <strong className="text-[#13271D]">Need to move it?</strong> WhatsApp us and we will
              find you another time.
            </li>
          </ul>

          <p className="pt-7 text-[15px] leading-[25px] text-[#5F6B62]">
            Questions first?{' '}
            <a
              href="https://wa.me/255782628288"
              target="_blank"
              rel="noopener"
              className="text-clay underline underline-offset-4"
            >
              WhatsApp us on +255 782 628 288
            </a>
            .
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
