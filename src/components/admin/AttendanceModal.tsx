'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/admin/Modal';
import {
  Avatar,
  Btn,
  FormError,
  INPUT,
  LevelTag,
  NameCell,
  PANEL_LABEL,
  Search,
  errorText,
} from '@/components/admin/ui';
import { matchesSearch, type Player } from '@/lib/admin/players';
import { fmtLongDay } from '@/lib/time';
import { recordAttendance, roster as rosterCache } from '@/lib/queries/players';

/**
 * Record attendance, as a dialog.
 *
 * Two things to say — who, and which day — and the second is filled in for
 * you, because attendance is recorded at the desk while the player is still
 * standing there.
 *
 * Saving closes the dialog and says so in a toast. The toast, rather than a
 * line inside a dialog that is no longer on screen, is also the only place
 * left to report the case that is not quite a success: the day was already
 * on file, which is not a refusal and must not read as one.
 *
 * Searching runs in the browser over the roster the screen already holds,
 * the same as the table behind it.
 */
export function AttendanceModal({
  players,
  today,
  onClose,
}: {
  players: Player[];
  /** Today at the club, not on the operator's device. */
  today: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  const [query, setQuery] = useState('');
  const [chosenId, setChosenId] = useState<number | null>(null);
  const [date, setDate] = useState(today);

  const chosen = chosenId === null ? null : (players.find((p) => p.id === chosenId) ?? null);

  /**
   * Nobody until you have typed something. A list of the whole club under
   * the search box would be a second roster, and the table behind this
   * dialog is already that.
   */
  const matches = useMemo(() => {
    if (!query.trim()) return [];
    return players.filter((p) => matchesSearch(p, query)).slice(0, 6);
  }, [players, query]);

  const save = useMutation({
    mutationFn: recordAttendance,
    onSuccess: (result, sent) => {
      const who = players.find((p) => p.id === sent.playerId)?.name ?? 'They';
      const day = fmtLongDay(result.date);

      if (result.written) {
        toast.success('Attendance updated', { description: `${who} · ${day}` });
      } else {
        toast.info('Already recorded', { description: `${who} was already down for ${day}.` });
      }

      // The roster's "last played" reads attendance, so the table is stale.
      void queryClient.invalidateQueries({ queryKey: rosterCache.key() });
      onClose();
    },
  });

  function choose(player: Player) {
    save.reset();
    setChosenId(player.id);
    setQuery('');
  }

  return (
    <Modal label="Record attendance" onClose={onClose}>
      <div className="sticky top-0 z-10 flex flex-col gap-0.5 border-b border-neutral-200 bg-white px-6 py-5">
        <h2 className="text-[18px] font-semibold leading-6 text-pine">Record attendance</h2>
        <span className="text-[13px] leading-[18px] text-neutral-500">
          Mark somebody present on a day. This is what gives a player with no number on file a
          playing history.
        </span>
      </div>

      <div className="flex flex-col gap-6 px-6 py-6">
        {save.error ? (
          <FormError>{errorText(save.error, 'Could not record it.')}</FormError>
        ) : null}

        <section className="flex flex-col gap-3">
          <span className={PANEL_LABEL}>WHO WAS HERE</span>
          {chosen ? (
            <div className="flex items-center gap-3 rounded-[10px] border border-neutral-200 px-4 py-3">
              <Avatar initials={chosen.initials} />
              <div className="min-w-0 grow">
                <NameCell name={chosen.name} sub={chosen.sub} />
              </div>
              <LevelTag level={chosen.level} />
              <Btn size="sm" variant="quiet" onClick={() => setChosenId(null)}>
                Change
              </Btn>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Search
                placeholder="Search a name"
                width={280}
                value={query}
                onChange={setQuery}
              />
              {query.trim() && (
                <div className="flex flex-col rounded-[10px] border border-neutral-200">
                  {matches.length === 0 ? (
                    <p className="px-4 py-3 text-[14px] leading-5 text-neutral-500">
                      Nobody matches that.
                    </p>
                  ) : (
                    matches.map((player) => (
                      <button
                        key={player.id}
                        type="button"
                        onClick={() => choose(player)}
                        className="flex items-center gap-3 border-b border-neutral-200/70 px-4 py-[10px] text-left transition-colors last:border-b-0 hover:bg-neutral-50"
                      >
                        <Avatar initials={player.initials} />
                        <div className="min-w-0 grow">
                          <NameCell name={player.name} sub={player.sub} />
                        </div>
                        <span className="shrink-0 text-[12px] leading-4 text-neutral-500">
                          {player.lastPlayed}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <span className={PANEL_LABEL}>WHICH DAY</span>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              className={`${INPUT} w-[170px]`}
              value={date}
              max={today}
              aria-label="Date"
              onChange={(e) => setDate(e.target.value)}
            />
            <Btn size="sm" pressed={date === today} onClick={() => setDate(today)}>
              Today
            </Btn>
            <Btn
              size="sm"
              pressed={date === dayBefore(today)}
              onClick={() => setDate(dayBefore(today))}
            >
              Yesterday
            </Btn>
          </div>
        </section>

      </div>

      <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-6 py-4">
        <span className="mr-auto text-[13px] leading-[18px] text-neutral-500">
          {chosen ? `Marking ${chosen.name} present on ${date}.` : 'Find a player first.'}
        </span>
        <Btn onClick={onClose}>Close</Btn>
        <Btn
          variant="primary"
          disabled={!chosen || save.isPending}
          onClick={() => chosen && save.mutate({ playerId: chosen.id, date })}
        >
          {save.isPending ? 'Recording…' : 'Record'}
        </Btn>
      </div>
    </Modal>
  );
}

/** The ISO day before `date`. */
function dayBefore(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
