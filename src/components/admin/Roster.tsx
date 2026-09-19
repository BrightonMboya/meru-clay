'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { AttendanceModal } from '@/components/admin/AttendanceModal';
import { PlayerModal } from '@/components/admin/PlayerModal';
import {
  Avatar,
  Badge,
  Btn,
  Cell,
  Eyebrow,
  Head,
  LevelTag,
  NameCell,
  Row,
  Screen,
  Search,
  Table,
  icons,
  type BadgeTone,
  type Col,
} from '@/components/admin/ui';
import {
  FILTER_LABELS,
  matchesFilter,
  matchesSearch,
  type Availability,
  type Player,
  type Roster as RosterData,
  type RosterFilter,
} from '@/lib/admin/players';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  editPlayer,
  removePlayer,
  roster as rosterCache,
  type PlayerEdit,
} from '@/lib/queries/players';

const cols: Col[] = [
  { head: '', w: 36 },
  // Wide enough for a full name over the line under it — "no number on
  // file · member since 2026" is the longest thing this cell ever holds.
  { head: 'PLAYER', min: 190 },
  { head: 'LEVEL', w: 118 },
  { head: 'LADDER', w: 80 },
  { head: 'LAST PLAYED', w: 104 },
  { head: 'AVAILABILITY', w: 152 },
  { head: '', w: 92, align: 'right' },
];

/**
 * Only unpaid membership is worth colouring; the rest is just a state, and a
 * coach is a fact about the club rather than a problem with it.
 */
const availabilityTone: Record<Availability, BadgeTone> = {
  'OPEN TO A GAME': 'grey',
  'WEEKENDS ONLY': 'stone',
  'EVENINGS ONLY': 'stone',
  'NOT PLAYING': 'stone',
  AWAY: 'stone',
  'JUNIOR SQUAD': 'stone',
  'MEMBERSHIP DUE': 'clay',
  COACH: 'green',
};

/**
 * The roster.
 *
 * Every number on this screen is counted from the rows below it — see the
 * note at the top of src/lib/admin/players.ts — and every control on it is a
 * write. Filtering and searching happen in the browser over the payload the
 * server already sent, because a club is a few dozen people and a round trip
 * per keystroke would buy nothing.
 *
 * `initial` is server-rendered so the roster is on screen before any browser
 * request, the same arrangement the court desk uses. It does not poll: a
 * member's level does not change while you are looking at it.
 */
export default function Roster({ initial }: { initial: RosterData }) {
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<RosterFilter>('all');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);
  const [marking, setMarking] = useState(false);

  const { data } = useQuery({ ...rosterCache.options(), initialData: initial });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: rosterCache.key() });
  }

  /**
   * One save per visit to the dialog. It closes on success and stays open,
   * holding what was typed, on a refusal — the operator gets to fix the
   * number rather than retype the other four fields.
   */
  const save = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: PlayerEdit }) => editPlayer(id, patch),
    onSuccess: () => setOpenId(null),
    onSettled: refresh,
  });

  const remove = useMutation({
    mutationFn: removePlayer,
    onSuccess: () => setOpenId(null),
    onSettled: refresh,
  });

  const shown = data.players.filter((p) => matchesFilter(p, filter) && matchesSearch(p, query));
  const open = openId === null ? null : (data.players.find((p) => p.id === openId) ?? null);

  /** Opening a different player drops the last one's refusal. */
  function show(id: number) {
    save.reset();
    remove.reset();
    setOpenId((current) => (current === id ? null : id));
  }

  return (
    <Screen>
      <Head
        title="Players"
        blurb="Levels are set after a hitting assessment and move with ladder results."
        actions={
          <>
            <Btn icon={icons.list} onClick={() => setMarking(true)}>
              Record attendance
            </Btn>
            <Btn variant="primary" icon={icons.plus} href="/admin/players/new">
              Add a member
            </Btn>
          </>
        }
      />

      <div className="flex flex-col items-start gap-12 min-[1600px]:flex-row">
        <div className="flex w-full min-w-0 grow flex-col gap-[18px]">
          {/* The filter is an icon beside the search box, not a row of
              chips or a labelled menu: on a roster this size you filter
              rarely and search constantly, so the filter should cost one
              icon's worth of space. It names itself while it is doing
              something — an icon alone gives no account of why the table is
              six rows shorter than the club. */}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Search placeholder="Search a name" value={query} onChange={setQuery} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Btn
                  size="sm"
                  icon={icons.filter}
                  pressed={filter !== 'all'}
                  aria-label={`Filter the roster — ${FILTER_LABELS[filter]}`}
                >
                  {filter === 'all' ? <span className="sr-only">Filter</span> : FILTER_LABELS[filter]}
                </Btn>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[220px]">
                <DropdownMenuRadioGroup
                  value={filter}
                  onValueChange={(v) => setFilter(v as RosterFilter)}
                >
                  {data.filters.map((option) => (
                    <DropdownMenuRadioItem key={option.key} value={option.key}>
                      <span className="grow">{option.label}</span>
                      <span className="text-neutral-500">{option.count}</span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <Table cols={cols}>
            {shown.map((player) => (
              <PlayerRow
                key={player.id}
                player={player}
                on={player.id === openId}
                onOpen={() => show(player.id)}
              />
            ))}
          </Table>

          {shown.length === 0 && (
            <p className="py-6 text-[15px] leading-[22px] text-neutral-500">
              {data.players.length === 0
                ? 'Nobody on the roster yet. Add a member and they will appear here.'
                : 'Nobody matches that.'}
            </p>
          )}
        </div>

        <aside className="flex w-full shrink-0 flex-col gap-8 min-[1600px]:w-[340px]">
          <FreeToPlay free={data.freeThisWeek} />
          <MovedUp promotions={data.promotions} />
        </aside>
      </div>

      {/* Rendered last and mounted only while open, so the dialog's own
          `showModal` runs on mount and its `close` on unmount. */}
      {marking && (
        <AttendanceModal
          players={data.players}
          today={data.today}
          onClose={() => setMarking(false)}
        />
      )}

      {open && (
        <PlayerModal
          key={open.id}
          player={open}
          busy={save.isPending || remove.isPending}
          error={save.error ?? remove.error}
          onSave={(patch) => save.mutate({ id: open.id, patch })}
          onRemove={() => remove.mutate(open.id)}
          onClose={() => setOpenId(null)}
        />
      )}
    </Screen>
  );
}

function PlayerRow({
  player,
  on,
  onOpen,
}: {
  player: Player;
  on: boolean;
  onOpen: () => void;
}) {
  return (
    <Row>
      <Cell col={cols[0]}>
        <Avatar initials={player.initials} />
      </Cell>
      <Cell col={cols[1]}>
        <NameCell name={player.name} sub={player.sub} />
      </Cell>
      <Cell col={cols[2]}>
        <LevelTag level={player.level} />
      </Cell>
      <Cell col={cols[3]}>
        {/* Wins–losses only. The design carried a ▲2 beside it; nothing
            writes ladder movement yet, and a column of dashes reads as
            unattended work — the same reason the sidebar dropped its
            count badges. Put it back with the match screens. */}
        <span className="text-[16px] font-semibold leading-5 text-pine">{player.record}</span>
      </Cell>
      <Cell col={cols[4]}>
        <span
          className={`text-[13px] leading-4 ${
            player.unreachable ? 'text-neutral-400' : 'text-neutral-600'
          }`}
        >
          {player.lastPlayed}
        </span>
      </Cell>
      <Cell col={cols[5]}>
        <Badge tone={availabilityTone[player.availability]}>{player.availability}</Badge>
      </Cell>
      <Cell col={cols[6]}>
        <Btn size="sm" pressed={on} onClick={onOpen}>
          {player.action}
        </Btn>
      </Cell>
    </Row>
  );
}

/**
 * The rail's one dark surface. Players who want a game are the club's best
 * lead: the court books itself once two of them are put together.
 *
 * The panel used to say these players had "marked themselves open for the
 * next seven days", which nobody had — availability is a standing preference
 * with no date on it. What makes the seven days real is the subtraction on
 * the other side: anyone already holding a court this week is left out. See
 * `freeToPlay`. The copy now describes that, and names the faces, because in
 * a club this size four initials are a puzzle rather than a summary.
 */
function FreeToPlay({ free }: { free: RosterData['freeThisWeek'] }) {
  const shown = free.faces.map((f) => f.name.split(' ')[0]);
  const named =
    free.more > 0
      ? `${shown.join(', ')} and ${free.more} more`
      : shown.length > 1
        ? `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`
        : shown[0];

  return (
    <section className="flex flex-col rounded-2xl bg-pine p-[22px]">
      <div className="flex items-center gap-2 pb-1">
        <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-neutral-400" />
        <Eyebrow tone="inverse">FREE TO PLAY THIS WEEK</Eyebrow>
      </div>
      <h2 className="pb-4 text-[24px] font-semibold leading-[30px] tracking-[-0.015em] text-cream">
        {free.headline}
      </h2>
      <p className="pb-[18px] text-[13px] leading-5 text-neutral-400">
        {free.count > 0
          ? 'Open to a game, and nothing booked in the next seven days. Pair them and the court books itself.'
          : 'Everybody open to a game already has a court this week. Set somebody to “open to a game” in their profile and they show up here.'}
      </p>
      {free.count > 0 && (
        <>
          <div className="flex items-center pb-3">
            {free.faces.map((face, i) => (
              <span key={face.name} className={i > 0 ? '-ml-2' : ''} title={face.name}>
                <Avatar initials={face.initials} size={30} tone={i % 2 ? 'dark-alt' : 'dark'} />
              </span>
            ))}
            {free.more > 0 && (
              <span className="-ml-2">
                <Avatar
                  initials={`+${free.more}`}
                  size={30}
                  tone={free.faces.length % 2 ? 'dark-alt' : 'dark'}
                />
              </span>
            )}
          </div>
          <p className="pb-[18px] text-[13px] leading-5 text-[#8FA396]">{named}</p>
        </>
      )}
      <Btn href="/admin/matches/new" variant="primary">
        Make a pairing
      </Btn>
    </section>
  );
}

function MovedUp({ promotions }: { promotions: RosterData['promotions'] }) {
  return (
    <section className="flex flex-col gap-[14px]">
      <div className="flex items-baseline justify-between">
        <Eyebrow tone="loud">MOVED UP A LEVEL</Eyebrow>
        <span className="text-[12px] leading-4 text-neutral-500">this month</span>
      </div>
      {promotions.length === 0 ? (
        <p className="text-[13px] leading-5 text-neutral-500">
          Nobody yet this month. Setting a higher level on a player’s profile lists them here.
        </p>
      ) : (
        promotions.map((promotion, i) => (
          <div
            key={promotion.id}
            className={`flex items-center gap-3 ${
              i < promotions.length - 1 ? 'border-b border-neutral-200 pb-3' : ''
            }`}
          >
            <Avatar initials={promotion.initials} size={30} />
            <span className="min-w-0 grow truncate text-[14px] font-medium leading-[18px] text-pine">
              {promotion.name}
            </span>
            <span className="shrink-0 text-[12px] leading-4 text-neutral-500">
              {promotion.from}
            </span>
            <span className="shrink-0 text-neutral-400">{icons.arrow}</span>
            <span className="shrink-0 text-[12px] font-semibold leading-4 text-pine">
              {promotion.to}
            </span>
          </div>
        ))
      )}
    </section>
  );
}
