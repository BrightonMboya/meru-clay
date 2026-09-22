/**
 * MCP over one HTTP request.
 *
 * The SDK ships a Streamable HTTP transport, and it is built on Node's
 * `http.IncomingMessage` and `ServerResponse`. A Next Route Handler is
 * handed a Web `Request` and must return a Web `Response`, so that
 * transport cannot be used here without an adapter. Rather than take a
 * dependency on one, this is the whole of the other side of the contract:
 * a POST carrying one JSON-RPC message, answered by one JSON-RPC message.
 *
 * ── Why stateless ──────────────────────────────────────────────────────
 * Every request builds its own server and its own transport, and throws
 * both away. That is what the Streamable HTTP spec calls stateless mode and
 * it is the right shape for this app: the club's state is in Postgres, not
 * in the connection, so there is nothing for a session to hold. It also
 * means the endpoint works unchanged on a serverless deployment, where the
 * next request may not reach the same process at all.
 *
 * The cost is that nothing can be pushed from the server — no progress
 * notifications, no resource subscriptions. Nothing in ./tools wants to, so
 * the GET that would carry them is refused rather than left open and idle.
 *
 * The SDK tolerates this: on the server side, only outgoing requests
 * (sampling, roots, elicitation) are gated on having seen `initialize`, and
 * this server makes none. So a `tools/list` arriving at a freshly built
 * server is answered correctly even though that instance never saw the
 * handshake.
 */

import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  isJSONRPCNotification,
  isJSONRPCRequest,
  JSONRPCMessageSchema,
  type JSONRPCMessage,
  type RequestId,
} from '@modelcontextprotocol/sdk/types.js';

import { buildServer } from './server';

/**
 * A transport that carries exactly one exchange.
 *
 * `answer` resolves with the reply to the id it was constructed for, and
 * with null for a notification, which by definition has no reply. Anything
 * else the server sends — a progress notification against the request in
 * flight — is dropped, because there is no stream to put it on and a JSON
 * body may hold one message.
 */
class OneExchange implements Transport {
  readonly answer: Promise<JSONRPCMessage | null>;

  private settle!: (message: JSONRPCMessage | null) => void;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(private readonly awaiting: RequestId | undefined) {
    this.answer = new Promise((resolve) => {
      this.settle = resolve;
    });
    if (awaiting === undefined) this.settle(null);
  }

  async start() {}

  async send(message: JSONRPCMessage) {
    if ('id' in message && message.id === this.awaiting) this.settle(message);
  }

  async close() {
    this.onclose?.();
  }
}

/**
 * Answer one JSON-RPC message, or a batch of them.
 *
 * Batches are handled because older clients send them; the 2025-06-18
 * revision of the spec dropped them, so this is compatibility rather than
 * something to build on. Each message in a batch gets its own server, which
 * is wasteful and also correct — they are independent, and a stateless
 * server has nothing to share between them.
 *
 * Returns null when there is nothing to say, which is the honest answer to
 * a notification and is what the caller turns into a 202.
 */
export async function answer(body: unknown): Promise<unknown | null> {
  if (Array.isArray(body)) {
    const replies = (await Promise.all(body.map((one) => answerOne(one)))).filter(
      (reply) => reply !== null,
    );
    return replies.length > 0 ? replies : null;
  }
  return answerOne(body);
}

/**
 * The shape check that has to happen here rather than inside the SDK.
 *
 * `Protocol` dispatches on whether a message is a request, a notification or
 * a response, and quietly ignores anything that is none of the three. Quietly
 * is fine when a socket stays open; here it would mean a promise that never
 * settles and an HTTP request that never returns. So the two cases the SDK
 * would drop are handled before it sees them:
 *
 *   - malformed: answered with a JSON-RPC error, which is what a client
 *     needs in order to know it sent nonsense.
 *   - a response or an error: accepted and ignored. A stateless server sends
 *     no requests, so it can have no replies, and there is nothing to say.
 */
async function answerOne(message: unknown): Promise<JSONRPCMessage | null> {
  const parsed = JSONRPCMessageSchema.safeParse(message);
  if (!parsed.success) {
    const id = idOf(message);
    return {
      jsonrpc: '2.0',
      id: id ?? 0,
      error: { code: -32600, message: 'Not a JSON-RPC 2.0 request or notification.' },
    } as JSONRPCMessage;
  }

  const rpc = parsed.data;
  if (!isJSONRPCRequest(rpc) && !isJSONRPCNotification(rpc)) return null;

  const transport = new OneExchange(isJSONRPCRequest(rpc) ? rpc.id : undefined);
  const server = buildServer();

  try {
    await server.connect(transport);
    // `connect` installs the handler. An unknown method, or a tool that
    // throws, comes back through here as a JSON-RPC error carrying this id —
    // which is exactly what should be returned to the client.
    transport.onmessage?.(rpc);
    return await transport.answer;
  } finally {
    await server.close();
  }
}

/** The id off a message that failed to parse, so the error can be addressed. */
function idOf(message: unknown): RequestId | null {
  if (typeof message !== 'object' || message === null || !('id' in message)) return null;
  const id = (message as { id: unknown }).id;
  return typeof id === 'string' || typeof id === 'number' ? id : null;
}
