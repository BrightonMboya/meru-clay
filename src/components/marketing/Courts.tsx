import Image from 'next/image';
import Link from 'next/link';
import { COURTS, lastPlay } from '@/lib/availability';
import { OPEN_MIN, fmtTime24 } from '@/lib/time';

/**
 * Two courts, one card each. The hours come from the same constants the
 * booking engine uses, so the page cannot drift from what /book will sell:
 * Court A runs to close under floodlights, Court B stops at dusk.
 */
const photos: Record<number, { img: string; pos: string; alt: string }> = {
  1: {
    img: '/images/court-floodlit.jpg',
    pos: 'object-[center_50%]',
    alt: 'Court A at dusk, floodlight mast standing over the net and the red clay',
  },
  2: {
    img: '/images/court-academy.jpg',
    pos: 'object-[center_40%]',
    alt: 'Court B seen from the baseline, its crushed-brick clay running up to the tree line',
  },
};

const courts = COURTS.map((c) => ({
  ...c,
  ...photos[c.id],
  badge: c.floodlit ? 'FLOODLIT' : 'DAYLIGHT',
  blurb: c.floodlit
    ? 'The match court. Floodlights carry play long after the midday heat lifts, so an evening set runs right through to closing.'
    : 'The quieter court, under the trees. No lights, so the last ball goes up at dusk — the pick for a morning hit or a lesson.',
  specs: [
    { k: 'Surface', v: 'Hand-laid crushed brick' },
    { k: 'Hours', v: `${fmtTime24(OPEN_MIN)} — ${fmtTime24(lastPlay(c.id))}` },
    { k: 'Lights', v: c.floodlit ? 'Yes, to closing' : 'None, dusk finish' },
  ],
}));

export default function Courts() {
  return (
    <section id="courts" className="bg-pine">
      <div className="mx-auto max-w-[1440px] px-6 py-20 md:px-16 md:py-[115px]">
        {/* Head */}
        <div className="flex flex-col gap-8 pb-12 md:flex-row md:items-end md:justify-between md:pb-16">
          <div className="flex flex-col gap-[26px]">
            <div className="flex items-center gap-[14px]">
              <span className="h-px w-[28px] bg-clay" />
              <span className="text-[13px] font-semibold tracking-[0.2em] text-[#7E8C84]">
                THE CLUB &amp; COURTS
              </span>
            </div>
            <h2 className="font-display text-[40px] font-medium leading-[1.0] tracking-[-0.02em] text-cream sm:text-[52px] lg:text-[64px]">
              Two courts,
              <br />
              one standard.
            </h2>
          </div>
          <p className="max-w-[360px] text-[16px] leading-[27px] text-[#C9D2CB] md:pb-2">
            Both hand-laid over a limestone base, brushed and watered twice a day for a true, slow
            bounce. The only difference between them is the light.
          </p>
        </div>

        {/* One card per court */}
        <div className="grid gap-6 md:grid-cols-2">
          {courts.map((court) => (
            <article
              key={court.id}
              className="flex flex-col overflow-clip rounded-[12px] border border-cream/10 bg-[#19311F]"
            >
              <div className="relative h-[260px] w-full overflow-clip lg:h-[320px]">
                <Image
                  src={court.img}
                  alt={court.alt}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className={`object-cover ${court.pos}`}
                />
                <span
                  className={`absolute left-5 top-5 rounded-full px-[11px] py-[5px] text-[11px] font-bold tracking-[0.14em] backdrop-blur-sm ${
                    court.floodlit ? 'bg-clay/85 text-white' : 'bg-pine/70 text-cream-200'
                  }`}
                >
                  {court.badge}
                </span>
              </div>

              <div className="flex flex-1 flex-col px-[30px] pb-[34px] pt-7">
                <h3 className="font-display text-[34px] font-medium leading-[38px] text-cream">
                  {court.name}
                </h3>
                <p className="pt-3.5 text-[15px] leading-[25px] text-[#A9B4AC]">{court.blurb}</p>

                <dl className="mt-7 flex flex-col gap-0 border-t border-cream/10 pt-1">
                  {court.specs.map((s) => (
                    <div
                      key={s.k}
                      className="flex items-baseline justify-between gap-4 border-b border-cream/10 py-[13px]"
                    >
                      <dt className="text-[12px] font-bold tracking-[0.14em] text-[#7E8C84]">
                        {s.k.toUpperCase()}
                      </dt>
                      <dd className="text-right text-[15px] text-cream-200">{s.v}</dd>
                    </div>
                  ))}
                </dl>

                <Link
                  href="/book"
                  className="mt-7 self-start rounded-full border border-cream/25 px-[26px] py-[11px] text-[14px] font-medium text-cream transition-colors hover:border-cream hover:bg-cream/5"
                >
                  Book {court.name}
                </Link>
              </div>
            </article>
          ))}
        </div>

        {/*
          What used to be a third card. Coaching is not a court, so it reads as a
          footnote to the pair rather than a sibling of them.
        */}
        <p className="max-w-[720px] pt-10 text-[15px] leading-[26px] text-[#A9B4AC]">
          Clay-specialist coaches and a junior academy work across both courts, and the pro shop
          keeps balls, grips and strings — from a first lesson to match prep.
        </p>
      </div>
    </section>
  );
}
