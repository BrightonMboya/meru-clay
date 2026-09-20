import { Btn, Eyebrow, Field, Fieldset, Head, Screen } from '@/components/admin/ui';

/**
 * Writing a new template.
 *
 * ⚠️ DEMO. Styled but unwired; see the note at the top of
 * src/lib/bookings.ts.
 *
 * Meta reads every word before approving, and the category decides both the
 * price and the rules — so the checklist in the rail is the real content of
 * this screen. A utility template that mentions a price is a marketing
 * template, and comes back rejected.
 */

const CATEGORIES = [
  {
    name: 'Utility',
    price: 'Free',
    priceTone: 'good' as const,
    detail: 'Follows something they did — a booking, a payment, a question they asked.',
    on: true,
  },
  {
    name: 'Marketing',
    price: 'TSh 11',
    priceTone: 'plain' as const,
    detail: 'An offer, an invitation, news. Needs an opt-out button.',
    on: false,
  },
  {
    name: 'Authentication',
    detail: 'One-time codes. The club has no use for these.',
    on: false,
    muted: true,
  },
];

const BODY =
  "Hi {{1}}, your court is booked. {{2}} at {{3}} on Court {{4}}. The gate code is 1908. If something changes, reply here and we'll move it.";

const BUTTONS = [
  { kind: 'Reply', label: 'Thanks, see you there', count: '20 / 25' },
  { kind: 'Reply', label: 'I need to change it', count: '19 / 25' },
];

const PREVIEW =
  "Hi Neema, your court is booked. Saturday 20 September at 08:00 on Court 1. The gate code is 1908. If something changes, reply here and we'll move it.";

/** The pre-flight checklist. `tick` is done, `warn` and `note` are not. */
const CHECKS = [
  {
    kind: 'tick' as const,
    text: 'Every variable has a sample value. Meta rejects templates it cannot read.',
  },
  {
    kind: 'tick' as const,
    text: 'No prices or offers in a utility template — that makes it marketing, and it will come back rejected.',
  },
  {
    kind: 'warn' as const,
    text: 'The Kiswahili version is still empty. Templates can be submitted one language at a time.',
  },
  {
    kind: 'note' as const,
    text: "A rejection is not a penalty. Fix the wording and send it again — it does not affect the number's quality rating.",
  },
];

export default function NewTemplatePage() {
  return (
    <Screen gap={32}>
      <Head
        title="New template"
        blurb="Meta reads every word before approving. Write it as a person would say it, and name the thing the club is actually answering."
        back={{ label: 'WhatsApp · Templates', href: '/admin/whatsapp/templates' }}
        actions={
          <>
            <Btn>Save draft</Btn>
            <Btn variant="primary">Submit to Meta</Btn>
          </>
        }
      />

      <div className="flex flex-col items-start gap-12 xl:flex-row">
        <form className="flex min-w-0 grow flex-col">
          <Fieldset step={1} label="Name and kind">
            <Field
              label="Name"
              hint="lowercase and underscores · never shown to the reader"
              value="court_booking_confirmed"
            />
            <div className="flex flex-col gap-[14px] sm:flex-row">
              {CATEGORIES.map((category) => (
                <button
                  key={category.name}
                  type="button"
                  aria-pressed={category.on}
                  className={`flex min-w-0 grow basis-0 flex-col gap-1.5 rounded-[10px] p-4 text-left transition-colors ${
                    category.on
                      ? 'border-[1.5px] border-pine'
                      : 'border border-neutral-200 hover:border-neutral-300'
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-[10px]">
                    <span
                      className={`text-[15px] font-semibold leading-5 ${
                        category.muted ? 'text-neutral-500' : 'text-pine'
                      }`}
                    >
                      {category.name}
                    </span>
                    {category.price && (
                      <span
                        className={`shrink-0 text-[14px] font-semibold leading-[18px] ${
                          category.priceTone === 'good' ? 'text-[#2F7D4F]' : 'text-pine'
                        }`}
                      >
                        {category.price}
                      </span>
                    )}
                  </span>
                  <span className="font-sans text-[13px] leading-[19px] text-neutral-500">
                    {category.detail}
                  </span>
                </button>
              ))}
            </div>
          </Fieldset>

          <fieldset className="flex flex-col gap-[18px] border-t border-neutral-200 pb-[30px] pt-[26px]">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <legend className="font-sans text-[11px] font-semibold uppercase leading-[14px] tracking-[0.13em] text-neutral-500">
                2 · The message
              </legend>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="flex h-[30px] items-center rounded-full bg-pine px-3 font-sans text-[12px] font-semibold leading-4 text-cream">
                  English
                </span>
                <button
                  type="button"
                  className="flex h-[30px] items-center rounded-full border border-neutral-200 px-3 font-sans text-[12px] font-medium leading-4 text-neutral-700 transition-colors hover:border-neutral-300"
                >
                  Kiswahili
                </button>
                <button
                  type="button"
                  className="flex h-[30px] items-center rounded-full border border-dashed border-neutral-300 px-3 font-sans text-[12px] font-medium leading-4 text-neutral-500 transition-colors hover:border-neutral-400"
                >
                  Add a language
                </button>
              </div>
            </div>

            <div className="flex flex-col overflow-clip rounded-[10px] border border-neutral-200">
              <textarea
                rows={4}
                aria-label="Template body"
                defaultValue={BODY}
                className="min-h-[120px] w-full resize-y bg-white p-4 text-[15px] leading-[23px] text-pine outline-none"
              />
              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-neutral-200 bg-neutral-100 p-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    className="flex h-[26px] items-center rounded-md border border-neutral-200 bg-white px-[9px] text-[12px] font-medium leading-4 text-neutral-700 transition-colors hover:border-neutral-300"
                  >
                    + Variable
                  </button>
                  <span className="font-sans text-[12px] leading-4 text-neutral-500">
                    4 used · name, date, time, court
                  </span>
                </div>
                <span className="text-[12px] leading-4 text-neutral-500">148 / 1024</span>
              </div>
            </div>
          </fieldset>

          <Fieldset
            step={3}
            label="Buttons"
            note="up to three · a tap opens the free reply window"
            gap={10}
          >
            {BUTTONS.map((button) => (
              <div
                key={button.label}
                className="flex flex-wrap items-center gap-[14px] rounded-[10px] border border-neutral-200 p-[14px]"
              >
                <span className="w-[90px] shrink-0 font-sans text-[12px] font-semibold uppercase leading-4 tracking-[0.1em] text-neutral-500">
                  {button.kind}
                </span>
                <span className="min-w-0 grow text-[15px] font-medium leading-5 text-pine">
                  {button.label}
                </span>
                <span className="shrink-0 font-sans text-[12px] leading-4 text-neutral-500">
                  {button.count}
                </span>
              </div>
            ))}
            <button
              type="button"
              className="flex items-center gap-2 rounded-[10px] border border-dashed border-neutral-300 p-[14px] text-left font-sans text-[14px] font-medium leading-[18px] text-neutral-500 transition-colors hover:border-neutral-400"
            >
              Add a button — quick reply, a phone call, or a link
            </button>
          </Fieldset>
        </form>

        <aside className="flex w-full shrink-0 flex-col gap-7 xl:w-[380px]">
          {/* The template as the reader will actually see it, variables filled
              in. Writing WhatsApp copy blind is how templates get rejected. */}
          <section className="flex flex-col gap-[14px] rounded-2xl bg-pine p-[22px]">
            <div className="flex items-center justify-between gap-4">
              <span className="font-sans text-[11px] font-semibold uppercase leading-[14px] tracking-[0.13em] text-[#8FA396]">
                How it arrives
              </span>
              <span className="shrink-0 font-sans text-[12px] leading-4 text-[#8FA396]">
                sample values
              </span>
            </div>
            <div className="flex flex-col overflow-clip rounded-[14px] bg-[#213B2C]">
              <p className="p-4 text-[14px] leading-[21px] text-[#EDF2EE]">{PREVIEW}</p>
              {BUTTONS.map((button) => (
                <span
                  key={button.label}
                  className="flex items-center justify-center border-t border-[#2C4436] py-[11px] text-[14px] font-medium leading-[18px] text-[#7FC4E8]"
                >
                  {button.label}
                </span>
              ))}
            </div>
          </section>

          <div className="flex flex-col">
            <div className="flex items-baseline justify-between gap-4 pb-[14px]">
              <Eyebrow>BEFORE SUBMITTING</Eyebrow>
              <span className="shrink-0 text-[12px] leading-4 text-neutral-500">
                usually approved in under an hour
              </span>
            </div>
            {CHECKS.map((check) => (
              <div
                key={check.text}
                className="flex items-start gap-[10px] border-t border-neutral-200 py-3"
              >
                <span className="flex w-4 shrink-0 justify-center pt-[3px]">
                  <CheckMark kind={check.kind} />
                </span>
                <span
                  className={`min-w-0 grow font-sans text-[13px] leading-[19px] ${
                    check.kind === 'note' ? 'text-neutral-500' : 'text-neutral-700'
                  }`}
                >
                  {check.text}
                </span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </Screen>
  );
}

function CheckMark({ kind }: { kind: 'tick' | 'warn' | 'note' }) {
  if (kind === 'tick') {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
        <path
          d="M2.4 7.4 5.6 10.6 11.6 3.8"
          fill="none"
          stroke="#2F7D4F"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  const colour = kind === 'warn' ? '#C99A2E' : '#A3A3A3';
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <circle cx="7" cy="7" r="5.6" fill="none" stroke={colour} strokeWidth={1.4} />
      {/* Warnings point down (something to fix), notes point up (something to
          know) — the same glyph either way up. */}
      <path
        d={kind === 'warn' ? 'M7 4.2v3.4M7 9.4v.6' : 'M7 6.4v3.4M7 4.3v.9'}
        fill="none"
        stroke={colour}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
