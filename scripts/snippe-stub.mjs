/**
 * A pretend Snippe, for testing the club's payment code without money.
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 * Snippe has no sandbox. Their own documentation says so outright: "There is
 * no sandbox environment. Use a small live amount (minimum 500 TZS) to
 * verify the end-to-end flow on a staging site, then enable on production."
 *
 * That is fine for one confirmation run and hopeless as a way to work. Every
 * branch worth testing — a declined push, a short payment, a webhook that
 * never arrives, a court resold while somebody was paying, the cron sweep
 * catching what the webhook missed — would need either real money or a
 * cooperative stranger with a handset. So this speaks Snippe's protocol back
 * at us instead.
 *
 * The important property: NOTHING in src/ knows this exists. The only thing
 * that changes is `SNIPPE_API_URL`. The adapter, the webhook route, the
 * settlement rules, the signature check and the sweep are all the same code
 * that will face api.snippe.sh, which is the whole point — a test that runs
 * different code from production proves nothing about production.
 *
 * ── Running it ───────────────────────────────────────────────────────────
 *   SNIPPE_WEBHOOK_SECRET=whsec_dev node scripts/snippe-stub.mjs
 *
 * and in the app's environment:
 *   SNIPPE_API_URL=http://localhost:4242
 *   SNIPPE_API_KEY=snp_dev_anything
 *   SNIPPE_WEBHOOK_SECRET=whsec_dev        <- must match the stub's
 *   NEXT_PUBLIC_SITE_URL=http://localhost:3000
 *
 * Then open a payment link, pay with any Tanzanian-shaped number, and drive
 * the outcome from the stub:
 *
 *   curl -X POST localhost:4242/_stub/last/complete   # the money arrives
 *   curl -X POST localhost:4242/_stub/last/fail       # declined
 *   curl localhost:4242/_stub                         # what it is holding
 *
 * `last` is a convenience alias for the most recent transaction; a specific
 * reference works in its place. AUTO_COMPLETE_MS=3000 completes every charge
 * by itself after three seconds, which is the closest thing to a happy path
 * on a real handset.
 *
 * ── What it deliberately does faithfully ─────────────────────────────────
 * The response envelopes (`{status, code, data}`), the amount asymmetry
 * (a plain integer on the way in, `{value, currency}` on the way back),
 * the 500 TZS floor, the `Idempotency-Key` cache and its 30-character cap,
 * and the webhook signature — HMAC-SHA256 over `{timestamp}.{body}`, hex,
 * in `X-Webhook-Signature`. Each of those has a matching branch in
 * src/lib/snippe.ts, and a stub that got them wrong would quietly bless a
 * broken integration.
 */

import { createHmac, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT || 4242);
const SECRET = process.env.SNIPPE_WEBHOOK_SECRET || 'whsec_dev';
const AUTO_MS = Number(process.env.AUTO_COMPLETE_MS || 0);
const MIN_CHARGE = 500;

/** reference -> transaction. In memory; restarting forgets everything. */
const txs = new Map();
/** Idempotency-Key -> reference, as Snippe caches for 24 hours. */
const idempotency = new Map();
let last = null;

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  const body = await readBody(req);

  log(`${req.method} ${path}`);

  /* ---------------------------------------------------- the real API */

  if (req.method === 'POST' && path === '/v1/payments') {
    return createPayment(req, res, body);
  }

  const get = /^\/v1\/payments\/([^/]+)$/.exec(path);
  if (req.method === 'GET' && get) {
    if (!authorised(req)) return send(res, 401, unauthorised());
    const tx = txs.get(decodeURIComponent(get[1]));
    if (!tx) return send(res, 404, { status: 'error', code: 404, error_code: 'not_found', message: 'payment not found' });
    return send(res, 200, { status: 'success', code: 200, data: view(tx) });
  }

  /* ------------------------------------------- the control surface */

  if (req.method === 'GET' && path === '/_stub') {
    return send(res, 200, { count: txs.size, last, transactions: [...txs.values()].map(view) });
  }

  const control = /^\/_stub\/([^/]+)\/(complete|fail|void|expire|short)$/.exec(path);
  if (req.method === 'POST' && control) {
    const reference = control[1] === 'last' ? last : decodeURIComponent(control[1]);
    const tx = reference ? txs.get(reference) : null;
    if (!tx) return send(res, 404, { error: 'no such transaction' });

    if (control[2] === 'short') {
      // Pay less than was asked. `settle` must refuse to fulfil this and
      // put it in front of a person instead.
      tx.amount = Math.max(MIN_CHARGE, Math.floor(tx.amount / 2));
      tx.status = 'completed';
    } else {
      tx.status = control[2] === 'complete' ? 'completed' : control[2] === 'fail' ? 'failed' : control[2] === 'void' ? 'voided' : 'expired';
    }
    tx.completedAt = new Date().toISOString();

    const delivery = await deliver(tx);
    return send(res, 200, { reference: tx.reference, status: tx.status, webhook: delivery });
  }

  send(res, 404, { error: 'not a Snippe endpoint' });
});

/* ------------------------------------------------------------ charging */

function createPayment(req, res, body) {
  if (!authorised(req)) return send(res, 401, unauthorised());

  let input;
  try {
    input = JSON.parse(body || '{}');
  } catch {
    return send(res, 400, validation('invalid JSON'));
  }

  // Snippe answers a key longer than 30 characters with 500 PAY_001, which
  // is a genuinely surprising failure and worth reproducing exactly.
  const key = req.headers['idempotency-key'];
  if (typeof key === 'string' && key.length > 30) {
    return send(res, 500, { status: 'error', code: 500, error_code: 'PAY_001', message: 'idempotency key too long' });
  }
  if (typeof key === 'string' && idempotency.has(key)) {
    const cached = txs.get(idempotency.get(key));
    log(`  ↳ idempotent replay of ${cached.reference}`);
    return send(res, 201, { status: 'success', code: 201, data: view(cached) });
  }

  const amount = input?.details?.amount;
  const currency = input?.details?.currency;

  if (input?.payment_type !== 'mobile') return send(res, 400, validation('payment_type must be mobile'));
  if (typeof amount !== 'number') return send(res, 400, validation('amount is required'));
  if (amount < MIN_CHARGE) return send(res, 400, validation(`amount must be at least ${MIN_CHARGE}`));
  if (currency !== 'TZS') return send(res, 400, validation('only TZS is supported'));
  if (!/^255[67]\d{8}$/.test(String(input?.phone_number ?? ''))) {
    return send(res, 400, validation('phone_number must be 255XXXXXXXXX'));
  }
  if (!input?.customer?.firstname || !input?.customer?.lastname || !input?.customer?.email) {
    return send(res, 400, validation('customer firstname, lastname and email are required'));
  }

  const tx = {
    reference: randomUUID(),
    status: 'pending',
    amount,
    currency,
    phone: input.phone_number,
    metadata: input.metadata ?? {},
    webhookUrl: input.webhook_url ?? null,
    createdAt: new Date().toISOString(),
    completedAt: null,
    expiresAt: new Date(Date.now() + 4 * 60 * 60_000).toISOString(),
  };

  txs.set(tx.reference, tx);
  last = tx.reference;
  if (typeof key === 'string') idempotency.set(key, tx.reference);

  log(`  ↳ ${tx.reference} pending ${amount} ${currency} to ${tx.phone} (tx_ref ${tx.metadata.tx_ref ?? '—'})`);

  if (AUTO_MS > 0) {
    setTimeout(async () => {
      if (txs.get(tx.reference)?.status !== 'pending') return;
      tx.status = 'completed';
      tx.completedAt = new Date().toISOString();
      log(`  ↳ ${tx.reference} auto-completed after ${AUTO_MS}ms`);
      await deliver(tx);
    }, AUTO_MS).unref();
  }

  send(res, 201, { status: 'success', code: 201, data: view(tx) });
}

/* ------------------------------------------------------------ webhooks */

/**
 * Post a signed event, the way Snippe does.
 *
 * Signature is HMAC-SHA256 over `{timestamp}.{raw body}`, hex-encoded. The
 * body is serialised once and both signed and sent — signing a
 * re-serialisation is the single most common way to get this wrong, and it
 * would make the stub disagree with a verifier that is actually correct.
 */
async function deliver(tx) {
  if (!tx.webhookUrl) {
    log('  ↳ no webhook_url on this transaction; nothing delivered');
    return { skipped: 'no webhook_url' };
  }

  const event = {
    id: `evt_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
    type: `payment.${tx.status}`,
    api_version: '2026-01-25',
    created_at: new Date().toISOString(),
    data: {
      reference: tx.reference,
      external_reference: `S${Math.floor(Math.random() * 1e11)}`,
      status: tx.status,
      amount: { value: tx.amount, currency: tx.currency },
      settlement: {
        gross: { value: tx.amount, currency: tx.currency },
        fees: { value: Math.round(tx.amount * 0.018), currency: tx.currency },
        net: { value: tx.amount - Math.round(tx.amount * 0.018), currency: tx.currency },
      },
      channel: { type: 'mobile_money', provider: 'mpesa' },
      customer: { phone: `+${tx.phone}` },
      metadata: tx.metadata,
      completed_at: tx.completedAt,
    },
  };

  const raw = JSON.stringify(event);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', SECRET).update(`${timestamp}.${raw}`, 'utf8').digest('hex');

  try {
    const res = await fetch(tx.webhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Snippe-Webhook/1.0',
        'x-webhook-event': event.type,
        'x-webhook-timestamp': timestamp,
        'x-webhook-signature': signature,
      },
      body: raw,
    });
    log(`  ↳ delivered ${event.type} to ${tx.webhookUrl} → ${res.status}`);
    return { status: res.status, event: event.type, id: event.id };
  } catch (err) {
    log(`  ↳ delivery to ${tx.webhookUrl} failed: ${err.message}`);
    return { error: err.message };
  }
}

/* ------------------------------------------------------------- helpers */

/** Snippe's payment object, in their shape — note `amount` is an object. */
function view(tx) {
  return {
    object: 'payment',
    api_version: '2026-01-25',
    reference: tx.reference,
    status: tx.status,
    payment_type: 'mobile',
    amount: { value: tx.amount, currency: tx.currency },
    channel: { type: 'mobile_money', provider: 'mpesa' },
    metadata: tx.metadata,
    created_at: tx.createdAt,
    completed_at: tx.completedAt,
    expires_at: tx.expiresAt,
  };
}

function authorised(req) {
  const header = req.headers.authorization ?? '';
  // Only that a key was sent, not which — the stub has no account. This
  // still exercises the branch where the app forgets to send one.
  return /^Bearer\s+\S+/i.test(header);
}

const unauthorised = () => ({ status: 'error', code: 401, error_code: 'unauthorized', message: 'invalid or missing API key' });
const validation = (message) => ({ status: 'error', code: 400, error_code: 'validation_error', message });

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
  });
}

function send(res, status, body) {
  const raw = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(raw) });
  res.end(raw);
}

function log(line) {
  console.log(`[snippe-stub] ${line}`);
}

server.listen(PORT, () => {
  log(`listening on http://localhost:${PORT}`);
  log(`signing webhooks with ${SECRET.slice(0, 10)}… — the app must share this secret`);
  if (AUTO_MS > 0) log(`auto-completing every charge after ${AUTO_MS}ms`);
  log('point the app at it with SNIPPE_API_URL=http://localhost:' + PORT);
});
