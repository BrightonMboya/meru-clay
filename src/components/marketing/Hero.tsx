import Image from 'next/image';
import Link from 'next/link';

import JoinDialog from '@/components/marketing/JoinDialog';

const nav = [
  { label: 'About', href: '#about' },
  { label: 'The Courts', href: '#courts' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Visit', href: '#visit' },
];

export default function Hero() {
  return (
    <section className="relative flex min-h-[640px] flex-col justify-between overflow-clip bg-pine lg:h-[880px]">
      {/* Background photo */}
      <div className="absolute inset-0">
        <Image
          src="/images/hero-court.jpg"
          alt="Overhead view of a player serving on the red clay at Meru Clay, long shadows across the court"
          fill
          priority
          sizes="100vw"
          className="object-cover object-[80%_50%] sm:object-[center_50%]"
        />
      </div>
      {/* Scrims */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[230px]"
        style={{
          backgroundImage:
            'linear-gradient(180deg, rgba(13,30,22,0.62) 0%, rgba(13,30,22,0) 100%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[560px]"
        style={{
          backgroundImage:
            'linear-gradient(0deg, rgba(13,30,22,0.92) 0%, rgba(13,30,22,0.55) 32%, rgba(13,30,22,0) 70%)',
        }}
      />

      {/* Nav */}
      <nav className="relative z-10 mx-auto flex w-full max-w-[1440px] items-center justify-between px-6 py-6 md:px-16 md:py-8">
        <a href="#" className="flex items-center gap-3">
          <Image
            src="/images/logo-badge.png"
            alt="Meru Clay crest"
            width={44}
            height={44}
            className="h-11 w-11 shrink-0 rounded-lg object-cover"
          />
          <span className="font-display text-[22px] font-semibold text-white">Meru Clay</span>
        </a>

        <div className="hidden items-center gap-10 lg:flex">
          {nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-[14px] font-medium tracking-[0.04em] text-cream-200 transition-colors hover:text-white"
            >
              {item.label}
            </a>
          ))}
        </div>

        <Link
          href="/book"
          className="rounded-full bg-white px-[22px] py-[11px] text-[14px] font-semibold text-pine transition-transform hover:scale-[1.03]"
        >
          Book a Court
        </Link>
      </nav>

      {/* Hero content */}
      <div className="relative z-10 mx-auto flex w-full max-w-[1440px] flex-col px-6 pb-14 md:px-16 md:pb-[76px]">
        <h1 className="font-display text-cream">
          <span className="block text-[10vw] font-light leading-[0.96] tracking-[-0.03em] sm:text-[64px] lg:text-[104px] lg:leading-[94px]">
            Tanzania&apos;s first
          </span>
          <span className="flex flex-wrap items-baseline gap-x-4 text-[10vw] font-semibold leading-[1.0] tracking-[-0.03em] sm:gap-x-[26px] sm:text-[64px] lg:text-[104px] lg:leading-[100px]">
            <span>true</span>
            <span className="italic text-clay-light">clay</span>
            <span>court.</span>
          </span>
        </h1>

        <div className="flex flex-col items-start gap-8 pt-9 md:flex-row md:items-end md:justify-between">
          <p className="max-w-[440px] text-[17px] leading-[27px] text-mist md:text-[18px] md:leading-[28px] xl:max-w-[720px]">
            Crushed brick, the slow red bounce, and the long shadow of Mount Meru. A members&apos;
            tennis club built around the most beautiful surface in the game.
          </p>
          <div className="flex shrink-0 flex-wrap items-center gap-[14px]">
            <JoinDialog>
              <button
                type="button"
                className="rounded-full bg-clay px-[30px] py-4 text-[15px] font-semibold text-white transition-transform hover:scale-[1.03]"
              >
                Become a Member
              </button>
            </JoinDialog>
            <Link
              href="/book"
              className="rounded-full border border-cream/40 px-[30px] py-4 text-[15px] font-medium text-cream transition-colors hover:border-cream"
            >
              Book a Court
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
