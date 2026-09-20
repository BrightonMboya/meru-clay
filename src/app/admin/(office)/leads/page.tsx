import { Suspense } from 'react';
import LeadBoard from '@/components/admin/LeadBoard';
import { Btn, Eyebrow, Head, Screen, icons } from '@/components/admin/ui';
import { loadLeadBoard, loadNumberPanel, loadPipeline } from '@/lib/admin/load';
import { isPeriod, type Period } from '@/lib/pipeline';

export const dynamic = 'force-dynamic';

/**
 * Leads.
 *
 * Every figure on this screen is counted from rows at the moment it is drawn
 * — the funnel, the send meter and the state of the sending number. The last
 * of those is read from Meta's Graph API rather than from the database, and
 * says so plainly when it cannot be.
 *
 * The window and the campaign are read from the query string — `?days=7`,
 * `?campaign=Ramadan+push` — and narrow the funnel and the board together.
 * Nothing on the screen sets them today; the route handler behind the
 * board's refresh reads the same two, so a link into the screen stays
 * correct when it polls.
 */
export default async function LeadsPage({ searchParams }: PageProps<'/admin/leads'>) {
  const q = await searchParams;

  const raw = Array.isArray(q.days) ? q.days[0] : q.days;
  const days: Period = isPeriod(raw) ? (Number(raw) as Period) : 30;
  const campaignParam = Array.isArray(q.campaign) ? q.campaign[0] : q.campaign;
  const campaign = campaignParam?.trim() || null;

  // The number panel is deliberately not awaited here. Everything else on
  // this screen comes from our own database in a few hundred milliseconds;
  // that panel is a call out to Meta, and an external API having a bad
  // minute must not be the reason the desk cannot see who is waiting for a
  // reply. It streams in underneath instead — see <SendingNumber>.
  const [board, pipeline] = await Promise.all([
    loadLeadBoard({ campaign, days }),
    loadPipeline(days, campaign),
  ]);

  const { funnel } = pipeline;

  return (
    <Screen gap={32}>
      <Head
        title="Leads"
        blurb="Every enquiry from Instagram and Facebook lands here the moment the form is filled. Nobody gets forgotten."
        actions={
          <Btn variant="primary" icon={icons.plus} href="/admin/leads/new">
            Add a lead
          </Btn>
        }
      />

      <section className="flex flex-col border-y border-neutral-200">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-3 pt-[14px]">
          <Eyebrow tone="loud">{funnel.period}</Eyebrow>
          <span className="text-[12px] leading-4 text-neutral-500">{funnel.standing}</span>
        </div>
        {/* The funnel reads as one figure per step, ruled rather than boxed —
            the same treatment the court desk gives its day. */}
        <div className="flex flex-col pb-[22px] sm:flex-row">
          {funnel.steps.map((step, i) => (
            <div
              key={step.label}
              className={`flex min-w-0 grow basis-0 flex-col gap-[10px] pt-1 ${
                i < funnel.steps.length - 1 ? 'sm:border-r sm:border-neutral-200 sm:pr-5' : ''
              } ${i > 0 ? 'mt-4 sm:mt-0 sm:pl-5' : ''}`}
            >
              <span className="text-[11px] font-semibold leading-[14px] tracking-[0.1em] text-neutral-500">
                {step.label}
              </span>
              <span
                className={`text-[28px] font-semibold leading-[34px] tracking-[-0.02em] ${
                  step.accent ? 'text-clay' : 'text-pine'
                }`}
              >
                {step.value}
              </span>
              <span className="text-[12px] leading-4 text-neutral-600">{step.detail}</span>
            </div>
          ))}
        </div>
      </section>

      <LeadBoard initial={board} scope={{ campaign, days }} />

      <div className="w-full xl:max-w-[452px]">
        <Suspense fallback={<NumberSkeleton />}>
          <SendingNumber />
        </Suspense>
      </div>
    </Screen>
  );
}

/** The panel's shape while Meta is being asked. */
function NumberSkeleton() {
  return (
    <div className="flex flex-col gap-[14px] rounded-[14px] border border-neutral-200 p-5">
      <div className="flex flex-col gap-[3px]">
        <span className="h-[22px] w-40 animate-pulse rounded bg-neutral-100" />
        <span className="h-4 w-56 animate-pulse rounded bg-neutral-100" />
      </div>
      <div className="flex flex-col gap-[11px] border-t border-neutral-200 pt-[11px]">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="h-4 w-full animate-pulse rounded bg-neutral-100" />
        ))}
      </div>
      <span className="text-[12px] leading-4 text-neutral-400">Asking Meta about the number…</span>
    </div>
  );
}

/**
 * The sending number.
 *
 * Read from Meta, not from us. When it cannot be read the panel says why
 * instead of showing a rating nobody asked for — a quality score the club
 * invented would be the most misleading thing on the screen, because it is
 * the one figure that decides whether messages arrive at all.
 */
async function SendingNumber() {
  const panel = await loadNumberPanel();

  if ('error' in panel) {
    return (
      <div className="flex flex-col gap-2 rounded-[14px] border border-neutral-200 p-5">
        <span className="text-[17px] font-semibold leading-[22px] tracking-[-0.01em] text-pine">
          The sending number
        </span>
        <p className="text-[13px] leading-[19px] text-neutral-500">
          Meta could not be asked about it: {panel.error} Until it answers, nothing about the
          number&rsquo;s standing is shown here rather than something invented.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[14px] rounded-[14px] border border-neutral-200 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-[3px]">
          <span className="text-[17px] font-semibold leading-[22px] tracking-[-0.01em] text-pine">
            {panel.name}
          </span>
          <span className="font-sans text-[13px] leading-4 text-neutral-500">
            {panel.number} · sending number
          </span>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-neutral-100 px-[10px] py-1">
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              panel.verified ? 'bg-pine' : 'bg-neutral-400'
            }`}
          />
          <span className="font-sans text-[11px] font-semibold leading-[14px] text-pine">
            {panel.verified ? 'Verified' : 'Not verified'}
          </span>
        </span>
      </div>
      <dl className="flex flex-col border-t border-neutral-200">
        {panel.facts.map((fact, i) => (
          <div
            key={fact.label}
            className={`flex items-center justify-between gap-4 py-[11px] ${
              i < panel.facts.length - 1 ? 'border-b border-neutral-200' : ''
            }`}
          >
            <dt className="text-[13px] leading-4 text-neutral-500">{fact.label}</dt>
            <dd
              className={`text-right text-[13px] font-semibold leading-4 ${
                fact.accent ? 'text-clay' : 'text-pine'
              }`}
            >
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
