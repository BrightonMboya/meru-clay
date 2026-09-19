import 'server-only';

import {
  finishOutbound,
  recordOutbound,
  type LeadMessageRow,
  type LeadRow,
} from './leads';
import { replyWindow } from './pipeline';
import { sendTemplate, sendText } from './whatsapp';

/**
 * Sending a message to a lead.
 *
 * The one place that decides freeform-or-template, and the reason it is its
 * own file: src/lib/leads.ts is storage and must stay free of the network,
 * src/lib/whatsapp.ts is the network and must stay free of the database, and
 * this is the short piece of club policy that needs both.
 *
 * The order is deliberate and is not an implementation detail:
 *
 *   1. check the window        — refuse locally rather than let Meta refuse
 *   2. write the row           — so a send that fails is still visible
 *   3. call Meta
 *   4. stamp the outcome       — onto the row from step 2
 *
 * Step 1 exists even though step 3 would catch it anyway, because a refusal
 * we make ourselves can explain what to do instead, costs no round trip, and
 * cannot be mistaken by the desk for a network problem.
 */

export type SendRequest =
  /** Freeform. Only legal inside the 24-hour window. */
  | { kind: 'text'; body: string }
  /**
   * An approved template. Always legal, and the only way to start a
   * conversation. `body` is what to store on the timeline — the rendered
   * wording — since Meta stores the template name, not what the lead read.
   */
  | {
      kind: 'template';
      name: string;
      params?: string[];
      body: string;
      /**
       * The template's own language code. Meta keys a template on name AND
       * language, and sending "en" to a template registered only in "sw" is
       * rejected — so the composer sends back the language it picked from
       * rather than letting a single env default stand for all of them.
       */
      lang?: string;
    };

export type SendOutcome =
  | { ok: true; message: LeadMessageRow }
  /** `message` is present when a row was written before the failure. */
  | { ok: false; error: string; message?: LeadMessageRow };

export async function sendToLead(lead: LeadRow, req: SendRequest): Promise<SendOutcome> {
  if (req.kind === 'text') {
    const window = replyWindow(lead.lastInboundAt);
    if (!window.open) {
      return {
        ok: false,
        error: window.everWrote
          ? `${lead.name} last wrote more than 24 hours ago, so a free reply is no longer allowed. Send an approved template instead.`
          : `${lead.name} has never messaged the club, so the first message must be an approved template.`,
      };
    }
  }

  const body = req.body.trim();
  if (!body) return { ok: false, error: 'Nothing to send.' };

  const row = await recordOutbound(lead.id, body, req.kind === 'template' ? req.name : null);

  const result =
    req.kind === 'template'
      ? await sendTemplate(lead.phone, req.name, req.params ?? [], undefined, req.lang)
      : await sendText(lead.phone, body);

  const message = await finishOutbound(row.id, lead.id, result);

  return result.ok ? { ok: true, message } : { ok: false, error: result.error, message };
}
