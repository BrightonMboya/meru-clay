'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Aside,
  Avatar,
  Btn,
  Choices,
  Eyebrow,
  Field,
  FieldRow,
  Fieldset,
  FormError,
  Head,
  LEVELS,
  LevelDot,
  OnSave,
  PickCard,
  Screen,
  errorText,
} from '@/components/admin/ui';
import type { Roster } from '@/lib/admin/players';
import { MEMBERSHIPS, MEMBERSHIP_TIERS, fmtTsh, type MembershipTier } from '@/lib/pricing';
import { addPlayer, type NewMember } from '@/lib/queries/players';
import {
  AVAILABILITIES,
  AVAILABILITY_LABEL,
  JUNIOR_AGE,
  initialsOf,
  isLevel,
  type MaybeLevel,
  type PlayerAvailability,
} from '@/lib/roster';
import { fmtDeskDay } from '@/lib/time';

const UNRANKED = 'Unranked';

/**
 * What saving this actually does. The design's version promised a WhatsApp
 * welcome and a Saturday assessment slot; neither is wired, and a form that
 * describes work it does not do is worse than one that says less.
 */
const ON_SAVE = [
  'They join the roster immediately, and the club’s export.',
  'Their membership runs from the date below — unpaid, they show in the roster’s clay total.',
  'They stay unranked, and on the roster’s unranked list, until a coach sets a level.',
];

/**
 * Add a member.
 *
 * The form the club actually fills in, in the order it asks: who they are,
 * then a level only if somebody has already watched them hit, then what they
 * pay, then when they will play. Only the name is required — everything else
 * can be filled in from their profile after a first hit, which is the promise
 * the blurb at the top makes.
 *
 * `roster` is the live one, so the rail's unranked list is the club's, not an
 * illustration of one.
 */
export default function AddMember({ roster }: { roster: Roster }) {
  const router = useRouter();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [age, setAge] = useState('');
  const [email, setEmail] = useState('');
  const [coach, setCoach] = useState(false);
  const [guardianName, setGuardianName] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [level, setLevel] = useState<MaybeLevel>(null);
  const [membership, setMembership] = useState<MembershipTier>('monthly');
  const [joinedOn, setJoinedOn] = useState(roster.today);
  const [paidNow, setPaidNow] = useState(true);
  const [availability, setAvailability] = useState<PlayerAvailability>('open');

  const save = useMutation({
    mutationFn: addPlayer,
    // Straight back to the roster, where the row they just created is the
    // thing they wanted to see.
    onSuccess: () => router.push('/admin/players'),
  });

  const ageNumber = age.trim() === '' ? null : Number(age);
  const junior = ageNumber !== null && Number.isFinite(ageNumber) && ageNumber < JUNIOR_AGE;
  const unranked = roster.players.filter((p) => p.level === null && !p.coach);

  function submit() {
    save.mutate({
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim() || undefined,
      role: coach ? 'coach' : 'member',
      level,
      age: ageNumber,
      guardianName: junior ? guardianName.trim() : undefined,
      guardianPhone: junior ? guardianPhone.trim() : undefined,
      membership: coach ? 'payg' : membership,
      availability,
      paidNow: !coach && paidNow,
      joinedOn,
    });
  }

  return (
    <Screen gap={32}>
      <Head
        title={coach ? 'Add a coach' : 'Add a member'}
        blurb="Phone is the only thing the club really needs — everything else can be filled in after their first hit."
        back={{ label: 'Players', href: '/admin/players' }}
        actions={
          <>
            <Btn href="/admin/players">Cancel</Btn>
            <Btn
              variant="primary"
              disabled={save.isPending || name.trim().length < 2}
              onClick={submit}
            >
              {save.isPending ? 'Saving…' : coach ? 'Save coach' : 'Save member'}
            </Btn>
          </>
        }
      />

      <div className="flex flex-col items-start gap-12 xl:flex-row">
        <form
          className="flex min-w-0 grow flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Fieldset step={1} label="Who they are">
            <FieldRow>
              <Field label="Full name" value={name} onChange={setName} />
              <Field
                label="Phone · used for WhatsApp"
                hint="optional"
                value={phone}
                onChange={setPhone}
                type="tel"
                placeholder="0782 628 288"
              />
            </FieldRow>
            <FieldRow>
              <Field label="Age" hint="optional" value={age} onChange={setAge} width={200} />
              <Field
                label="Email"
                hint="optional · receipts only"
                value={email}
                onChange={setEmail}
                type="email"
                placeholder="Add an address"
              />
            </FieldRow>
            <Choices
              chosenStyle="ring"
              size="md"
              chosen={coach ? 'Coach' : 'Member'}
              onPick={(pick) => setCoach(pick === 'Coach')}
              options={['Member', 'Coach']}
            />
            {junior ? (
              /* The Aside below has always promised this. Now it happens:
                 under 18 and the guardian's number replaces the email as the
                 thing the club actually rings. */
              <FieldRow>
                <Field label="Guardian" value={guardianName} onChange={setGuardianName} />
                <Field
                  label="Guardian’s phone"
                  hint="required under 18"
                  value={guardianPhone}
                  onChange={setGuardianPhone}
                  type="tel"
                  placeholder="0782 628 288"
                />
              </FieldRow>
            ) : (
              <Aside>
                Set an age under {JUNIOR_AGE} and a guardian name and phone are asked for instead
                of an email.
              </Aside>
            )}
          </Fieldset>

          {!coach && (
            <Fieldset
              step={2}
              label="Starting level"
              note="the ladder corrects this within a few matches"
              gap={18}
            >
              {/* The chosen level fills with pine, and its swatch turns white
                  so it stays visible against it. */}
              <Choices
                chosen={level ?? UNRANKED}
                onPick={(pick) => setLevel(isLevel(pick) ? pick : null)}
                options={[
                  ...LEVELS.map((l) => ({
                    label: l,
                    mark: <LevelDot level={l} />,
                    markOn: <span className="h-2 w-2 shrink-0 rounded-[2px] bg-white" />,
                  })),
                  {
                    label: UNRANKED,
                    mark: <LevelDot level={null} />,
                    markOn: (
                      <span className="h-2 w-2 shrink-0 rounded-[2px] border border-white" />
                    ),
                  },
                ]}
              />
              <Aside>
                Leave them unranked unless a coach has already watched them hit. The roster keeps a
                list of everyone still waiting for an assessment.
              </Aside>
            </Fieldset>
          )}

          {!coach && (
            <Fieldset step={3} label="Membership" gap={18}>
              <div className="flex flex-col gap-[14px] sm:flex-row">
                {MEMBERSHIPS.map((tier) => (
                  <PickCard
                    key={tier}
                    title={MEMBERSHIP_TIERS[tier].label}
                    headline={
                      MEMBERSHIP_TIERS[tier].fee > 0
                        ? `TSh ${fmtTsh(MEMBERSHIP_TIERS[tier].fee)}`
                        : 'No fee'
                    }
                    detail={MEMBERSHIP_TIERS[tier].detail}
                    on={membership === tier}
                    onClick={() => setMembership(tier)}
                  />
                ))}
              </div>
              <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-end">
                <Field label="Starts" width={230}>
                  <input
                    type="date"
                    value={joinedOn}
                    onChange={(e) => setJoinedOn(e.target.value || roster.today)}
                    aria-label="Membership start date"
                    className="h-[46px] w-full rounded-[10px] border border-neutral-200 bg-white px-[14px] text-[15px] font-medium leading-5 text-pine outline-none transition-colors focus:border-pine/40"
                  />
                </Field>
                <Field label="First payment">
                  {/* Taller than the other chip rows, so it sits level with
                      the date field beside it. */}
                  <div className="flex flex-wrap items-center gap-2">
                    {[
                      { label: 'Paid today', paid: true },
                      { label: 'Invoice them', paid: false },
                    ].map((option) => (
                      <button
                        key={option.label}
                        type="button"
                        aria-pressed={paidNow === option.paid}
                        disabled={MEMBERSHIP_TIERS[membership].months === 0}
                        onClick={() => setPaidNow(option.paid)}
                        className={`flex h-[46px] shrink-0 items-center rounded-full px-4 font-sans text-[13px] leading-4 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                          paidNow === option.paid
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
          )}

          <Fieldset
            step={coach ? 2 : 4}
            label="How they play"
            note="this is what the pairing tool reads"
            gap={18}
          >
            <Choices
              chosenStyle="ring"
              chosen={AVAILABILITY_LABEL[availability]}
              onPick={(pick) =>
                setAvailability(
                  AVAILABILITIES.find((a) => AVAILABILITY_LABEL[a] === pick) ?? 'open',
                )
              }
              options={AVAILABILITIES.map((option) => ({
                label: AVAILABILITY_LABEL[option],
                mark:
                  option === 'open' ? (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-clay" />
                  ) : undefined,
              }))}
            />
          </Fieldset>

          {save.error ? (
            <FormError>{errorText(save.error, 'Could not add them.')}</FormError>
          ) : null}
        </form>

        <aside className="flex w-full shrink-0 flex-col gap-7 xl:w-[380px]">
          <RosterPreview
            name={name}
            phone={phone}
            level={level}
            coach={coach}
            joinedOn={joinedOn}
          />
          <OnSave items={ON_SAVE} />
          <div className="flex flex-col border-t border-neutral-200 pt-[22px]">
            <div className="pb-[14px]">
              <Eyebrow>STILL UNRANKED</Eyebrow>
            </div>
            {unranked.length === 0 ? (
              <p className="text-[13px] leading-5 text-neutral-500">
                Everybody on the roster has a level.
              </p>
            ) : (
              unranked.slice(0, 6).map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-3 border-t border-neutral-200 py-3"
                >
                  <Avatar initials={member.initials} size={30} />
                  <span className="min-w-0 grow truncate text-[14px] font-medium leading-[18px] text-pine">
                    {member.name}
                  </span>
                  <span className="shrink-0 font-sans text-[12px] leading-4 text-neutral-500">
                    {member.unreachable
                      ? 'no number'
                      : member.lastPlayed === 'Not yet'
                        ? 'never played'
                        : member.lastPlayed}
                  </span>
                </div>
              ))
            )}
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
function RosterPreview({
  name,
  phone,
  level,
  coach,
  joinedOn,
}: {
  name: string;
  phone: string;
  level: MaybeLevel;
  coach: boolean;
  joinedOn: string;
}) {
  const shown = name.trim() || 'Their name';

  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-pine p-[22px]">
      <span className="font-sans text-[11px] font-semibold uppercase leading-[14px] tracking-[0.13em] text-[#8FA396]">
        How they&rsquo;ll show on the roster
      </span>
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#2C4436] text-[13px] font-semibold leading-4 text-[#E8EDE9]">
          {name.trim() ? initialsOf(name) : '—'}
        </span>
        <span className="flex min-w-0 grow flex-col gap-0.5">
          <span className="truncate text-[16px] font-semibold leading-[22px] text-cream">
            {shown}
          </span>
          <span className="truncate font-sans text-[12px] leading-4 text-[#8FA396]">
            {phone.trim() || 'no number on file'} ·{' '}
            {coach ? 'coach' : `member since ${joinedOn.slice(0, 4)}`}
          </span>
        </span>
      </div>
      <div className="flex items-center gap-[10px] border-t border-[#2C4436] pt-[14px]">
        <span className="flex items-center gap-[7px]">
          <span
            className={`h-2 w-2 shrink-0 rounded-[2px] ${
              level ? 'bg-[#9EA9A2]' : 'border border-[#6F8478]'
            }`}
          />
          <span className="font-sans text-[13px] font-medium leading-4 text-[#E8EDE9]">
            {coach ? 'Coach' : (level ?? 'Unranked')}
          </span>
        </span>
        <span className="text-[13px] font-medium leading-4 text-[#6F8478]">·</span>
        <span className="text-[13px] font-medium leading-4 text-[#8FA396]">
          {coach ? fmtDeskDay(joinedOn) : 'no matches yet'}
        </span>
      </div>
    </section>
  );
}
