import Image from 'next/image';
import Link from 'next/link';

type FooterLink = { label: string; href: string; external?: boolean };

const columns: { heading: string; links: FooterLink[] }[] = [
  {
    heading: 'EXPLORE',
    links: [
      { label: 'About', href: '/#about' },
      { label: 'Team', href: '/#team' },
      { label: 'Visit', href: '/#visit' },
    ],
  },
  {
    heading: 'PLAY',
    links: [
      { label: 'Book a Court', href: '/book' },
      { label: 'Membership', href: '/#pricing' },
      { label: 'Coaching', href: '/#team' },
    ],
  },
  {
    heading: 'CONTACT',
    links: [
      { label: '+255 782 628 288', href: 'tel:+255782628288' },
      { label: 'Ngaramtoni, Arusha', href: '/#visit' },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="bg-[#0E1E16]">
      <div className="mx-auto max-w-[1440px] px-6 pb-10 pt-16 md:px-16 md:pt-20">
        <div className="flex flex-col gap-12 border-b border-cream/10 pb-12 md:flex-row md:justify-between md:gap-20 md:pb-16">
          <div className="flex max-w-[340px] flex-col gap-5">
            <div className="flex items-center gap-3">
              <Image
                src="/images/logo-badge.png"
                alt="Meru Clay crest"
                width={44}
                height={44}
                className="h-11 w-11 shrink-0 rounded-lg object-cover"
              />
              <span className="font-display text-[22px] font-semibold text-cream">Meru Clay</span>
            </div>
            <p className="text-[15px] leading-[25px] text-[#7E8C84]">
              Tanzania&apos;s first true clay tennis club, at the foot of Mount Meru in Arusha.
            </p>
          </div>

          <div className="flex flex-wrap gap-12 md:gap-[88px]">
            {columns.map((col) => (
              <div key={col.heading} className="flex flex-col gap-4">
                <span className="text-[12px] font-semibold tracking-[0.16em] text-[#7E8C84]">
                  {col.heading}
                </span>
                {col.links.map((link) =>
                  link.href.startsWith('/') ? (
                    <Link
                      key={link.label}
                      href={link.href}
                      className="text-[15px] text-[#C9D2CB] transition-colors hover:text-cream"
                    >
                      {link.label}
                    </Link>
                  ) : (
                    <a
                      key={link.label}
                      href={link.href}
                      {...(link.external ? { target: '_blank', rel: 'noopener' } : {})}
                      className="text-[15px] text-[#C9D2CB] transition-colors hover:text-cream"
                    >
                      {link.label}
                    </a>
                  ),
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-7 text-[13px] text-[#5E6E66] sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 Meru Clay Tennis Club. All rights reserved.</span>
          <span>Arusha · Tanzania</span>
        </div>
      </div>
    </footer>
  );
}
