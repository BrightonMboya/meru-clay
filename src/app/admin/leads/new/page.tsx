import {
  Btn,
  Choices,
  Eyebrow,
  Field,
  FieldRow,
  Fieldset,
  Head,
  Screen,
} from '@/components/admin/ui';

/**
 * Add a lead — for enquiries that arrive off-platform.
 *
 * ⚠️ DEMO. Styled but unwired; see the note at the top of
 * src/lib/bookings.ts.
 *
 * The consent tick in step 3 is not decoration. WhatsApp only allows a
 * business to open a conversation with someone who has agreed to be messaged,
 * and only with a template Meta has approved — which is why the first message
 * here is a list of templates rather than a text box. See `src/lib/notify.ts`.
 */

const SOURCES = ['Walked in', 'Called us', 'Referred by a member', 'Hotel desk'];

const WANTS = [
  'Adult beginners',
  'Juniors 8–12',
  'Weekend clinic',
  'Court hire only',
  'Private coaching',
];

const TEMPLATES = [
  { name: 'welcome_prices', cost: 'utility · free', on: true },
  { name: 'free_trial_offer', cost: 'utility · free', on: false },
  { name: 'clinic_times', cost: 'utility · free', on: false },
];

const THEN = [
  { label: 'Lands in', value: 'Contacted' },
  { label: 'Free reply window', value: 'opens when he answers' },
  { label: 'Nudge if quiet', value: 'after 2 days' },
  { label: 'Cost tonight', value: 'free · utility template' },
];

const FIRST_MESSAGE =
  'Hi Mussa — Elias from Meru Clay. Good to meet you at the gate. Adult beginners hit on Tuesdays at 18:00 on the clay, and court hire is TSh 15,000 an hour. Shall I keep you a spot this Tuesday?';

export default function AddLeadPage() {
  return (
    <Screen gap={32}>
      <Head
        title="Add a lead"
        blurb="For enquiries that arrive off-platform — a walk-in, a phone call, a member's referral. Ad leads land on the board on their own."
        back={{ label: 'Leads', href: '/admin/leads' }}
        actions={
          <>
            <Btn href="/admin/leads">Cancel</Btn>
            <Btn variant="primary">Save lead</Btn>
          </>
        }
      />

      <div className="flex flex-col items-start gap-12 xl:flex-row">
        <form className="flex min-w-0 grow flex-col">
          <Fieldset step={1} label="Who enquired">
            <FieldRow>
              <Field label="Name" value="Mussa Ngowi" />
              <Field label="WhatsApp number">
                {/* Whether the number is on WhatsApp decides everything that
                    follows, so it is checked here rather than on sending. */}
                <span className="flex h-[46px] items-center justify-between gap-[10px] rounded-[10px] border border-neutral-200 px-[14px]">
                  <span className="text-[15px] font-medium leading-5 text-pine">
                    +255 713 402 556
                  </span>
                  <span className="flex shrink-0 items-center gap-[5px]">
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 13 13"
                      className="shrink-0"
                      aria-hidden
                    >
                      <path
                        d="M2.4 6.8 5 9.4l5.6-6"
                        fill="none"
                        stroke="#2F7D4F"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span className="font-sans text-[12px] font-medium leading-4 text-[#2F7D4F]">
                      on WhatsApp
                    </span>
                  </span>
                </span>
              </Field>
            </FieldRow>
            <Field label="Came from">
              <Choices chosenStyle="ring" chosen={SOURCES[0]} options={SOURCES} />
            </Field>
          </Fieldset>

          <Fieldset step={2} label="What they want">
            <Choices chosenStyle="ring" chosen={WANTS[0]} options={WANTS} />
            <Field label="What they said">
              <textarea
                rows={2}
                defaultValue="Stopped at the gate on his run. Played at school, wants to start again. Free most evenings after six."
                className="min-h-[78px] w-full resize-y rounded-[10px] border border-neutral-200 bg-white p-[14px] text-[15px] leading-[22px] text-pine outline-none transition-colors focus:border-pine/40"
              />
            </Field>
          </Fieldset>

          <Fieldset
            step={3}
            label="First message"
            note="he has not written first, so this must be a template"
            gap={18}
          >
            <div className="flex items-start gap-[14px] rounded-[10px] border border-neutral-200 p-4">
              <span className="mt-px flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] bg-pine">
                <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden>
                  <path
                    d="M2.2 5.6 4.4 7.8 8.8 3.4"
                    fill="none"
                    stroke="#FFFFFF"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span className="flex min-w-0 grow flex-col gap-[3px]">
                <span className="font-sans text-[14px] font-medium leading-[18px] text-pine">
                  He agreed to be messaged on WhatsApp
                </span>
                <span className="font-sans text-[13px] leading-[19px] text-neutral-500">
                  Required before the first template goes out. Recorded against his number with
                  today&rsquo;s date and your name.
                </span>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {TEMPLATES.map((template) => (
                <button
                  key={template.name}
                  type="button"
                  aria-pressed={template.on}
                  className={`flex h-[38px] shrink-0 items-center gap-2 rounded-full px-[14px] transition-colors ${
                    template.on ? 'bg-pine' : 'border border-neutral-200 hover:border-neutral-300'
                  }`}
                >
                  <span
                    className={`font-sans text-[13px] leading-4 ${
                      template.on ? 'font-semibold text-cream' : 'font-medium text-neutral-700'
                    }`}
                  >
                    {template.name}
                  </span>
                  <span
                    className={`font-sans text-[12px] leading-4 ${
                      template.on ? 'text-[#8FA396]' : 'text-neutral-500'
                    }`}
                  >
                    {template.cost}
                  </span>
                </button>
              ))}
              <button
                type="button"
                className="flex h-[38px] shrink-0 items-center rounded-full border border-dashed border-neutral-300 px-[14px] font-sans text-[13px] font-medium leading-4 text-neutral-500 transition-colors hover:border-neutral-400"
              >
                Don&rsquo;t message yet
              </button>
            </div>
          </Fieldset>
        </form>

        <aside className="flex w-full shrink-0 flex-col gap-7 xl:w-[380px]">
          <section className="flex flex-col gap-[14px] rounded-2xl bg-pine p-[22px]">
            <div className="flex items-center justify-between gap-4">
              <span className="font-sans text-[11px] font-semibold uppercase leading-[14px] tracking-[0.13em] text-[#8FA396]">
                Goes out on save
              </span>
              <span className="shrink-0 font-sans text-[12px] leading-4 text-[#8FA396]">
                Swahili available
              </span>
            </div>
            <div className="rounded-[14px] bg-[#213B2C] p-4">
              <p className="text-[14px] leading-[21px] text-[#EDF2EE]">{FIRST_MESSAGE}</p>
            </div>
            <span className="font-sans text-[12px] leading-4 text-[#8FA396]">
              2 variables filled from his record
            </span>
          </section>

          <div className="flex flex-col">
            <div className="pb-[14px]">
              <Eyebrow>THEN</Eyebrow>
            </div>
            {THEN.map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between gap-4 border-t border-neutral-200 py-3"
              >
                <span className="font-sans text-[13px] leading-[18px] text-neutral-500">
                  {row.label}
                </span>
                <span className="text-right text-[13px] font-semibold leading-[18px] text-pine">
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </Screen>
  );
}
