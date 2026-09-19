import Image from 'next/image';
import Link from 'next/link';

const whatsapp = 'https://wa.me/255782628288';

export default function Cta() {
  return (
    <section className="relative flex flex-col items-center overflow-clip bg-pine px-6 py-24 text-center md:px-16 md:py-[120px]">
      <Image
        src="/images/cta-bounce.jpg"
        alt="Player mid-stride chasing a ball across the red clay"
        fill
        sizes="100vw"
        className="object-cover"
      />
      {/* Slight black overlay for contrast */}
      <div className="absolute inset-0 bg-black/25" />

      <div className="relative flex max-w-[640px] flex-col items-center">
        <span className="text-[13px] font-semibold tracking-[0.22em] text-[#FBE6DE]">
          MEMBERSHIPS OPEN FOR 2026
        </span>

        <h2 className="flex flex-col items-center pt-10 font-display text-[48px] font-medium tracking-[-0.025em] text-cream sm:text-[64px] lg:text-[76px] lg:leading-[74px]">
          <span>Come find</span>
          <span className="flex flex-wrap items-baseline justify-center gap-x-6">
            <span>your</span>
            <span className="italic text-clay-light">bounce.</span>
          </span>
        </h2>

        <p className="max-w-[460px] pt-[26px] text-[18px] leading-[28px] text-cream/90">
          Reserve a court, book your first lesson, or come watch a set from the terrace. The dirt is
          waiting.
        </p>

        <div className="flex flex-col items-center gap-[14px] pt-10">
          <Link
            href="/book"
            className="rounded-full bg-clay px-[36px] py-[17px] text-[16px] font-semibold text-white transition-transform hover:scale-[1.03]"
          >
            Book a Court
          </Link>
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener"
            className="text-[15px] text-cream/80 underline underline-offset-4 transition-colors hover:text-cream"
          >
            or message us on WhatsApp
          </a>
        </div>
      </div>
    </section>
  );
}
