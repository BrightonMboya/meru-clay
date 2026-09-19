'use client';

import { useState } from 'react';
import { Modal } from '@/components/admin/Modal';
import {
  Avatar,
  Btn,
  Chip,
  FormError,
  INPUT,
  LEVELS,
  LevelDot,
  PANEL_LABEL,
  errorText,
} from '@/components/admin/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Player } from '@/lib/admin/players';
import { MEMBERSHIPS, MEMBERSHIP_TIERS, fmtTsh } from '@/lib/pricing';
import type { PlayerEdit } from '@/lib/queries/players';
import {
  AVAILABILITIES,
  AVAILABILITY_LABEL,
  levelRank,
  type Level,
  type MaybeLevel,
} from '@/lib/roster';

/** Stands in for `null` where a Select needs a string. Not a level name. */
const UNRANKED = 'unranked';

/** What the dialog is holding. One draft, saved or thrown away in one go. */
type Draft = {
  name: string;
  phone: string;
  email: string;
  level: MaybeLevel;
  availability: Player['availabilityChoice'];
  membership: Player['membership'];
  /** Take a membership payment when this is saved. */
  markPaid: boolean;
};

function draftOf(player: Player): Draft {
  return {
    name: player.name,
    phone: player.phone,
    email: player.email ?? '',
    level: player.level,
    availability: player.availabilityChoice,
    membership: player.membership,
    markPaid: false,
  };
}

/**
 * A player's profile, as a dialog.
 *
 * Everything is a draft until Save. An earlier version wrote each chip
 * straight through on the tap, which meant a request per gesture and no way
 * to change your mind — correcting a level you mis-tapped cost a round trip,
 * and there was no moment where you could look at the whole row and commit
 * it. One save is less friction and one PATCH.
 *
 * `patch` carries only what actually changed, so saving after touching one
 * chip does not rewrite five columns, and Save has nothing to do — and says
 * so — until something is different.
 */
export function PlayerModal({
  player,
  busy,
  error,
  onSave,
  onRemove,
  onClose,
}: {
  player: Player;
  busy: boolean;
  error: unknown;
  onSave: (patch: PlayerEdit) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(player));
  const [confirmRemove, setConfirmRemove] = useState(false);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  const patch = changes(player, draft);
  const dirty = Object.keys(patch).length > 0;
  const tier = MEMBERSHIP_TIERS[draft.membership];

  return (
    <Modal label={`${player.name} — profile`} onClose={onClose}>
      {/* The dialog element, for the menus below: they have to portal
          into it rather than to the body. See `Modal`. */}
      {(container) => (
        <>
        {/* Head. Sticky, so the name stays put on a long scroll. */}
        <div className="sticky top-0 z-10 flex items-start border-b border-neutral-200 bg-white px-6 py-5">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar initials={player.initials} />
            <div className="flex min-w-0 flex-col gap-0.5">
              <h2 className="truncate text-[18px] font-semibold leading-6 text-pine">
                {player.name}
              </h2>
              <span className="truncate text-[13px] leading-[18px] text-neutral-500">
                {player.sub} · last played {player.lastPlayed.toLowerCase()}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-6 px-6 py-6">
          {error ? <FormError>{errorText(error, 'That did not go through.')}</FormError> : null}

          {/* Who they are. Phone first, and not by accident — it is the only
              field that makes a member reachable, and the only thing joining
              them to a booking. */}
          <Section label="WHO THEY ARE">
            <div className="flex flex-wrap items-end gap-3">
              <Labelled text="Name">
                <input
                  className={`${INPUT} w-full`}
                  value={draft.name}
                  maxLength={80}
                  onChange={(e) => set('name', e.target.value)}
                />
              </Labelled>
              <Labelled text="Phone">
                <input
                  className={`${INPUT} w-full`}
                  value={draft.phone}
                  inputMode="tel"
                  placeholder="0782 628 288"
                  onChange={(e) => set('phone', e.target.value)}
                />
              </Labelled>
            </div>
            <Labelled text="Email" hint="receipts only">
              <input
                className={`${INPUT} w-full`}
                value={draft.email}
                type="email"
                placeholder="Add an address"
                onChange={(e) => set('email', e.target.value)}
              />
            </Labelled>
            {player.unreachable && !draft.phone.trim() && (
              <Note>
                Without a number the club cannot message them, and their bookings cannot be matched
                to this row — which is why the roster shows them no playing history.
              </Note>
            )}
          </Section>

          {/* Level. Only meaningful for a member: a coach is not on the ladder. */}
          {!player.coach && (
            <Section label="LEVEL">
              {/* `null` is a real choice here — unranked — and a Select's value
                  has to be a string, so it travels as UNRANKED and is mapped
                  back on the way in and out. */}
              <Select
                value={draft.level ?? UNRANKED}
                onValueChange={(v) => set('level', v === UNRANKED ? null : (v as Level))}
              >
                <SelectTrigger className="w-full" aria-label="Level">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent container={container}>
                  {LEVELS.map((level) => (
                    <SelectItem key={level} value={level}>
                      <LevelDot level={level} />
                      {level}
                    </SelectItem>
                  ))}
                  <SelectItem value={UNRANKED}>
                    <LevelDot level={null} />
                    Unranked
                  </SelectItem>
                </SelectContent>
              </Select>
              {draft.level !== player.level && <Note>{levelNote(player.level, draft.level)}</Note>}
            </Section>
          )}

          <Section label="WHEN THEY WILL PLAY">
            <Select
              value={draft.availability}
              onValueChange={(v) => set('availability', v as Player['availabilityChoice'])}
            >
              <SelectTrigger className="w-full" aria-label="When they will play">
                <SelectValue />
              </SelectTrigger>
              <SelectContent container={container}>
                {AVAILABILITIES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {AVAILABILITY_LABEL[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Note>
              This is what the pairing tool reads. &ldquo;Open to a game&rdquo; puts them in the
              roster&rsquo;s free-to-play rail, unless they already have a court booked this week.
            </Note>
          </Section>

          {/* Membership. A coach pays nothing, so the whole block is theirs to skip. */}
          {!player.coach && (
            <Section label="MEMBERSHIP">
              <Select
                value={draft.membership}
                onValueChange={(v) => set('membership', v as Player['membership'])}
              >
                <SelectTrigger className="w-full" aria-label="Membership">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent container={container}>
                  {MEMBERSHIPS.map((key) => (
                    <SelectItem key={key} value={key}>
                      {MEMBERSHIP_TIERS[key].label}
                      {MEMBERSHIP_TIERS[key].fee > 0 && (
                        <span className="text-neutral-500">
                          TSh {fmtTsh(MEMBERSHIP_TIERS[key].fee)}
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex flex-wrap items-center gap-3">
                <Chip
                  on={draft.markPaid}
                  chosen="ring"
                  disabled={tier.months === 0}
                  onClick={() => set('markPaid', !draft.markPaid)}
                >
                  Take a payment
                </Chip>
                <span className="text-[13px] leading-[18px] text-neutral-500">
                  {paidLine(player, draft)}
                </span>
              </div>
            </Section>
          )}

          {/* Off the roster. Two presses — the only thing here that Cancel
              cannot take back, because it saves on the spot. */}
          <div className="flex flex-wrap items-center gap-2 border-t border-neutral-200 pt-5">
            {confirmRemove ? (
              <>
                <Btn variant="primary" size="sm" disabled={busy} onClick={onRemove}>
                  {busy ? 'Removing…' : 'Yes, remove them'}
                </Btn>
                <Btn variant="quiet" size="sm" onClick={() => setConfirmRemove(false)}>
                  Keep them
                </Btn>
                <span className="text-[13px] leading-[18px] text-neutral-500">
                  Their bookings and results stay on the record; only the roster loses them.
                </span>
              </>
            ) : (
              <Btn variant="quiet" size="sm" onClick={() => setConfirmRemove(true)}>
                Remove from the roster
              </Btn>
            )}
          </div>
        </div>

        {/* Foot. Sticky too, so Save is reachable without scrolling to the end. */}
        <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-6 py-4">
          {dirty && (
            <span className="mr-auto text-[13px] leading-[18px] text-neutral-500">
              {summarise(patch)}
            </span>
          )}
          <Btn onClick={onClose}>{dirty ? 'Discard changes' : 'Close'}</Btn>
          <Btn variant="primary" disabled={busy || !dirty} onClick={() => onSave(patch)}>
            {busy ? 'Saving…' : 'Save changes'}
          </Btn>
        </div>
        </>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ parts */

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <span className={PANEL_LABEL}>{label}</span>
      {children}
    </section>
  );
}

function Labelled({
  text,
  hint,
  children,
}: {
  text: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-w-[180px] grow basis-0 flex-col gap-1.5">
      <span className="flex items-baseline gap-1.5">
        <span className="text-[13px] leading-4 text-neutral-600">{text}</span>
        {hint && <span className="text-[12px] leading-4 text-neutral-400">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] leading-[18px] text-neutral-500">{children}</p>;
}

/* ------------------------------------------------------------------ logic */

/**
 * What actually changed.
 *
 * Only differences go in the patch, which matters more than it looks: the
 * route treats a present `level` key as an instruction to record a level
 * change, so sending the level a player already has would stamp a promotion
 * from themselves to themselves every time somebody fixed a typo in a name.
 */
function changes(player: Player, draft: Draft): PlayerEdit {
  const patch: PlayerEdit = {};
  const name = draft.name.trim();
  const phone = draft.phone.trim();
  const email = draft.email.trim();

  if (name && name !== player.name) patch.name = name;
  if (phone !== player.phone) patch.phone = phone;
  if (email !== (player.email ?? '')) patch.email = email || null;
  if (draft.level !== player.level) patch.level = draft.level;
  if (draft.availability !== player.availabilityChoice) patch.availability = draft.availability;
  if (draft.membership !== player.membership) patch.membership = draft.membership;
  if (draft.markPaid) patch.markPaid = true;

  return patch;
}

/** "Level, membership and a payment" — what Save is about to do. */
function summarise(patch: PlayerEdit): string {
  const names: Record<keyof PlayerEdit, string> = {
    name: 'name',
    phone: 'phone',
    email: 'email',
    level: 'level',
    availability: 'availability',
    membership: 'membership',
    markPaid: 'a payment',
  };

  const parts = (Object.keys(patch) as (keyof PlayerEdit)[]).map((k) => names[k]);
  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;

  return `Unsaved: ${list}`;
}

/**
 * What setting this level will actually record.
 *
 * Four different things, and the difference matters because only one of them
 * reaches the "moved up a level" rail. A first assessment is not a promotion
 * — there is no rung to have moved from — and the rail does not post
 * demotions, so promising it in either case would be a lie the operator
 * would catch within the minute.
 */
function levelNote(from: MaybeLevel, to: MaybeLevel): string {
  if (to === null) {
    return 'Saving clears their level and puts them back on the unranked list.';
  }
  if (from === null) {
    return `Saving assesses them into ${to}. A first level is not a promotion, so it does not reach the “moved up a level” rail.`;
  }
  if (levelRank(to) > levelRank(from)) {
    return `Saving moves them up from ${from} — they show in the “moved up a level” rail for the rest of the month.`;
  }
  return `Saving moves them down from ${from}. The rail only reports moves up.`;
}

function paidLine(player: Player, draft: Draft): string {
  const { months, fee } = MEMBERSHIP_TIERS[draft.membership];
  if (months === 0) return 'Pay as you play — nothing falls due.';

  const term = months === 1 ? 'a month' : `${months} months`;
  if (draft.markPaid) return `Saving adds ${term} to their paid-up date.`;
  if (player.due) return `Owing TSh ${fmtTsh(fee)}.`;
  return `Paid up to ${player.paidUntil ?? '—'}.`;
}
