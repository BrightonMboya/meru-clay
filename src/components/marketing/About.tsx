import Image from 'next/image';

export default function About() {
  return (
    <section id="about" className="border-t border-pine/10 bg-cream">
      <div className="mx-auto max-w-[1440px] px-6 py-20 md:px-16 md:py-[120px]">
        {/* Head */}
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between md:gap-20">
          <div className="flex shrink-0 items-center gap-[14px] md:pt-[14px]">
            <span className="h-px w-[28px] bg-clay" />
            <span className="text-[13px] font-semibold tracking-[0.2em] text-[#7E8C84]">
              ABOUT THE CLUB
            </span>
          </div>
          <p className="max-w-[880px] font-display text-[30px] leading-[1.25] tracking-[-0.015em] text-[#1B1C18] sm:text-[38px] md:text-[46px] md:leading-[58px]">
            Clay rewards patience. It slows the ball, lengthens the rally, and asks you to build a
            point instead of ending it. We brought that game to Arusha.
          </p>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-12 pt-14 md:flex-row md:gap-16 md:pt-[90px]">
          {/* Court photo */}
          <div className="relative aspect-[760/470] w-full shrink-0 overflow-clip rounded-[10px] bg-clay md:aspect-auto md:h-[470px] md:w-[760px]">
            <Image
              src="/images/about-sweeping.jpg"
              alt="Groundskeeper sweeping the white lines on a freshly groomed clay tennis court"
              fill
              sizes="(max-width: 768px) 100vw, 760px"
              className="object-cover"
            />
          </div>

          {/* Copy + stats */}
          <div className="flex flex-1 flex-col justify-between gap-10 py-1.5">
            <div className="flex flex-col gap-[26px]">
              <p className="text-[17px] leading-[29px] text-[#3C3F38]">
                Meru Clay is a private tennis club at the foot of Mount Meru, just outside Arusha.
                Two championship clay courts, hand-laid from crushed brick and watered twice daily,
                give you the genuine European clay experience at altitude.
              </p>
              <p className="text-[17px] leading-[29px] text-[#3C3F38]">
                Whether you grew up on hard courts or have never picked up a racquet, the clay is
                forgiving on the knees and unforgiving on the ego. Come learn the surface the pros
                fear most.
              </p>
            </div>
            <div className="flex gap-12 border-t border-pine/10 pt-[34px]">
              <div className="flex flex-col gap-[5px]">
                <span className="font-display text-[24px] font-medium leading-[30px] text-[#1B1C18]">
                  Crushed brick
                </span>
                <span className="text-[12px] font-medium tracking-[0.14em] text-[#7E8C84]">
                  SURFACE
                </span>
              </div>
              <div className="flex flex-col gap-[5px]">
                <span className="font-display text-[24px] font-medium leading-[30px] text-[#1B1C18]">
                  Members + guests
                </span>
                <span className="text-[12px] font-medium tracking-[0.14em] text-[#7E8C84]">
                  ACCESS
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
