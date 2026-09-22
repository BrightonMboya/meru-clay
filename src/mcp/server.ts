/**
 * The club, as an MCP server.
 *
 * One server instance is built per request — see the note in ./serve.ts —
 * so this file is a list of registrations and nothing more. All of the
 * thinking is in ./tools, and all of the club's actual rules are one layer
 * further down in src/lib, where the screens read them too. Nothing here
 * knows a column name.
 *
 * `instructions` is the part worth writing carefully. It is handed to the
 * client on initialize and is the only chance to say the things no tool
 * signature can: that the club's clock is not the caller's, that three of
 * these tools reach a real person's phone or a real ledger, and that
 * `club_context` answers most of the questions a first guess would get
 * wrong. A model that reads it should not need to be corrected twice.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerClassTools } from './tools/classes';
import { registerContextTools } from './tools/context';
import { registerCourtTools } from './tools/courts';
import { registerLeadTools } from './tools/leads';
import { registerMoneyTools } from './tools/money';
import { registerRosterTools } from './tools/roster';

/** Kept in step with package.json by hand; nothing reads it but the client's log. */
const VERSION = '1.0.0';

const INSTRUCTIONS = `
Meru Clay is a two-court clay tennis club in Arusha, Tanzania. These tools are
the club office: the leads pipeline, the court diary, the roster, the class
register and the money.

Call club_context first. It gives you today's date at the club — the club runs
on Africa/Dar_es_Salaam (UTC+3, no daylight saving) and that is the only
"today" these tools mean — along with the courts and their hours, prices, and
the exact spellings every other tool accepts for a stage, a level or a tier.

Times are always "HH:MM" on the 24-hour clock. Dates are always "YYYY-MM-DD".
Bookings start on a 30-minute grid. The two courts do not keep the same hours:
Court A is floodlit and plays until close, Court B is dark from dusk.

Three tools do something the club cannot take back, and none of them should be
called on a guess:

  send_lead_message    puts a WhatsApp message on a real person's phone.
                       WhatsApp only permits a freeform message within 24
                       hours of that person's own last message; outside it,
                       an approved template is the only thing that will send.
                       get_lead tells you which applies.
  send_payment_link    opens a payment and messages the link. Pass send:false
                       to get the URL without messaging anybody.
  take_membership_payment  records money as received.

When you are asked how many people came, read attendance_report carefully. The
club records attendance three separate ways — the desk's register, court
bookings, and class places — they overlap, and adding them up gives a
confident wrong answer. Say which register a figure came from.

Refusals are normal and are the club's rules talking, not a broken tool. They
carry the reason and usually the thing to try instead.
`.trim();

export function buildServer(): McpServer {
  const server = new McpServer(
    { name: 'meru-clay', version: VERSION, title: 'Meru Clay club office' },
    { capabilities: { tools: {} }, instructions: INSTRUCTIONS },
  );

  registerContextTools(server);
  registerLeadTools(server);
  registerCourtTools(server);
  registerRosterTools(server);
  registerClassTools(server);
  registerMoneyTools(server);

  return server;
}
