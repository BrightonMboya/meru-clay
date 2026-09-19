import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * WhatsApp, over Meta's Cloud API — the transport.
 *
 * This is the only file that knows Graph API field names. Everything above it
 * asks for "send this text to this number" and gets back a plain result.
 *
 * ── How it differs from src/lib/notify.ts ────────────────────────────────
 *
 * notify.ts also talks to this API, and swallows every failure on purpose: a
 * booking is already committed by then, and a bounced notification must never
 * be reported to the player as a failed booking.
 *
 * This module does the opposite. A message to a lead IS the action — there is
 * nothing else that succeeded — so a failure here is returned, stored on the
 * row, and shown to the desk. Someone has to know the message never arrived.
 *
 * (The two should eventually share one sender, with the error handling as the
 * caller's choice. Left alone for now: notify.ts is on the booking path and is
 * working.)
 *
 * ── The 24-hour rule ─────────────────────────────────────────────────────
 *
 * Meta will not accept freeform text to someone who has not written to us in
 * the last 24 hours; it answers 131047 and the message is simply not sent.
 * `replyWindow` in src/lib/pipeline.ts is our own copy of that clock, checked
 * before we call — but this module still maps 131047 to a plain sentence,
 * because the two clocks can disagree by a second and the desk should get an
 * explanation rather than a number.
 */

const GRAPH_VERSION = 'v21.0';

export type WhatsAppEnv = {
  /** Meta system-user token with whatsapp_business_messaging. */
  token: string;
  /** Phone number ID of the sending number — NOT the phone number itself. */
  phoneId: string;
  /** Our own string, echoed back during webhook handshake. */
  verifyToken: string;
  /** App secret, used to prove a webhook POST really came from Meta. */
  appSecret: string;
};

export function whatsappEnv(): Partial<WhatsAppEnv> {
  const e = process.env;
  return {
    token: e.WHATSAPP_TOKEN,
    phoneId: e.WHATSAPP_PHONE_ID,
    verifyToken: e.WHATSAPP_VERIFY_TOKEN,
    appSecret: e.WHATSAPP_APP_SECRET,
  };
}

/** Everything needed to send. Missing any of it means WhatsApp is not set up. */
export function canSend(env = whatsappEnv()): env is WhatsAppEnv {
  return Boolean(env.token && env.phoneId);
}

export type SendResult =
  | { ok: true; waMessageId: string }
  | { ok: false; error: string; code?: number };

/** E.164 digits only — Meta rejects "+", spaces and dashes in `to`. */
export function toE164Digits(raw: string): string {
  return raw.replace(/\D/g, '');
}

/**
 * Meta's numeric codes, in the club's words.
 *
 * Worth the table: the raw message for a closed window is "Message failed to
 * send because more than 24 hours have passed since the customer last replied
 * to this number", which is accurate and useless to somebody at a desk who
 * now needs to know what to do instead.
 */
function explain(code: number | undefined, fallback: string): string {
  switch (code) {
    case 131047:
    case 470:
      return 'Their free reply window has closed — send an approved template instead.';
    case 131026:
      return 'That number cannot receive WhatsApp. Check it, or ring them.';
    case 131051:
      return 'Unsupported message type.';
    case 132000:
    case 132001:
      return 'That template is not approved for this number yet.';
    case 132005:
      return 'The template text and the values given to it do not match.';
    case 190:
      return 'The WhatsApp access token has expired. Generate a new one in Meta.';
    case 100:
      return `Meta rejected the request: ${fallback}`;
    case 133010:
      return 'The sending number is not registered with the Cloud API yet.';
    case 80007:
    case 130429:
      return 'Sending too fast — Meta is rate-limiting. Try again shortly.';
    default:
      return fallback;
  }
}

async function post(env: WhatsAppEnv, body: unknown): Promise<SendResult> {
  let res: Response;
  try {
    res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${env.phoneId}/messages`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    // No network, DNS, TLS. Distinct from Meta refusing us.
    return { ok: false, error: `Could not reach WhatsApp: ${(err as Error).message}` };
  }

  const payload = (await res.json().catch(() => ({}))) as {
    messages?: Array<{ id?: string }>;
    error?: { message?: string; code?: number; error_data?: { details?: string } };
  };

  if (!res.ok || payload.error) {
    const code = payload.error?.code;
    const raw =
      payload.error?.error_data?.details ??
      payload.error?.message ??
      `WhatsApp returned ${res.status}`;
    console.error('whatsapp send failed:', code, raw);
    return { ok: false, error: explain(code, raw), code };
  }

  const waMessageId = payload.messages?.[0]?.id;
  // Accepted but unidentifiable. Treated as sent — it has gone — but the row
  // will never receive a delivery update, so say so rather than inventing one.
  if (!waMessageId) return { ok: false, error: 'WhatsApp accepted the message but returned no id.' };

  return { ok: true, waMessageId };
}

/**
 * Freeform text. Legal only inside the 24-hour window; callers must check
 * `replyWindow` first, and Meta will refuse it anyway if they did not.
 */
export function sendText(to: string, body: string, env = whatsappEnv()): Promise<SendResult> {
  if (!canSend(env)) {
    return Promise.resolve({ ok: false, error: 'WhatsApp is not configured.' });
  }
  return post(env, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toE164Digits(to),
    type: 'text',
    text: { preview_url: false, body },
  });
}

/**
 * An approved template. The only way to open a conversation with somebody who
 * has not written to us — which is every new lead.
 *
 * `params` fill {{1}}, {{2}}… in the template's body, in order.
 */
export function sendTemplate(
  to: string,
  name: string,
  params: readonly string[] = [],
  env = whatsappEnv(),
  lang: string | undefined = undefined,
): Promise<SendResult> {
  const code = lang || process.env.WHATSAPP_TEMPLATE_LANG || 'en';
  if (!canSend(env)) {
    return Promise.resolve({ ok: false, error: 'WhatsApp is not configured.' });
  }
  return post(env, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toE164Digits(to),
    type: 'template',
    template: {
      name,
      language: { code },
      ...(params.length
        ? {
            components: [
              {
                type: 'body',
                parameters: params.map((text) => ({ type: 'text', text })),
              },
            ],
          }
        : {}),
    },
  });
}

/* ------------------------------------------------------------- inbound */

/**
 * Prove a webhook POST came from Meta and not from whoever found the URL.
 *
 * The tunnel this runs behind in development has a public address, and the
 * endpoint writes to the database, so this is not optional. Compared with
 * `timingSafeEqual` because a plain `===` on a signature leaks its bytes to
 * anyone patient enough to time the responses.
 *
 * Returns true when no app secret is configured — with a note, because that
 * is the one case where an unsigned request is let through, and it should be
 * a deliberate choice made during first setup rather than a silent hole.
 */
export function verifySignature(raw: string, header: string | null, appSecret?: string): boolean {
  if (!appSecret) {
    console.warn('WHATSAPP_APP_SECRET is unset — webhook signatures are not being checked.');
    return true;
  }
  if (!header?.startsWith('sha256=')) return false;

  const expected = createHmac('sha256', appSecret).update(raw, 'utf8').digest();
  const given = Buffer.from(header.slice('sha256='.length), 'hex');

  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** One message somebody sent us. */
export type InboundMessage = {
  waMessageId: string;
  /** Their number, digits only, as Meta reports it. */
  from: string;
  /** The profile name on their WhatsApp account — often the only name we get. */
  profileName: string | null;
  text: string;
  at: Date;
};

/** Meta telling us what became of something we sent. */
export type StatusUpdate = {
  waMessageId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  error: string | null;
};

type WebhookBody = {
  entry?: Array<{
    /** The WhatsApp Business Account this notification is about. */
    id?: string;
    changes?: Array<{
      value?: {
        contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
        messages?: Array<{
          id?: string;
          from?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
          button?: { text?: string };
          interactive?: {
            button_reply?: { title?: string };
            list_reply?: { title?: string };
          };
        }>;
        statuses?: Array<{
          id?: string;
          status?: string;
          errors?: Array<{ code?: number; title?: string; message?: string }>;
        }>;
      };
    }>;
  }>;
};

/**
 * Pull the parts we act on out of Meta's envelope.
 *
 * The payload is deeply nested and every level is optional — Meta sends
 * notification types we never asked for, and will add more. Anything not
 * understood is skipped rather than throwing, because a webhook that returns
 * 500 gets retried, and a retry of something we will never understand is an
 * infinite one.
 *
 * Non-text messages (an image, a voice note, a tapped quick-reply button) are
 * kept as a readable placeholder rather than dropped: the desk needs to see
 * that the lead said *something*, and — the part that actually matters — any
 * inbound message at all reopens the 24-hour window.
 */
export function parseWebhook(body: unknown): {
  messages: InboundMessage[];
  statuses: StatusUpdate[];
  /**
   * The Business Account id Meta stamps on every delivery.
   *
   * Worth pulling out because it is the one id that cannot be read back from
   * the Cloud API — the phone number node does not carry it — and it is
   * exactly what `WHATSAPP_WABA_ID` wants. The webhook route logs it when
   * that variable is unset, so setting up the template list is a copy and a
   * paste rather than a hunt through Meta's dashboard.
   */
  accountId: string | null;
} {
  const messages: InboundMessage[] = [];
  const statuses: StatusUpdate[] = [];
  let accountId: string | null = null;

  for (const entry of (body as WebhookBody)?.entry ?? []) {
    accountId ??= entry.id ?? null;
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;

      const profileName = value.contacts?.[0]?.profile?.name ?? null;

      for (const m of value.messages ?? []) {
        if (!m.id || !m.from) continue;
        messages.push({
          waMessageId: m.id,
          from: m.from,
          profileName,
          text: textOf(m),
          at: m.timestamp ? new Date(Number(m.timestamp) * 1000) : new Date(),
        });
      }

      for (const s of value.statuses ?? []) {
        if (!s.id || !isStatus(s.status)) continue;
        const e = s.errors?.[0];
        statuses.push({
          waMessageId: s.id,
          status: s.status,
          error: e ? explain(e.code, e.message ?? e.title ?? 'Delivery failed.') : null,
        });
      }
    }
  }

  return { messages, statuses, accountId };
}

function isStatus(v: unknown): v is StatusUpdate['status'] {
  return v === 'sent' || v === 'delivered' || v === 'read' || v === 'failed';
}

/** Text, a tapped button's label, or a readable placeholder. Never empty. */
function textOf(m: {
  type?: string;
  text?: { body?: string };
  button?: { text?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
}): string {
  return (
    m.text?.body ??
    m.button?.text ??
    m.interactive?.button_reply?.title ??
    m.interactive?.list_reply?.title ??
    `[${m.type ?? 'message'}]`
  );
}

/* ------------------------------------------------------------- the account */

/**
 * Reading the account rather than sending through it.
 *
 * Two things the leads screen needs that only Meta knows: which templates
 * have been approved, and what state the sending number is in. Both used to
 * be typed into the code as plausible-looking figures. They are not figures
 * the club can invent — a template that is not approved cannot be sent, and a
 * quality rating the club imagined is worse than no rating at all — so both
 * are fetched, and both fail honestly.
 *
 * ── Why the cache is in a module variable ────────────────────────────────
 *
 * The screens that read these are `force-dynamic`, which in Next 16 turns
 * every `fetch` in the route into `no-store` — so `next: { revalidate }`
 * would be ignored and each page view would cost two Graph calls. Neither
 * answer changes more than a few times a month, and Meta rate-limits reads
 * per app, so they are held in the process for a few minutes. A restart or a
 * new serverless instance simply fetches again.
 */

const CACHE_MS = 5 * 60 * 1000;

const cache = new Map<string, { at: number; value: unknown }>();

async function memo<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as T;

  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** A Graph read. Never throws — the caller shows what it got, or says so. */
async function graph<T>(path: string, token: string): Promise<T | { error: string }> {
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
      // Nothing read here is worth holding a page for. Meta occasionally
      // takes tens of seconds to answer a read, and without a deadline that
      // becomes the render time of the whole leads screen.
      signal: AbortSignal.timeout(8000),
    });
    const payload = (await res.json().catch(() => ({}))) as
      | T
      | { error?: { message?: string; code?: number } };

    const err = (payload as { error?: { message?: string; code?: number } }).error;
    if (!res.ok || err) {
      const raw = err?.message ?? `Meta returned ${res.status}`;
      console.error('whatsapp graph read failed:', path, err?.code, raw);
      return { error: explain(err?.code, raw) };
    }

    return payload as T;
  } catch (e) {
    const err = e as Error;
    const why = err.name === 'TimeoutError' ? 'it did not answer within 8 seconds' : err.message;
    return { error: `Could not reach Meta: ${why}.` };
  }
}

/* ------------------------------------------------------------- templates */

export type TemplateStatus = 'approved' | 'pending' | 'rejected' | 'paused' | 'disabled';

/** One template Meta holds for this account. */
export type WaTemplate = {
  name: string;
  /** "en", "sw" — the code `sendTemplate` must be given. */
  language: string;
  /** 'utility' is free, 'marketing' is billed. Meta's own categories. */
  category: string;
  status: TemplateStatus;
  /** The body text, placeholders left in as Meta stores them. */
  body: string;
  /**
   * The placeholders in the body, in order of first appearance — "1", "2",
   * or a name for the newer named-parameter templates. The composer draws one
   * input per entry and sends the values back in this order, which is the
   * order Meta fills them in.
   */
  params: string[];
};

type RawTemplate = {
  name?: string;
  language?: string;
  category?: string;
  status?: string;
  components?: Array<{ type?: string; text?: string }>;
};

function toStatus(raw: string | undefined): TemplateStatus {
  switch ((raw ?? '').toUpperCase()) {
    case 'APPROVED':
      return 'approved';
    case 'REJECTED':
      return 'rejected';
    case 'PAUSED':
      return 'paused';
    case 'DISABLED':
      return 'disabled';
    default:
      return 'pending';
  }
}

/** The {{…}} holes in a template body, deduplicated, in order. */
export function placeholdersIn(body: string): string[] {
  const found: string[] = [];
  for (const m of body.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) {
    const key = m[1]!;
    if (!found.includes(key)) found.push(key);
  }
  return found;
}

/**
 * Every template on the account.
 *
 * Needs WHATSAPP_WABA_ID — the Business Account, which is a different id from
 * the phone number the club sends with, and the one Meta hangs templates off.
 * Without it the club falls back to the single name in WHATSAPP_TEMPLATE; see
 * `templates` below.
 */
async function fetchTemplates(): Promise<WaTemplate[] | { error: string }> {
  const token = process.env.WHATSAPP_TOKEN;
  const waba = process.env.WHATSAPP_WABA_ID;
  if (!token || !waba) return { error: 'WHATSAPP_WABA_ID is not set.' };

  const res = await graph<{ data?: RawTemplate[] }>(
    `${waba}/message_templates?fields=name,status,category,language,components&limit=200`,
    token,
  );
  if ('error' in res) return res;

  return (res.data ?? [])
    .filter((t): t is RawTemplate & { name: string } => Boolean(t.name))
    .map((t) => {
      const body = t.components?.find((c) => c.type?.toUpperCase() === 'BODY')?.text ?? '';
      return {
        name: t.name,
        language: t.language ?? 'en',
        category: (t.category ?? 'utility').toLowerCase(),
        status: toStatus(t.status),
        body,
        params: placeholdersIn(body),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The template list, as the rest of the app should ask for it.
 *
 * Three states, and they are genuinely different: a list, an explanation of
 * why there is no list, or the one template the club configured by hand
 * before it had a Business Account id to read from. The last is the case the
 * club is actually in today, which is why it is not treated as a failure.
 */
export async function templates(): Promise<{ list: WaTemplate[]; error: string | null }> {
  const fallback = process.env.WHATSAPP_TEMPLATE?.trim();

  const res = await memo('templates', fetchTemplates);

  if ('error' in res) {
    if (!fallback) return { list: [], error: res.error };
    return {
      list: [
        {
          name: fallback,
          language: process.env.WHATSAPP_TEMPLATE_LANG ?? 'en',
          category: 'utility',
          status: 'approved',
          body: '',
          params: [],
        },
      ],
      error: null,
    };
  }

  return { list: res, error: null };
}

/* -------------------------------------------------------- the number itself */

/** The sending number's state, as Meta reports it. */
export type NumberHealth = {
  name: string;
  /** "+255 736 118 400", Meta's own formatting. */
  number: string;
  verified: boolean;
  /** "High", "Medium", "Low", or "Not rated yet". */
  quality: string;
  /** How many unique people the number may message a day, as a number. */
  dailyLimit: number | null;
  limitLabel: string;
};

const QUALITY: Record<string, string> = {
  GREEN: 'High',
  HIGH: 'High',
  YELLOW: 'Medium',
  MEDIUM: 'Medium',
  RED: 'Low',
  LOW: 'Low',
};

const TIERS: Record<string, { n: number | null; label: string }> = {
  TIER_50: { n: 50, label: '50 a day' },
  TIER_250: { n: 250, label: '250 a day' },
  TIER_1K: { n: 1000, label: '1,000 a day' },
  TIER_10K: { n: 10_000, label: '10,000 a day' },
  TIER_100K: { n: 100_000, label: '100,000 a day' },
  TIER_UNLIMITED: { n: null, label: 'Unlimited' },
};

async function fetchNumber(): Promise<NumberHealth | { error: string }> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId) return { error: 'WhatsApp is not configured.' };

  const res = await graph<{
    verified_name?: string;
    display_phone_number?: string;
    quality_rating?: string;
    code_verification_status?: string;
    messaging_limit_tier?: string;
  }>(
    `${phoneId}?fields=verified_name,display_phone_number,quality_rating,` +
      `code_verification_status,messaging_limit_tier`,
    token,
  );
  if ('error' in res) return res;

  const tier = TIERS[(res.messaging_limit_tier ?? '').toUpperCase()];

  return {
    name: res.verified_name || process.env.CLUB_NAME || 'The club',
    number: res.display_phone_number ?? '',
    verified: (res.code_verification_status ?? '').toUpperCase() === 'VERIFIED',
    quality: QUALITY[(res.quality_rating ?? '').toUpperCase()] ?? 'Not rated yet',
    dailyLimit: tier?.n ?? null,
    limitLabel: tier?.label ?? 'Not published by Meta',
  };
}

export function numberHealth(): Promise<NumberHealth | { error: string }> {
  return memo('number', fetchNumber);
}
