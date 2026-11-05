import { Badge, Readings } from '@/components/admin/ui';
import KeepFresh from '@/components/admin/KeepFresh';
import type { Upcoming as UpcomingData, UpcomingSession } from '@/lib/admin/upcoming';
import { fmtTsh } from '@/lib/pricing';
import { fmtTime24 } from '@/lib/time';

/**
 * The coach's screen: who is coming, day by day, built for a phone at the
 * court. This is where the installed app opens — see public/admin.webmanifest.
 *
 * Rendered on the server; `KeepFresh` re-asks when the app comes back to the
 * foreground, so a phone left in a pocket all afternoon does not show the
 * morning's list.
 */
export default function Upcoming({ data }: { data: UpcomingData }) {
  const { totals } = data;

  return (
    <div className="flex min-w-0 grow flex-col gap-8 px-4 py-6 sm:px-10 sm:py-10">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-[5px]">
          <h1 className="text-[26px] font-semibold leading-[32px] tracking-[-0.02em] text-pine sm:text-[28px] sm:leading-[34px]">
            Upcoming
          </h1>
          <p className="font-sans text-[15px] leading-[22px] text-neutral-500">
            Who is on court over the next week, and what to know about them.
          </p>
        </div>
        <KeepFresh />
      </header>

      <Readings
        readings={[
          {
            label: 'Sessions',
            value: String(totals.sessions),
            detail: 'next 7 days',
          },
          {
            label: 'Trials',
            value: String(totals.trials),
            detail: totals.trials === 1 ? 'first-timer' : 'first-timers',
          },
          {
            label: 'Cash to collect',
            value: totals.toCollect ? fmtTsh(totals.toCollect) : '—',
            detail: totals.toCollect ? 'TSh, at the court' : 'nothing owed',
            accent: totals.toCollect > 0,
          },
        ]}
      />

      <div className="flex flex-col gap-9">
        {data.days.map((day) => (
          <section key={day.date} aria-labelledby={`day-${day.date}`} className="flex flex-col gap-3">
            <h2
              id={`day-${day.date}`}
              className="flex items-baseline justify-between gap-3 border-b border-neutral-200 pb-2"
            >
              <span className="text-[17px] font-semibold leading-6 text-pine">{day.label}</span>
              <span className="font-sans text-[13px] text-neutral-500">
                {day.closed
                  ? `Closed · ${day.closed}`
                  : day.sessions.length === 0
                    ? 'Nothing booked'
                    : `${day.sessions.length} session${day.sessions.length === 1 ? '' : 's'}`}
              </span>
            </h2>
            {day.sessions.length > 0 && (
              <ul className="flex flex-col gap-2.5">
                {day.sessions.map((s) => (
                  <Session key={s.id} s={s} />
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function Session({ s }: { s: UpcomingSession }) {
  const wa = s.phone ? `https://wa.me/${s.phone.replace(/\D/g, '')}` : null;

  return (
    <li
      className={`flex gap-4 rounded-xl border p-4 ${
        s.live ? 'border-clay/50 bg-clay-wash/40' : 'border-neutral-200 bg-white'
      }`}
    >
      <div className="flex w-[52px] shrink-0 flex-col font-sans tabular-nums">
        <span className="text-[16px] font-semibold leading-5 text-pine">{fmtTime24(s.start)}</span>
        <span className="text-[13px] leading-5 text-neutral-500">{fmtTime24(s.end)}</span>
        <span className="pt-1 text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-400">
          {s.court.replace('Court ', 'Ct ')}
        </span>
      </div>

      <div className="flex min-w-0 grow flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 break-words text-[16px] font-semibold leading-5 text-pine">
            {s.who}
          </span>
          {s.live && <Badge tone="clay">ON COURT NOW</Badge>}
          {s.kind === 'trial' && <Badge tone="pine">TRIAL</Badge>}
          {s.kind === 'class' && <Badge tone="green">CLASS</Badge>}
          {s.holding && <Badge>UNCONFIRMED</Badge>}
        </div>

        {(s.sub || s.level) && (
          <p className="font-sans text-[14px] leading-5 text-neutral-600">
            {[s.sub, s.level].filter(Boolean).join(' · ')}
          </p>
        )}

        {s.notes && (
          <p className="whitespace-pre-line break-words rounded-lg bg-neutral-50 px-3 py-2 font-sans text-[14px] leading-5 text-neutral-700">
            {s.notes}
          </p>
        )}

        {s.roll.length > 0 && (
          <p className="font-sans text-[14px] leading-5 text-neutral-600">{s.roll.join(', ')}</p>
        )}

        {s.toCollect > 0 && (
          <p className="font-sans text-[14px] font-semibold leading-5 text-clay-ink">
            Collect TSh {fmtTsh(s.toCollect)} cash
          </p>
        )}

        {s.phone && wa && (
          <div className="flex flex-wrap gap-2 pt-1">
            <a
              href={`tel:${s.phone}`}
              className="inline-flex h-9 items-center rounded-full border border-neutral-200 px-4 font-sans text-[13px] font-medium text-pine hover:bg-neutral-50"
            >
              Call
            </a>
            <a
              href={wa}
              target="_blank"
              rel="noopener"
              className="inline-flex h-9 items-center rounded-full border border-neutral-200 px-4 font-sans text-[13px] font-medium text-pine hover:bg-neutral-50"
            >
              WhatsApp
            </a>
          </div>
        )}
      </div>
    </li>
  );
}
