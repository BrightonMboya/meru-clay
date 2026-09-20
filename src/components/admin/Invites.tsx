'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import {
  Badge,
  Btn,
  Cell,
  Field,
  Fieldset,
  FormError,
  Head,
  NameCell,
  Row,
  Screen,
  Table,
  errorText,
  type BadgeTone,
  type Col,
} from '@/components/admin/ui';
import type { Invite, InviteStatus } from '@/lib/admin/invites';

const COLS: Col[] = [
  { head: 'Who', min: 220 },
  { head: 'Invited by', w: 160 },
  { head: 'State', w: 110 },
  { head: '', w: 110, align: 'right' },
];

const TONE: Record<InviteStatus, BadgeTone> = {
  pending: 'clay',
  accepted: 'green',
  expired: 'grey',
};

const WORD: Record<InviteStatus, string> = {
  pending: 'Waiting',
  accepted: 'Joined',
  expired: 'Expired',
};

/** "in 6 days" / "3 days ago" — enough to judge an invitation by. */
function when(iso: string): string {
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days === 0) return 'today';
  if (days > 0) return days === 1 ? 'tomorrow' : `in ${days} days`;
  return days === -1 ? 'yesterday' : `${-days} days ago`;
}

function subtitle(invite: Invite): string {
  if (invite.status === 'accepted') return `Joined ${when(invite.acceptedAt!)}`;
  if (invite.status === 'expired') return `Expired ${when(invite.expiresAt)}`;
  return `Expires ${when(invite.expiresAt)}`;
}

/**
 * Inviting colleagues into the club office.
 *
 * The list is held in state and replaced from what the server hands back, so
 * the screen never has to guess what the write did — the row it shows after
 * inviting someone is the row the database actually holds.
 */
export default function Invites({ initial }: { initial: Invite[] }) {
  const [invites, setInvites] = useState(initial);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The row whose withdrawal is in flight, so only its own button greys out. */
  const [revoking, setRevoking] = useState<number | null>(null);

  /**
   * Called from both the form's `onSubmit` and the pill's `onClick` — `Btn`
   * renders a `type="button"`, so the two paths are wired separately, as in
   * the other office forms.
   */
  async function send() {
    setError(null);
    setSending(true);

    try {
      const res = await fetch('/api/desk/invites', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const body = (await res.json()) as { invite?: Invite; error?: string };
      if (!res.ok) throw new Error(body.error ?? 'The invitation could not be sent.');

      const invite = body.invite!;
      // Re-inviting an address updates its row rather than adding one, so the
      // list is rebuilt the same way: drop any row for this address, then
      // put the returned one at the top.
      setInvites((rows) => [invite, ...rows.filter((r) => r.email !== invite.email)]);
      setEmail('');
      toast.success(`Invitation sent to ${invite.email}.`);
    } catch (err) {
      setError(errorText(err, 'The invitation could not be sent.'));
    } finally {
      setSending(false);
    }
  }

  async function revoke(invite: Invite) {
    setRevoking(invite.id);
    try {
      const res = await fetch(`/api/desk/invites/${invite.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'The invitation could not be withdrawn.');
      }
      setInvites((rows) => rows.filter((r) => r.id !== invite.id));
      toast.success(`Invitation to ${invite.email} withdrawn.`);
    } catch (err) {
      toast.error(errorText(err, 'The invitation could not be withdrawn.'));
    } finally {
      setRevoking(null);
    }
  }

  return (
    <Screen>
      <Head
        title="Invite"
        blurb="Ask a colleague into the club office. They get an emailed link that makes their account."
      />

      <form
        className="max-w-[560px]"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <Fieldset step={1} label="Who" note="They need no password — the link signs them in.">
          <Field
            label="Email address"
            type="email"
            placeholder="name@meruclay.co.tz"
            value={email}
            onChange={setEmail}
          />
          {error && <FormError>{error}</FormError>}
          <div className="flex items-center gap-3 pt-1">
            <Btn variant="primary" onClick={send} disabled={sending || !email.trim()}>
              {sending ? 'Sending…' : 'Send invitation'}
            </Btn>
            <span className="text-[12px] leading-4 text-neutral-500">
              The link lasts a day; the invitation stands for a week.
            </span>
          </div>
        </Fieldset>
      </form>

      <div className="flex flex-col gap-4">
        <h2 className="font-sans text-[11px] font-semibold uppercase leading-[14px] tracking-[0.13em] text-neutral-500">
          Invitations
        </h2>

        {invites.length === 0 ? (
          <p className="text-[15px] leading-[23px] text-neutral-600">
            Nobody has been invited yet. The club office has one operator — you.
          </p>
        ) : (
          <Table cols={COLS}>
            {invites.map((invite) => (
              <Row key={invite.id}>
                <Cell col={COLS[0]!}>
                  <NameCell name={invite.email} sub={subtitle(invite)} />
                </Cell>
                <Cell col={COLS[1]!}>
                  <span className="truncate text-[13px] leading-4 text-neutral-600">
                    {invite.invitedByName ?? '—'}
                  </span>
                </Cell>
                <Cell col={COLS[2]!}>
                  <Badge tone={TONE[invite.status]}>{WORD[invite.status]}</Badge>
                </Cell>
                <Cell col={COLS[3]!}>
                  {/* Nothing to withdraw once they are in — removing the row
                      then would take away the record, not the access. */}
                  {invite.status === 'accepted' ? (
                    <span className="text-[12px] leading-4 text-neutral-400">—</span>
                  ) : (
                    <Btn
                      size="sm"
                      variant="quiet"
                      disabled={revoking === invite.id}
                      onClick={() => revoke(invite)}
                    >
                      {revoking === invite.id ? 'Withdrawing…' : 'Withdraw'}
                    </Btn>
                  )}
                </Cell>
              </Row>
            ))}
          </Table>
        )}
      </div>
    </Screen>
  );
}
