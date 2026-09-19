import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import BookingWidget, { type CourtCol, type Day } from '@/components/booking/BookingWidget';
import Footer from '@/components/marketing/Footer';
import { COURTS, lastPlay } from '@/lib/availability';
import { bookableDates, fmtDayLabel, fmtLongDay, fmtTime24 } from '@/lib/time';

// Rendered on request: the date strip has to start from today, and the
// availability it loads is live.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Book a court — Meru Clay, Arusha',
  description:
    'Reserve one of two championship clay courts at Meru Clay, Arusha. Pick a day, choose your time, and the coach is notified straight away.',
  alternates: { canonical: '/book' },
};

const whatsapp = 'https://wa.me/255782628288';

const nav = [
  { label: 'About', href: '/#about' },
  { label: 'The Courts', href: '/#courts' },
  { label: 'Pricing', href: '/#pricing' },
  { label: 'Visit', href: '/#visit' },
];

export default function BookPage() {
  const days: Day[] = bookableDates().map((d) => ({
    iso: d,
    long: fmtLongDay(d),
    ...fmtDayLabel(d),
  }));

  // Court B has no floodlights, so its column advertises a shorter day. Both the
  // badge and the note read from `lastPlay`, the same function freeSlots uses.
  const courts: CourtCol[] = COURTS.map((c) => ({
    id: c.id,
    name: c.name,
    floodlit: c.floodlit,
    badge: c.floodlit ? 'FLOODLIT' : `LAST PLAY ${fmtTime24(lastPlay(c.id))}`,
    note: c.floodlit ? null : `Nothing after six — ${c.name} has no lights.`,
  }));

  return (
    <>
      <main className="bg-cream">
        {/* Nav — same shape and sizes as the hero nav, in the dark-on-cream palette. */}
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

            <div className="hidden items-center gap-10 lg:flex">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-[14px] font-medium tracking-[0.04em] text-[#3C3F38] transition-colors hover:text-[#13271D]"
                >
                  {item.label}
                </Link>
              ))}
            </div>

            <a
              href="#booking"
              aria-current="page"
              className="rounded-full bg-clay px-[22px] py-[11px] text-[14px] font-semibold text-white transition-transform hover:scale-[1.03]"
            >
              Book a Court
            </a>
          </div>
        </nav>

        {/*
          One column. The calendar is the page. Court lighting lives on the badges
          in step 3, where the choice is made; everything else about how a booking
          works has moved into the confirmation, where it is actually read.
        */}
        <div className="mx-auto flex w-full max-w-[1040px] flex-col px-6 pb-24 pt-6 md:px-10 lg:pb-[90px]">
          <h1 className="pt-5 font-display text-[44px] font-medium leading-[0.98] tracking-[-0.025em] text-[#1B1C18] sm:text-[54px]">
            Book your Court.
          </h1>

          <p className="max-w-[58ch] pb-9 pt-[18px] text-[17px] leading-[28px] text-[#3C3F38]">
            You will receive a booking confirmation via WhatsApp.
          </p>

          <BookingWidget days={days} courts={courts} />

          <p className="pt-7 text-[15px] leading-[25px] text-[#5F6B62]">
            Prefer to talk to someone?{' '}
            <a
              href={whatsapp}
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
