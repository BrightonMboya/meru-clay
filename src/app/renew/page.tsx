import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import RenewForm from '@/components/checkout/RenewForm';
import Footer from '@/components/marketing/Footer';
import { MEMBERSHIP_TIERS, fmtTsh, lapses, MEMBERSHIPS } from '@/lib/pricing';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Renew your membership — Meru Clay, Arusha',
  description:
    'Members of Meru Clay in Arusha can renew their subscription here. Enter your number and we will send a payment link to WhatsApp.',
  alternates: { canonical: '/renew' },
};

/**
 * Renew a membership.
 *
 * A public page for people who already belong to the club, which is an odd
 * thing to need until you remember there are no member accounts here — so
 * the only way back to somebody's subscription is a link, and this is where
 * they ask for one.
 *
 * The prices are published on it because a member about to pay should see
 * what they are paying before they commit, and because the page is otherwise
 * a single text box and a button, which reads like a phishing form.
 */
export default function RenewPage() {
  const tiers = MEMBERSHIPS.filter(lapses).map((t) => ({ key: t, ...MEMBERSHIP_TIERS[t] }));

  return (
    <>
      <main className="bg-cream">
        <nav className="sticky top-0 z-20 border-b border-pine/[0.12] bg-[#FBF8F1]/90 backdrop-blur-sm">
          <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between px-6 py-6 md:px-16 md:py-8">
            <Link href="/" className="flex items-center gap-3">
              <Image
                src="/images/logo-badge.png"
                alt="Meru Clay crest"
                width={44}
                height={44}
                className="h-11 w-11 shrink-0 rounded-lg object-cover"
              />
              <span className="font-display text-[22px] font-semibold text-[#13271D]">
                Meru Clay
              </span>
            </Link>
            <Link
              href="/book"
              className="rounded-full bg-clay px-[22px] py-[11px] text-[14px] font-semibold text-white transition-transform hover:scale-[1.03]"
            >
              Book a Court
            </Link>
          </div>
        </nav>

        <div className="mx-auto flex w-full max-w-[720px] flex-col px-6 pb-24 pt-6 md:px-10">
          <h1 className="pt-5 font-display text-[44px] font-medium leading-[0.98] tracking-[-0.025em] text-[#1B1C18]">
            Renew your membership.
          </h1>

          <p className="max-w-[58ch] pb-9 pt-[18px] text-[17px] leading-[28px] text-[#3C3F38]">
            Enter the number you are a member on and we will send a payment link to your WhatsApp.
            Paying early never loses you time — a new term starts the day your current one ends.
          </p>

          <RenewForm />

          <div className="flex flex-col gap-4 pt-10">
            <span className="text-[12px] font-bold tracking-[0.18em] text-clay">
              WHAT A TERM COSTS
            </span>
            <div className="grid gap-3 sm:grid-cols-2">
              {tiers.map((t) => (
                <div
                  key={t.key}
                  className="flex flex-col gap-1.5 rounded-[10px] border border-pine/[0.14] bg-white px-5 py-4"
                >
                  <span className="font-display text-[20px] text-[#13271D]">{t.label}</span>
                  <span className="font-display text-[26px] leading-[30px] text-clay">
                    TSh {fmtTsh(t.fee)}
                  </span>
                  <span className="text-[14px] leading-[22px] text-[#5F6B62]">{t.detail}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="pt-7 text-[15px] leading-[25px] text-[#5F6B62]">
            Not a member yet?{' '}
            <Link href="/#pricing" className="text-clay underline underline-offset-4">
              See how to join
            </Link>
            , or{' '}
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
