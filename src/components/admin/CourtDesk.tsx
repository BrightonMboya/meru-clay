'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import DayTimeline from '@/components/admin/DayTimeline';
import {
  ActionSheet,
  AddBookingForm,
  fromEntry,
  type Selected,
} from '@/components/admin/DeskForms';
import { NeedsYou } from '@/components/admin/Rail';
import { Btn, Head, Readings, Screen, icons } from '@/components/admin/ui';
import { type Desk, pencilIn } from '@/lib/admin/desk';
import {
  actOnBooking,
  createDeskBooking,
  desk as deskCache,
  reopenCourt,
  type DeskEntryAction,
} from '@/lib/queries/bookings';
import { addDays, fmtDeskDay } from '@/lib/time';

/** Which panel, if any, is open below the head. Only ever one. */
type Panel = 'add' | null;

/**
 * Court desk — what is happening on both courts today.
 *
 * The timeline is the page; the hold waiting in the rail, when there is one,
 * is what to do about it. Everything comes from one payload so the numbers
 * along the top and the blocks on the grid can never tell two different
 * stories about the same day.
 *
 * `initial` is rendered on the server, so the desk is on screen before any
 * browser request; React Query then keeps it live. That matters here more
 * than on the booking page: holds run for ten minutes, and an operator
 * staring at a stale board will confirm something that has already lapsed.
 */
export default function CourtDesk({ initial }: { initial: Desk }) {
  const queryClient = useQueryClient();

  const [date, setDate] = useState(initial.date);
  const [panel, setPanel] = useState<Panel>(null);
  const [selected, setSelected] = useState<Selected | null>(null);

  const query = useQuery({
    ...deskCache.options<Desk>(date),
    // Only the day we server-rendered starts with data; stepping to another
    // day fetches it.
    initialData: date === initial.date ? initial : undefined,
  });

  // `keepPreviousData` is deliberately not used: a half-swapped day is worse
  // than a moment of nothing, because the operator would act on the wrong one.
  const deskDay = query.data;

  /** Any write changes the day, and may change what /book can sell. */
  function refresh() {
    void queryClient.invalidateQueries({ queryKey: deskCache.key(date) });
    void queryClient.invalidateQueries({ queryKey: ['availability'] });
  }

  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: DeskEntryAction }) =>
      actOnBooking(id, action),
    onSuccess: () => setSelected(null),
    onSettled: refresh,
  });

  const reopen = useMutation({
    mutationFn: reopenCourt,
    onSuccess: () => setSelected(null),
    onSettled: refresh,
  });

  /**
   * Adding a booking is optimistic: the block is drawn on the day and the
   * panel shuts the moment the operator saves, because a player is standing
   * at the counter waiting to be told yes.
   *
   * If the save is refused — the usual reason being that /book sold the same
   * hour a second earlier — the day is put back as it was and the panel
   * reopens still holding what was typed, with the reason on it. Nothing is
   * lost but the optimism.
   */
  const add = useMutation({
    mutationFn: createDeskBooking,
    onMutate: async (input) => {
      setPanel(null);
      await queryClient.cancelQueries({ queryKey: deskCache.key(date) });

      const previous = queryClient.getQueryData<Desk>(deskCache.key(date));
      if (previous) {
        queryClient.setQueryData<Desk>(deskCache.key(date), pencilIn(previous, input));
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData<Desk>(deskCache.key(date), context.previous);
      }
      setPanel('add');
    },
    onSettled: refresh,
  });

  /** Switching day closes whatever was open — it belonged to the old day. */
  function show(iso: string) {
    setDate(iso);
    setPanel(null);
    setSelected(null);
    act.reset();
    add.reset();
    reopen.reset();
  }

  function togglePanel(which: Exclude<Panel, null>) {
    setSelected(null);
    // Opening the panel by hand starts a fresh booking, so a refusal from the
    // last one must not still be sitting on the form.
    add.reset();
    setPanel((p) => (p === which ? null : which));
  }

  return (
    <Screen gap={26}>
      {/* The head is the same shape whether or not the day has arrived.
          Dropping the action while a day loads would take the primary button
          out of the layout and pull everything under it upwards — precisely
          when the operator is reaching for it. */}
      <Head
        title="Court desk"
        day={{
          label: fmtDeskDay(date),
          date,
          onPrev: () => show(addDays(date, -1)),
          onNext: () => show(addDays(date, 1)),
          onPick: show,
        }}
        actions={
          <Btn
            variant="primary"
            icon={icons.plus}
            pressed={panel === 'add'}
            // There is nothing to add a booking to until the day is on screen.
            disabled={!deskDay}
            onClick={() => togglePanel('add')}
          >
            Add a booking
          </Btn>
        }
      />

      {!deskDay ? (
        <p className="text-[15px] text-neutral-500">
          {query.isError ? 'Could not load that day.' : 'Loading the day…'}
        </p>
      ) : (
        <>
          {panel === 'add' && (
            <AddBookingForm
              date={deskDay.date}
              busy={add.isPending}
              error={add.error}
              // Reopened after a refusal, the form comes back as it was left.
              defaults={add.isError ? add.variables : undefined}
              onClose={() => setPanel(null)}
              onSubmit={(v) => add.mutate({ ...v, date: deskDay.date })}
            />
          )}

          {selected && (
            <ActionSheet
              selected={selected}
              busy={act.isPending || reopen.isPending}
              error={act.error ?? reopen.error}
              onClose={() => setSelected(null)}
              onAct={(action) =>
                selected.kind === 'booking' && act.mutate({ id: selected.id, action })
              }
              onReopen={() => selected.kind === 'closure' && reopen.mutate(selected.id)}
            />
          )}

          <Readings readings={deskDay.stats} />

          <div className="flex w-full flex-col items-start gap-10 pt-2 xl:flex-row">
            <DayTimeline
              entries={deskDay.entries}
              now={deskDay.now}
              courts={deskDay.courts}
              onPick={(entry) => {
                const next = fromEntry(entry, deskDay.arrivals);
                if (!next) return;
                setPanel(null);
                act.reset();
                reopen.reset();
                setSelected(next);
              }}
            />

            {/* The rail only exists when there is something to decide; with no
                hold waiting, the two courts take the whole width. */}
            {deskDay.needsYou && (
              <div className="flex w-full shrink-0 flex-col gap-[34px] xl:w-[300px]">
                <NeedsYou
                  hold={deskDay.needsYou}
                  busy={act.isPending}
                  onAct={(action) => act.mutate({ id: deskDay.needsYou!.id, action })}
                />
              </div>
            )}
          </div>
        </>
      )}
    </Screen>
  );
}
