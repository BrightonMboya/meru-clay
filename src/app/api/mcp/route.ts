/**
 * POST /api/mcp — the club office, as an MCP server.
 *
 * Streamable HTTP in its stateless form: one JSON-RPC message in, one out.
 * The transport and the reason it is hand-rolled rather than taken from the
 * SDK are in src/mcp/serve.ts; the tools are in src/mcp/tools; this file is
 * the door and the envelope.
 *
 * ⚠️ This endpoint is deliberately OUTSIDE src/proxy.ts's matcher, and that
 * is not an oversight. The proxy turns away anybody without an operator
 * session, and the whole point of MCP_TOKEN is to let a client that has no
 * session in — a terminal, a laptop's Claude Code, a script. So the lock
 * here is `authorise`, called first in the handler, and it is the only lock.
 * Nothing below it runs until it has answered.
 *
 * Connect a client with, for example:
 *
 *   claude mcp add --transport http meru-clay http://localhost:3000/api/mcp \
 *     --header "authorization: Bearer $MCP_TOKEN"
 */

import { authorise } from '@/mcp/auth';
import { answer } from '@/mcp/serve';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const caller = await authorise(request);
  if (!caller.ok) {
    return json(
      { jsonrpc: '2.0', id: null, error: { code: -32001, message: caller.error } },
      401,
      { 'www-authenticate': 'Bearer realm="Meru Clay MCP"' },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(
      {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error — the body must be JSON.' },
      },
      400,
    );
  }

  let reply: unknown | null;
  try {
    reply = await answer(body);
  } catch (err) {
    // A tool that refuses reports itself through its own result; reaching
    // here means something broke. Log it where the club can find it and say
    // so plainly rather than returning a half-formed result.
    console.error('mcp request failed:', err);
    return json(
      { jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Internal error.' } },
      500,
    );
  }

  // A notification has no reply. 202 is what the Streamable HTTP spec asks
  // for, and an empty 200 would look to a client like a malformed answer.
  if (reply === null) return new Response(null, { status: 202 });

  return wantsEventStream(request) ? eventStream(reply) : json(reply, 200);
}

/**
 * GET and DELETE exist only to be refused, in as many words.
 *
 * GET would open the stream that carries server-initiated messages, and
 * DELETE would end a session. A stateless server has neither — see the note
 * at the top of src/mcp/serve.ts — and a client that is told 405 falls back
 * to POST-only, where a silence would leave it waiting.
 */
export async function GET() {
  return json(
    {
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32601,
        message: 'This server is stateless: it has no event stream to open. POST JSON-RPC to this URL.',
      },
    },
    405,
    { allow: 'POST' },
  );
}

export async function DELETE() {
  return json(
    {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32601, message: 'This server keeps no sessions, so there is none to end.' },
    },
    405,
    { allow: 'POST' },
  );
}

/**
 * Which content type to answer in.
 *
 * The spec has a client send `Accept: application/json, text/event-stream`
 * and lets the server pick. JSON is picked whenever it is on offer: it is
 * one message, there is nothing to stream, and every client that speaks
 * Streamable HTTP reads it. The stream is for the client that asked for
 * nothing else.
 */
function wantsEventStream(request: Request): boolean {
  const accept = request.headers.get('accept')?.toLowerCase() ?? '';
  if (!accept.includes('text/event-stream')) return false;
  return !accept.includes('application/json') && !accept.includes('*/*');
}

/** One message as a single SSE event, then end of stream. */
function eventStream(reply: unknown): Response {
  return new Response(`event: message\ndata: ${JSON.stringify(reply)}\n\n`, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      connection: 'keep-alive',
    },
  });
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  });
}
