import Image from 'next/image';

const team = [
  {
    bg: '#C75B39',
    figure: '#F6F2E9',
    role: 'CLUB DIRECTOR',
    name: 'Daphne Schreur',
    bio: 'Runs Meru Clay day to day — the courts, the calendar, the community. Her aim is simple: keep championship clay open and welcoming to all of Arusha.',
  },
  {
    bg: '#13271D',
    figure: '#C75B39',
    photo: '/images/coach-richard.jpg',
    role: 'HEAD COACH',
    name: 'Richard',
    bio: 'Grew up by the AICC courts in Kijenge, taught by the local coaches. Maasai, and on a court for as long as he can remember.',
  },
  {
    bg: '#8A958C',
    figure: '#F6F2E9',
    role: 'COACH',
    name: 'Coming soon',
    bio: 'A new face is joining the team. Their name and story will live here shortly.',
  },
];

export default function Team() {
  return (
    <section id="team" className="bg-cream">
      <div className="mx-auto max-w-[1440px] px-6 py-20 md:px-16 md:py-[118px]">
        {/* Head */}
        <div className="flex flex-col gap-8 pb-12 md:flex-row md:items-end md:justify-between md:pb-[58px]">
          <div className="flex flex-col gap-[26px]">
            <div className="flex items-center gap-[14px]">
              <span className="h-px w-[28px] bg-clay" />
              <span className="text-[13px] font-semibold tracking-[0.2em] text-[#7E8C84]">
                THE TEAM
              </span>
            </div>
            <h2 className="font-display text-[40px] font-medium leading-[1.0] tracking-[-0.02em] text-[#1B1C18] sm:text-[52px] lg:text-[64px]">
              The people on
              <br />
              the dirt with you.
            </h2>
          </div>
          <a
            href="#pricing"
            className="text-[14px] font-medium tracking-[0.04em] text-clay transition-opacity hover:opacity-70 md:pb-[10px]"
          >
            Book a lesson →
          </a>
        </div>

        {/* Members */}
        <div className="grid gap-7 md:grid-cols-3">
          {team.map((member) => (
            <div key={member.name} className="flex flex-col">
              <div
                className="relative flex h-[380px] items-end justify-center overflow-clip rounded-[12px]"
                style={{ backgroundColor: member.bg }}
              >
                {member.photo ? (
                  <Image
                    src={member.photo}
                    alt={`${member.name}, ${member.role.toLowerCase()} at Meru Clay`}
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="object-cover object-top"
                  />
                ) : (
                  <svg
                    width="200"
                    height="270"
                    viewBox="0 0 200 270"
                    xmlns="http://www.w3.org/2000/svg"
                    className="shrink-0"
                  >
                    <circle cx="100" cy="92" r="46" fill={member.figure} />
                    <path d="M16 270c0-52 38-86 84-86s84 34 84 86z" fill={member.figure} />
                  </svg>
                )}
                <span className="absolute left-[22px] top-[22px] flex h-10 w-10 items-center justify-center rounded-full border border-cream/30">
                  <span className="h-px w-[18px] rotate-[34deg] bg-clay" />
                </span>
              </div>
              <div className="flex flex-col gap-[9px] pt-[22px]">
                <span className="text-[12px] font-bold tracking-[0.16em] text-clay">
                  {member.role}
                </span>
                <h3 className="font-display text-[27px] font-medium leading-[34px] tracking-[-0.01em] text-[#1B1C18]">
                  {member.name}
                </h3>
                <p className="pt-0.5 text-[15px] leading-[24px] text-[#3C3F38]">{member.bio}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
