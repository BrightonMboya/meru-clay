'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Aside,
  Btn,
  Choices,
  Field,
  FieldRow,
  Fieldset,
  FormError,
  Head,
  OnSave,
  Screen,
  errorText,
} from '@/components/admin/ui';
import { LEAD_SOURCES, SOURCE_LABELS, type LeadSource } from '@/lib/pipeline';
import { addLead } from '@/lib/queries/leads';

/**
 * What saving this actually does.
 *
 * The design's version promised a welcome message on save. It does not send
 * one, and it must not pretend to: WhatsApp will not carry a message to
 * somebody who has never written to the club unless it is a template Meta has
 * approved, and approving one is a separate piece of work. The lead is saved;
 * reaching them is the next, deliberate step.
 */
const ON_SAVE = [
  'They appear on the board under NEW straight away.',
  'Nothing is sent. WhatsApp will not carry a first message that is not an approved template.',
  'The moment they message the club’s number, the conversation lands on their card and replies are free for 24 hours.',
];

/** The sources a person at the desk would actually name. */
const PICKABLE: readonly LeadSource[] = LEAD_SOURCES.filter((s) => s !== 'whatsapp');

/**
 * Add a lead — for enquiries that arrive off-platform.
 *
 * A walk-in, a phone call, a member's recommendation. Leads from the
 * Instagram and Facebook forms arrive on their own; this is the one at the
 * desk with somebody standing in front of them, so it asks for as little as
 * possible. The number is the exception and is required — it is the WhatsApp
 * address, and a lead that cannot be messaged is only a note.
 */
export default function AddLead() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [source, setSource] = useState<LeadSource>('walk_in');
  const [campaign, setCampaign] = useState('');
  const [note, setNote] = useState('');

  const save = useMutation({
    mutationFn: addLead,
    // Straight to their conversation — the reason for adding them is to say
    // something, and that is the next screen.
    onSuccess: (lead) => router.push(`/admin/leads/${lead.id}`),
  });

  const ready = name.trim().length >= 2 && phone.trim().length > 0;

  function submit() {
    save.mutate({
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim() || undefined,
      source,
      campaign: campaign.trim() || undefined,
      note: note.trim() || undefined,
    });
  }

  return (
    <Screen gap={32}>
      <Head
        title="Add a lead"
        blurb="For an enquiry that came in off-platform — a walk-in, a phone call, somebody a member sent."
        back={{ label: 'Leads', href: '/admin/leads' }}
        actions={
          <>
            <Btn href="/admin/leads">Cancel</Btn>
            <Btn variant="primary" disabled={save.isPending || !ready} onClick={submit}>
              {save.isPending ? 'Saving…' : 'Save lead'}
            </Btn>
          </>
        }
      />

      <div className="flex flex-col items-start gap-12 xl:flex-row">
        <form
          className="flex min-w-0 grow flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) submit();
          }}
        >
          <Fieldset step={1} label="Who they are">
            <FieldRow>
              <Field label="Name" placeholder="Grace Kimambo" value={name} onChange={setName} />
              <Field
                label="WhatsApp number"
                hint="required"
                placeholder="0782 441 018"
                value={phone}
                onChange={setPhone}
                type="tel"
              />
            </FieldRow>
            <Field
              label="Email"
              hint="optional"
              placeholder="grace@example.com"
              value={email}
              onChange={setEmail}
              type="email"
            />
            <Aside>
              The number is how the club reaches them. Tanzanian mobiles only for now — 0754…,
              0682…, or the full +255 form.
            </Aside>
          </Fieldset>

          <Fieldset step={2} label="Where they came from">
            <Choices
              options={PICKABLE.map((s) => SOURCE_LABELS[s])}
              chosen={SOURCE_LABELS[source]}
              onPick={(label) => {
                const found = PICKABLE.find((s) => SOURCE_LABELS[s] === label);
                if (found) setSource(found);
              }}
              chosenStyle="ring"
            />
            <Field
              label="Campaign or who sent them"
              hint="optional"
              placeholder="Adult beginners"
              value={campaign}
              onChange={setCampaign}
            />
          </Fieldset>

          <Fieldset step={3} label="What they asked">
            <Field label="In their own words" hint="optional">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                placeholder="“Do you teach complete beginners? I’m 34.”"
                className="w-full resize-y rounded-[10px] border border-neutral-200 bg-white px-[14px] py-3 text-[15px] font-medium leading-[23px] text-pine outline-none transition-colors placeholder:font-normal placeholder:text-neutral-400 focus:border-pine/40"
              />
            </Field>
            <Aside>
              Worth taking down verbatim. It is what the first reply answers, and it is the only
              part of a walk-in enquiry nobody can reconstruct later.
            </Aside>
          </Fieldset>

          {save.isError && (
            <div className="pt-1">
              <FormError>{errorText(save.error, 'Could not add them.')}</FormError>
            </div>
          )}
        </form>

        <aside className="flex w-full shrink-0 flex-col gap-7 xl:w-[340px]">
          <OnSave items={ON_SAVE} />
        </aside>
      </div>
    </Screen>
  );
}
