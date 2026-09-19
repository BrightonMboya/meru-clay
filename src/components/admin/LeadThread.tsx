'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useLeadChanges } from '@/hooks/use-lead-changes';
import { Btn, Chip, Eyebrow, FormError, errorText } from '@/components/admin/ui';
import type { ChatDay, ChatMessage } from '@/lib/admin/leads';
import type { LeadThread as Thread } from '@/lib/admin/load';
import { LEAD_STAGES, STAGE_LABELS, type LeadStage, type MessageStatus } from '@/lib/pipeline';
import {
  board as boardCache,
  moveLead,
  sendMessage,
  thread as threadCache,
  type SendInput,
} from '@/lib/queries/leads';

/**
 * One lead, opened.
 *
 * The whole point of the screen is the composer at the bottom, and the whole
 * point of the composer is that it refuses honestly. Outside WhatsApp's
 * 24-hour window the desk cannot type freely — so rather than a disabled box
 * and no explanation, it says when the window closed, why, and what will
 * reopen it.
 */
export default function LeadThread({ initial }: { initial: Thread }) {
  const { data } = useQuery({
    ...threadCache.options(initial.id),
    initialData: initial,
    /**
     * A chat has to be live. The lead is writing from a phone and the reply
     * arrives through a webhook, so nothing in this tab knows it happened —
     * without a poll the desk would sit looking at a conversation that had
     * already moved on, and, worse, at a closed window that had reopened.
     */
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });

  // The fast path. The poll above is the floor underneath it — see the note
  // in src/hooks/use-lead-changes.ts.
  useLeadChanges(initial.id);

  return (
    <section className="flex min-w-0 grow flex-col gap-[22px] rounded-[18px] border border-neutral-200 bg-white px-[30px] py-7">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex items-center gap-[14px]">
          <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-neutral-100 text-[15px] font-semibold leading-[18px] text-neutral-700">
            {data.detail.initials}
          </span>
          <div className="flex flex-col gap-1">
            <h2 className="text-[24px] font-semibold leading-[30px] tracking-[-0.015em] text-pine">
              {data.detail.name}
            </h2>
            <p className="text-[13px] leading-4 text-neutral-500">{data.detail.sub}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Stage id={data.id} stage={data.stage} />
          <Link
            href="/admin/leads"
            className="flex items-center gap-[7px] rounded-full border border-neutral-200 px-[15px] py-[9px] text-[13px] font-medium leading-4 text-pine transition-colors hover:border-neutral-300"
          >
            Back to the board
          </Link>
        </div>
      </div>

      <div className="flex flex-col border-y border-neutral-200 py-4 sm:flex-row">
        {data.detail.facts.map((fact, i) => (
          <div
            key={fact.label}
            className={`flex min-w-0 grow basis-0 flex-col gap-[5px] ${
              i < data.detail.facts.length - 1 ? 'sm:border-r sm:border-neutral-200 sm:pr-5' : ''
            } ${i > 0 ? 'mt-3 sm:mt-0 sm:pl-5' : ''}`}
          >
            <span className="text-[10px] font-bold leading-3 tracking-[0.12em] text-neutral-500">
              {fact.label}
            </span>
            <span
              className={`text-[13px] leading-4 ${
                fact.accent ? 'font-semibold text-clay-ink' : 'font-medium text-pine'
              }`}
            >
              {fact.value}
            </span>
          </div>
        ))}
      </div>

      <Chat days={data.chat} name={data.name} />

      <Composer thread={data} />
    </section>
  );
}

/**
 * Where this lead has got to.
 *
 * The board is read-only — the cards are links into the conversation, and
 * burying a menu inside a link is a way to open the wrong thing — so this is
 * where a lead is moved along, on the screen where somebody has just read
 * what was said and knows whether it moved.
 *
 * `lost` is in the list. A lead who is never going to join is a real answer,
 * and one that cannot be recorded turns the board into a list nobody trusts;
 * it also releases their number, so the same person can come back in six
 * months as a fresh enquiry. See `uniq_lead_phone`.
 */
function Stage({ id, stage }: { id: number; stage: LeadStage }) {
  const qc = useQueryClient();

  const move = useMutation({
    mutationFn: (next: LeadStage) => moveLead(id, next),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: threadCache.key(id) }),
        qc.invalidateQueries({ queryKey: boardCache.key() }),
      ]),
  });

  return (
    <span
      className={`relative inline-flex h-[34px] shrink-0 items-center rounded-full border pl-[15px] pr-[30px] transition-colors focus-within:border-neutral-400 hover:border-neutral-300 ${
        move.isError ? 'border-clay' : 'border-neutral-200'
      }`}
      title={move.isError ? errorText(move.error, 'Could not move them.') : undefined}
    >
      <select
        aria-label="Stage"
        value={stage}
        disabled={move.isPending}
        onChange={(e) => move.mutate(e.target.value as LeadStage)}
        className="cursor-pointer appearance-none bg-transparent text-[13px] font-medium leading-4 text-pine outline-none disabled:opacity-50"
      >
        {LEAD_STAGES.map((s) => (
          <option key={s} value={s}>
            {STAGE_LABELS[s]}
          </option>
        ))}
      </select>
      <svg
        width="10"
        height="10"
        viewBox="0 0 12 12"
        aria-hidden
        className="pointer-events-none absolute right-[13px]"
      >
        <path
          d="M2.8 4.4 6 7.6l3.2-3.2"
          fill="none"
          stroke="#737373"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/**
 * The conversation.
 *
 * Read like a chat because that is what it is — the club's staff already know
 * what WhatsApp looks like, and the previous vertical timeline made them
 * translate. Their side left, ours right, grouped by day.
 *
 * It scrolls within a fixed height and pins itself to the newest message, so
 * a thread that has run for weeks opens where the work is rather than at the
 * first thing anyone ever said.
 */
function Chat({ days, name }: { days: ChatDay[]; name: string }) {
  const bottom = useRef<HTMLDivElement>(null);
  const count = days.reduce((n, d) => n + d.messages.length, 0);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [count]);

  return (
    <div className="flex flex-col gap-3">
      <Eyebrow tone="loud">THE CONVERSATION</Eyebrow>

      {count === 0 ? (
        <p className="rounded-xl bg-neutral-100 px-4 py-5 text-center text-[13px] leading-[19px] text-neutral-500">
          Nothing said yet. The first message has to be an approved template — see below.
        </p>
      ) : (
        <div className="flex max-h-[520px] flex-col gap-4 overflow-y-auto rounded-xl bg-neutral-100/70 px-4 py-5">
          {days.map((day) => (
            <div key={day.day} className="flex flex-col gap-2.5">
              <div className="flex items-center gap-3 py-0.5">
                <span className="h-px grow bg-neutral-200" />
                <span className="shrink-0 text-[11px] font-semibold uppercase leading-[14px] tracking-[0.1em] text-neutral-400">
                  {day.day}
                </span>
                <span className="h-px grow bg-neutral-200" />
              </div>
              {day.messages.map((m) => (
                <Bubble key={m.id} message={m} name={name} />
              ))}
            </div>
          ))}
          <div ref={bottom} />
        </div>
      )}
    </div>
  );
}

/** The word under one of our bubbles. */
const STATUS_WORD: Record<MessageStatus, string> = {
  queued: 'Sending…',
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Read',
  failed: 'Not delivered',
};

function Bubble({ message, name }: { message: ChatMessage; name: string }) {
  const { mine, status } = message;
  const failed = status === 'failed';

  return (
    <div className={`flex flex-col gap-1 ${mine ? 'items-end' : 'items-start'}`}>
      {!mine && (
        <span className="px-1 text-[11px] font-semibold leading-[14px] text-neutral-500">
          {name.split(' ')[0]}
        </span>
      )}

      <div
        className={`max-w-[78%] min-w-0 rounded-2xl px-[14px] py-[10px] ${
          failed
            ? 'border border-clay/40 bg-clay-wash'
            : mine
              ? 'bg-pine text-cream'
              : 'bg-white'
        }`}
      >
        <p
          className={`whitespace-pre-wrap break-words text-[14px] leading-[21px] ${
            failed ? 'text-[#8A5540]' : mine ? 'text-cream' : 'text-pine'
          }`}
        >
          {message.body}
        </p>
      </div>

      <div className="flex max-w-[78%] flex-wrap items-center gap-2 px-1">
        <span className="text-[11px] leading-[14px] text-neutral-400">{message.time}</span>

        {mine && (
          <span
            className={`flex items-center gap-1 text-[11px] leading-[14px] ${
              failed ? 'font-semibold text-clay-ink' : 'text-neutral-400'
            }`}
          >
            {!failed && <Ticks status={status} />}
            {STATUS_WORD[status]}
          </span>
        )}

        {message.template && (
          <span className="rounded bg-neutral-200/70 px-1.5 py-px text-[10px] font-medium leading-[14px] text-neutral-500">
            template · {message.template}
          </span>
        )}
      </div>

      {/* Meta's own complaint, verbatim. The desk can act on "window closed";
          it cannot act on a message that merely failed to appear. */}
      {failed && message.error && (
        <p className="max-w-[78%] px-1 text-[11px] leading-[15px] text-clay-ink">{message.error}</p>
      )}
    </div>
  );
}

/** One tick for sent, two for delivered, two in blue once read. */
function Ticks({ status }: { status: MessageStatus }) {
  if (status === 'queued') return null;
  const read = status === 'read';
  const colour = read ? '#4A8FE0' : '#A3A3A3';

  return (
    <svg width="14" height="10" viewBox="0 0 14 10" className="shrink-0" aria-hidden>
      <path
        d="M1 5.4 3 7.6 7.2 2.2"
        fill="none"
        stroke={colour}
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {status !== 'sent' && (
        <path
          d="M6.2 6.6l.9 1L11.6 2"
          fill="none"
          stroke={colour}
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

/**
 * The composer.
 *
 * Two states, decided by `canType`, which the server worked out from the same
 * clock the send endpoint will check — so the box is never open for a message
 * that would be refused, and never shut on one that would go through.
 */
function Composer({ thread }: { thread: Thread }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');

  const send = useMutation({
    mutationFn: (input: SendInput) => sendMessage(thread.id, input),
    onSuccess: async () => {
      setText('');
      // Both: the timeline gains a message, and the card's footer and age
      // on the board are drawn from the same rows.
      await Promise.all([
        qc.invalidateQueries({ queryKey: threadCache.key(thread.id) }),
        qc.invalidateQueries({ queryKey: boardCache.key() }),
      ]);
    },
    onError: () => {
      // A refusal still wrote a row, so the timeline has changed too.
      qc.invalidateQueries({ queryKey: threadCache.key(thread.id) });
    },
  });

  const failure = send.isError ? errorText(send.error, 'Could not send it.') : null;

  if (thread.canType) {
    return (
      <div className="flex flex-col overflow-clip rounded-xl border border-neutral-200">
        <div className="flex items-center gap-[10px] border-b border-neutral-200 bg-neutral-100 px-4 py-[11px]">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-pine" />
          <span className="text-[13px] font-semibold leading-4 text-pine">
            Replies are free right now
          </span>
          <span className="text-[13px] leading-4 text-neutral-500">
            {thread.detail.facts.find((f) => f.label === 'REPLY WINDOW')?.value}
          </span>
        </div>

        <div className="flex flex-col gap-3 p-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            maxLength={4096}
            placeholder={`Write to ${thread.name.split(' ')[0]}…`}
            className="w-full resize-y rounded-xl bg-neutral-100 px-4 py-[14px] text-[15px] leading-[23px] text-pine outline-none placeholder:text-neutral-400 focus:ring-2 focus:ring-pine/20"
          />
          {failure && <FormError>{failure}</FormError>}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <span className="min-w-0 grow text-[13px] leading-4 text-neutral-500">
              Goes to {thread.phone} on WhatsApp, and into the conversation above.
            </span>
            <Btn
              variant="primary"
              disabled={send.isPending || !text.trim()}
              onClick={() => send.mutate({ body: text })}
            >
              {send.isPending ? 'Sending…' : 'Send'}
            </Btn>
          </div>
        </div>
      </div>
    );
  }

  const notice = thread.notice!;

  return (
    <div className="flex flex-col overflow-clip rounded-xl border border-neutral-200">
      <div className="flex items-start gap-[10px] bg-clay-wash px-4 py-[13px]">
        <svg width="15" height="15" viewBox="0 0 15 15" className="mt-px shrink-0" aria-hidden>
          <circle cx="7.5" cy="7.5" r="6" fill="none" stroke="var(--color-clay)" strokeWidth="1.3" />
          <path
            d="M7.5 4.6v3.2l2 1.4"
            fill="none"
            stroke="var(--color-clay)"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
        <div className="flex flex-col gap-[3px]">
          <span className="font-sans text-[13px] font-semibold leading-4 text-clay">
            {notice.headline}
          </span>
          <p className="font-sans text-[13px] leading-[19px] text-[#8A5540]">{notice.detail}</p>
        </div>
      </div>

      <div className="flex items-center gap-[10px] border-b border-neutral-200 bg-neutral-100 px-4 py-[15px]">
        <svg width="14" height="14" viewBox="0 0 14 14" className="shrink-0" aria-hidden>
          <rect
            x="2.6"
            y="6.2"
            width="8.8"
            height="6.2"
            rx="1.3"
            fill="none"
            stroke="#A3A3A3"
            strokeWidth="1.3"
          />
          <path
            d="M4.8 6.2V4.6a2.2 2.2 0 0 1 4.4 0v1.6"
            fill="none"
            stroke="#A3A3A3"
            strokeWidth="1.3"
          />
        </svg>
        <span className="text-[15px] leading-[18px] text-neutral-400">{notice.locked}</span>
      </div>

      <Templates thread={thread} send={send} failure={failure} text={text} setText={setText} />
    </div>
  );
}

/**
 * Picking a template.
 *
 * The list is Meta's, fetched from the Business Account — see `templates` in
 * src/lib/whatsapp.ts. That matters more than it sounds: an unapproved
 * template is refused on send, so a list typed into the code would be a row
 * of buttons that all fail, and the desk would learn which ones work by
 * annoying a lead.
 *
 * The holes in the wording are filled here rather than guessed at, because
 * Meta matches the number of values against the number of placeholders and
 * rejects the send outright if they differ (132005). What the desk sees
 * above the button is exactly what the lead will read.
 */
function Templates({
  thread,
  send,
  failure,
  text,
  setText,
}: {
  thread: Thread;
  send: { isPending: boolean; mutate: (input: SendInput) => void };
  failure: string | null;
  text: string;
  setText: (v: string) => void;
}) {
  const list = thread.templates;
  const [picked, setPicked] = useState(list[0]?.name ?? '');
  // Keyed by placeholder, not by position, so switching template does not
  // carry a value into a hole that means something else.
  const [values, setValues] = useState<Record<string, string>>({});

  const chosen = list.find((t) => t.name === picked) ?? list[0];

  const first = thread.name.split(' ')[0];

  if (list.length === 0) {
    return (
      <div className="flex flex-col gap-[11px] p-4">
        <Label />
        <p className="text-[13px] leading-[19px] text-neutral-500">
          No template is approved for this number, so {first} cannot be reached until they write
          back.{' '}
          {thread.templatesError
            ? `Meta could not be asked: ${thread.templatesError}`
            : 'Register one in Meta, and it appears here the moment it is approved.'}
        </p>
      </div>
    );
  }

  const body = chosen!.body;
  const filled = fill(body, values);
  // A template with no stored wording is the hand-configured fallback from
  // WHATSAPP_TEMPLATE: we know its name but not what it says, so the desk
  // types what the chat should keep. See `templates` in src/lib/whatsapp.ts.
  const known = body.length > 0;
  const ready = known ? chosen!.params.every((k) => values[k]?.trim()) : text.trim().length > 0;

  return (
    <div className="flex flex-col gap-[11px] p-4">
      <Label />

      <div className="flex flex-wrap items-center gap-2">
        {list.map((t) => (
          <Chip
            key={`${t.name}·${t.language}`}
            on={t.name === picked}
            onClick={() => {
              setPicked(t.name);
              setValues({});
            }}
          >
            <span className="flex items-baseline gap-2">
              {t.name}
              <span
                className={`text-[11px] font-medium leading-[14px] ${
                  t.name === picked ? 'text-[#9AAAA1]' : 'text-neutral-500'
                }`}
              >
                {t.category === 'marketing' ? 'billed' : 'free'}
              </span>
            </span>
          </Chip>
        ))}
      </div>

      {known ? (
        <>
          {chosen!.params.length > 0 && (
            <div className="flex flex-col gap-2">
              {chosen!.params.map((key) => (
                <label key={key} className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold leading-[14px] text-neutral-500">
                    {`{{${key}}}`}
                  </span>
                  <input
                    value={values[key] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                    placeholder={key === '1' ? first : ''}
                    className="h-[38px] rounded-[9px] border border-neutral-200 bg-white px-3 text-[14px] text-pine outline-none focus:border-clay"
                  />
                </label>
              ))}
            </div>
          )}

          {/* What the lead will actually read, not a description of it. */}
          <p className="whitespace-pre-wrap rounded-xl bg-neutral-100 px-4 py-[14px] text-[15px] leading-[23px] text-pine">
            {filled}
          </p>
        </>
      ) : (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          maxLength={4096}
          placeholder="What this template says, for the club's own record…"
          className="w-full resize-y rounded-xl bg-neutral-100 px-4 py-[14px] text-[15px] leading-[23px] text-pine outline-none placeholder:text-neutral-400 focus:ring-2 focus:ring-pine/20"
        />
      )}

      {failure && <FormError>{failure}</FormError>}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <span className="min-w-0 grow text-[13px] leading-4 text-neutral-500">
          {known
            ? `Goes to ${thread.phone} in ${chosen!.language}. The chat keeps the wording above, since Meta stores the template's name and not what they read.`
            : "WhatsApp sends the approved wording. What you type here is what the chat keeps, since Meta stores the template's name and not what they read."}
        </span>
        <Btn
          variant="primary"
          disabled={send.isPending || !ready}
          onClick={() =>
            send.mutate({
              body: known ? filled : text,
              template: chosen!.name,
              lang: chosen!.language,
              params: known ? chosen!.params.map((k) => values[k] ?? '') : [],
            })
          }
        >
          {send.isPending ? 'Sending…' : 'Send template'}
        </Btn>
      </div>
    </div>
  );
}

function Label() {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-4">
      <span className="text-[11px] font-semibold uppercase leading-[14px] tracking-[0.13em] text-neutral-400">
        Approved templates
      </span>
    </div>
  );
}

/** The template's wording with the holes filled, holes left visible if not. */
function fill(body: string, values: Record<string, string>): string {
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (whole, key: string) =>
    values[key]?.trim() ? values[key]! : whole,
  );
}
