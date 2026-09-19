import {
  Aside,
  Avatar,
  Btn,
  Choices,
  Eyebrow,
  Field,
  FieldRow,
  Fieldset,
  Head,
  LEVELS,
  LevelDot,
  OnSave,
  PickCard,
  Picker,
  Screen,
} from '@/components/admin/ui';

/**
 * Add a member.
 *
 * ⚠️ DEMO. Styled but unwired — there is nothing to save into yet (see the
 * note at the top of src/lib/bookings.ts). The fields carry the design's
 * sample answers as defaults so the screen reads as a form mid-completion
 * rather than an empty one.
 */

const MEMBERSHIPS = [
  {
    title: 'Monthly',
    headline: 'TSh 90,000',
    detail: 'Court time at member rate · rolls over',
    on: true,
  },
  {
    title: 'Term',
    headline: 'TSh 240,000',
    detail: 'Three months · two free coached hits',
    on: false,
  },
  {
    title: 'Pay as you play',
    headline: 'No fee',
    detail: 'Visitor rate per booking · off the ladder',
    on: false,
  },
];

const PAYMENT = [{ label: 'Paid · M-Pesa' }, { label: 'Paid · cash' }, { label: 'Invoice them' }];

const HABITS = [
  { label: 'Open to a game', mark: <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-clay" /> },
  { label: 'Weekends only' },
  { label: 'Evenings only' },
  { label: 'Wants coaching' },
];

const ON_SAVE = [
  'A welcome message goes out on WhatsApp with the court rules and the gate code.',
  'The Saturday assessment is held on Court 2 and shows on the court desk.',
  'They appear in pairing suggestions once the assessment sets their level.',
];

const UNRANKED = [
  { initials: 'JM', name: 'Joyce Mrema', joined: 'joined 4 days ago' },
  { initials: 'PS', name: 'Peter Swai', joined: 'joined 9 days ago' },
  { initials: 'HK', name: 'Hawa Kessy', joined: 'joined 2 weeks ago' },
];

export default function AddMemberPage() {
  return (
    <Screen gap={32}>
      <Head
        title="Add a member"
        blurb="Phone is the only thing the club really needs — everything else can be filled in after their first hit."
        back={{ label: 'Players', href: '/admin/players' }}
        actions={
          <>
            <Btn href="/admin/players">Cancel</Btn>
            <Btn variant="primary">Save member</Btn>
          </>
        }
      />

      <div className="flex flex-col items-start gap-12 xl:flex-row">
        <form className="flex min-w-0 grow flex-col">
          <Fieldset step={1} label="Who they are">
            <FieldRow>
              <Field label="Full name" value="Grace Mwakyusa" />
              <Field label="Phone · used for WhatsApp" value="+255 754 220 918" type="tel" />
            </FieldRow>
            <FieldRow>
              <Field label="Age" value="31" width={200} />
              <Field
                label="Email"
                hint="optional · receipts only"
                type="email"
                placeholder="Add an address"
              />
            </FieldRow>
            <Aside>
              Set an age under 18 and a guardian name and phone are asked for instead of an email.
            </Aside>
          </Fieldset>

          <Fieldset
            step={2}
            label="Starting level"
            note="the ladder corrects this within a few matches"
            gap={18}
          >
            {/* The chosen level fills with pine, and its swatch turns white so
                it stays visible against it. */}
            <Choices
              chosen="Social"
              options={LEVELS.map((level) => ({
                label: level,
                mark: <LevelDot level={level} />,
                markOn: <span className="h-2 w-2 shrink-0 rounded-[2px] bg-white" />,
              }))}
            />
            <div className="flex flex-wrap items-center gap-[14px] rounded-[10px] bg-neutral-100 p-[14px]">
              <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] bg-pine">
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
              <span className="flex min-w-0 grow flex-col gap-0.5">
                <span className="font-sans text-[14px] font-medium leading-[18px] text-pine">
                  Book a hitting assessment
                </span>
                <span className="font-sans text-[13px] leading-[18px] text-neutral-500">
                  Sat 20 Sept · 08:00 · Court 2 with Elias — holds the slot on the court desk.
                </span>
              </span>
              <Btn size="sm">Change slot</Btn>
            </div>
          </Fieldset>

          <Fieldset step={3} label="Membership" gap={18}>
            <div className="flex flex-col gap-[14px] sm:flex-row">
              {MEMBERSHIPS.map((tier) => (
                <PickCard key={tier.title} {...tier} />
              ))}
            </div>
            <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-end">
              <Field label="Starts" width={230}>
                <Picker value="Today · 17 Sept" />
              </Field>
              <Field label="First payment">
                {/* Taller than the other chip rows, so it sits level with the
                    date field beside it. */}
                <div className="flex flex-wrap items-center gap-2">
                  {PAYMENT.map((option, i) => (
                    <button
                      key={option.label}
                      type="button"
                      aria-pressed={i === 0}
                      className={`flex h-[46px] shrink-0 items-center rounded-full px-4 font-sans text-[13px] leading-4 transition-colors ${
                        i === 0
                          ? 'border-[1.5px] border-pine font-semibold text-pine'
                          : 'border border-neutral-200 font-medium text-neutral-700 hover:border-neutral-300'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          </Fieldset>

          <Fieldset
            step={4}
            label="How they play"
            note="this is what the pairing tool reads"
            gap={18}
          >
            <Choices chosenStyle="ring" chosen="Open to a game" options={HABITS} />
          </Fieldset>
        </form>

        <aside className="flex w-full shrink-0 flex-col gap-7 xl:w-[380px]">
          <RosterPreview />
          <OnSave items={ON_SAVE} />
          <div className="flex flex-col border-t border-neutral-200 pt-[22px]">
            <div className="pb-[14px]">
              <Eyebrow>STILL UNRANKED</Eyebrow>
            </div>
            {UNRANKED.map((member) => (
              <div
                key={member.name}
                className="flex items-center gap-3 border-t border-neutral-200 py-3"
              >
                <Avatar initials={member.initials} size={30} />
                <span className="min-w-0 grow truncate text-[14px] font-medium leading-[18px] text-pine">
                  {member.name}
                </span>
                <span className="shrink-0 font-sans text-[12px] leading-4 text-neutral-500">
                  {member.joined}
                </span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </Screen>
  );
}

/**
 * What the form adds up to, shown the way the roster will show it. Filling a
 * form is easier when you can see the row you are about to create.
 */
function RosterPreview() {
  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-pine p-[22px]">
      <span className="font-sans text-[11px] font-semibold uppercase leading-[14px] tracking-[0.13em] text-[#8FA396]">
        How they&rsquo;ll show on the roster
      </span>
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#2C4436] text-[13px] font-semibold leading-4 text-[#E8EDE9]">
          GM
        </span>
        <span className="flex min-w-0 grow flex-col gap-0.5">
          <span className="truncate text-[16px] font-semibold leading-[22px] text-cream">
            Grace Mwakyusa
          </span>
          <span className="truncate font-sans text-[12px] leading-4 text-[#8FA396]">
            +255 754 220 918 · member since 2026
          </span>
        </span>
      </div>
      <div className="flex items-center gap-[10px] border-t border-[#2C4436] pt-[14px]">
        <span className="flex items-center gap-[7px]">
          <span className="h-2 w-2 shrink-0 rounded-[2px] bg-[#9EA9A2]" />
          <span className="font-sans text-[13px] font-medium leading-4 text-[#E8EDE9]">Social</span>
        </span>
        <span className="text-[13px] font-medium leading-4 text-[#6F8478]">·</span>
        <span className="text-[13px] font-medium leading-4 text-[#8FA396]">0–0 on the ladder</span>
      </div>
    </section>
  );
}
