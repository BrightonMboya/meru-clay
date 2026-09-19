import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import BookingStatus from '@/components/booking/BookingStatus';
import Footer from '@/components/marketing/Footer';

/**
 * One player's booking.
 *
 * Never indexed and never listed: the URL contains the booking's UUID, which
 * is the only thing standing between a stranger and somebody's court.
 */
export const metadata: Metadata = {
  title: 'Your booking — Meru Clay',
  robots: { index: false, follow: false },
};

export default async function BookingPage({ params }: PageProps<'/book/[id]'>) {
  const { id } = await params;

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
          <h1 className="pb-8 pt-5 font-display text-[44px] font-medium leading-[0.98] tracking-[-0.025em] text-[#1B1C18]">
            Your booking.
          </h1>

          <BookingStatus id={id} />

          <p className="pt-7 text-[15px] leading-[25px] text-[#5F6B62]">
            Something not right?{' '}
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
