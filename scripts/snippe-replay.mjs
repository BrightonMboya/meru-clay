/**
 * Fire a webhook at the club's endpoint, signed the way Snippe signs.
 *
 * The stub in scripts/snippe-stub.mjs covers the happy path and the ordinary
 * failures, because it drives the whole flow from a real charge. This one
 * exists for the cases the stub cannot produce: the ones where the delivery
 * itself is wrong.
 *
 * A payment endpoint that can confirm courts and clear debts has to refuse
 * an unsigned body, a forged signature, a replayed delivery from last week,
 * and a delivery about a payment that is not ours — and "we are fairly sure
 * it refuses" is not the same as having watched it refuse. Each of those is
 * one flag here.
 *
 *   node scripts/snippe-replay.mjs --tx-ref mc_<uuid>_1 --reference <snippe-ref>
 *   node scripts/snippe-replay.mjs --tx-ref ... --unsigned        → expect 401
 *   node scripts/snippe-replay.mjs --tx-ref ... --forge           → expect 401
 *   node scripts/snippe-replay.mjs --tx-ref ... --stale 3600      → expect 401
 *   node scripts/snippe-replay.mjs --tx-ref mc_00000000-0000-0000-0000-000000000000_1
 *                                                                 → expect 200, unmatched
 *
 * A correctly signed delivery gets a 200 and then the route goes and asks
 * the provider about it — so against the stub, use a `--reference` the stub
 * is actually holding (`curl localhost:4242/_stub`), or the verify step will
 * quite rightly decline to settle anything.
 */

import { createHmac, randomUUID } from 'node:crypto';

const args = parse(process.argv.slice(2));

const url = args.url ?? 'http://localhost:3000/api/payments/webhook';
const secret = args.secret ?? process.env.SNIPPE_WEBHOOK_SECRET ?? 'whsec_dev';
const type = args.type ?? 'payment.completed';
const reference = args.reference ?? randomUUID();
const amount = Number(args.amount ?? 30000);
const txRef = args['tx-ref'] ?? null;

const event = {
  id: args['event-id'] ?? `evt_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
  type,
  api_version: '2026-01-25',
  created_at: new Date().toISOString(),
  data: {
    reference,
    external_reference: `S${Math.floor(Math.random() * 1e11)}`,
    status: type.split('.')[1],
    amount: { value: amount, currency: args.currency ?? 'TZS' },
    channel: { type: 'mobile_money', provider: 'mpesa' },
    customer: { phone: '+255712345678' },
    metadata: txRef ? { tx_ref: txRef } : {},
    completed_at: new Date().toISOString(),
  },
};

const raw = JSON.stringify(event);

// Backdated on demand, to prove the five-minute replay window is real.
const timestamp = String(Math.floor(Date.now() / 1000) - Number(args.stale ?? 0));

const headers = {
  'content-type': 'application/json',
  'user-agent': 'Snippe-Webhook/1.0',
  'x-webhook-event': type,
};

if (!args.unsigned) {
  headers['x-webhook-timestamp'] = timestamp;
  headers['x-webhook-signature'] = args.forge
    ? createHmac('sha256', 'not-the-signing-key').update(`${timestamp}.${raw}`, 'utf8').digest('hex')
    : createHmac('sha256', secret).update(`${timestamp}.${raw}`, 'utf8').digest('hex');
}

console.log(`→ POST ${url}`);
console.log(`  ${type}  reference=${reference}  tx_ref=${txRef ?? '—'}  amount=${amount}`);
console.log(
  `  signature: ${args.unsigned ? 'NONE' : args.forge ? 'FORGED' : 'valid'}` +
    (args.stale ? `, backdated ${args.stale}s` : ''),
);

const res = await fetch(url, { method: 'POST', headers, body: raw });
const text = await res.text();

console.log(`← ${res.status} ${res.statusText}  ${text.slice(0, 200)}`);

// 401 is the right answer to a bad delivery, so the exit code follows
// intent rather than status: this is meant to be runnable in a checklist.
const expectedRefusal = Boolean(args.unsigned || args.forge || Number(args.stale ?? 0) > 300);
const passed = expectedRefusal ? res.status === 401 : res.ok;
console.log(passed ? '✓ as expected' : `✗ expected ${expectedRefusal ? 401 : '2xx'}`);
process.exit(passed ? 0 : 1);

function parse(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}
