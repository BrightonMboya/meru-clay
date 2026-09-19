# Meru Clay

Site and club office for **Meru Clay** — Tanzania's first true clay tennis club, at
the foot of Mount Meru in Arusha. Built from the Paper design file.

## Stack

- **[Next.js](https://nextjs.org)** (App Router) — static landing page, server-rendered booking, route handlers for the API
- **[Tailwind CSS v4](https://tailwindcss.com)** — styling, via `@tailwindcss/postcss`
- **Fonts** — [Fraunces](https://fonts.google.com/specimen/Fraunces) (display) + [Archivo](https://fonts.google.com/specimen/Archivo) (sans) + [Inter](https://fonts.google.com/specimen/Inter) (club office), self-hosted by `next/font`
- **Database** — ⚠️ **none yet.** Bookings are held in memory; Supabase is next. See [Storage](#storage).
- **Notifications** — WhatsApp Cloud API (coach) + [Resend](https://resend.com) (club and player), both over plain HTTP

> **Ported from Astro + Cloudflare.** The site ran on Astro with a Cloudflare
> Workers adapter and a D1 database. It moved to Next.js for the app and API
> surface the club office needs, and off Cloudflare entirely — nothing here is
> host-specific any more, so it deploys to any Node host.

## Develop

```bash
npm install
cp .env.example .env.local   # optional; notifications are skipped when unset
npm run dev                  # http://localhost:3000
```

```bash
npm run build                # production build
npm start                    # serve it
npm run check                # tsc --noEmit
```

## Routes

### The site

| Route               | Rendering | What it is                                     |
| ------------------- | --------- | ---------------------------------------------- |
| `/`                 | static    | The landing page                               |
| `/book`             | dynamic   | Court booking — the date strip starts at today |
| `/api/availability` | dynamic   | `GET` free slots for a date + duration         |
| `/api/bookings`     | dynamic   | `POST` claim a slot                            |

### The club office

All static, all `noindex`, all inside the shell in `app/admin/layout.tsx`.

| Route                           | What it is                                |
| ------------------------------- | ----------------------------------------- |
| `/admin`                        | Court desk — both courts' day to scale    |
| `/admin/players`                | The roster, by level and ladder position  |
| `/admin/players/new`            | Add a member or a coach                   |
| `/admin/matches`                | Challenges, and the fixtures on the books |
| `/admin/matches/new`            | Record a result                           |
| `/admin/tournaments`            | What we host, the draw, and away trips    |
| `/admin/leads`                  | The enquiry pipeline and what ads work    |
| `/admin/leads/new`              | Add a lead that arrived off-platform      |
| `/admin/whatsapp/templates`     | Approved wording, and what sending costs  |
| `/admin/whatsapp/templates/new` | Write a template for Meta to approve      |
| `/admin/whatsapp/broadcasts`    | One template to a list of people          |
| `/admin/whatsapp/automations`   | Messages that send themselves             |
| `/admin/whatsapp/agent`         | The booking agent in members' group chats |
| `/admin/whatsapp/number`        | Number health and everyone opted out      |
| `/admin/takings`                | ⚠️ not designed yet — a placeholder       |

## Structure

```
src/
  app/
    layout.tsx              # fonts, metadata, JSON-LD
    page.tsx                # assembles the landing page
    book/page.tsx           # booking page
    admin/
      layout.tsx            # the club office shell (sidebar + main)
      page.tsx              # court desk
      players/ · matches/ · tournaments/ · leads/ · takings/
      whatsapp/
        (tabs)/             # the five tabbed views share a head — see below
        templates/new/      # …and the one form screen sits outside it
    api/
      availability/route.ts # GET  free slots
      bookings/route.ts     # POST claim a slot
    sitemap.ts · robots.ts
    globals.css             # Tailwind import + brand theme tokens
  components/
    marketing/              # Hero · About · Courts · Pricing · Team · Visit · Cta · Footer
    booking/BookingWidget.tsx   # the booking UI (client)
    admin/
      ui.tsx                # the office's small parts — every screen builds from these
      Sidebar.tsx · DayTimeline.tsx · Rail.tsx · WhatsAppHeader.tsx
  lib/
    time.ts                 # minutes-from-midnight helpers, UTC+3, no DST
    schedule.ts             # the weekly class grid — single source of truth
    availability.ts         # occupancy + freeSlots
    bookings.ts             # storage for bookings  ⚠️ in memory
    notify.ts               # WhatsApp + email, best-effort
    players.ts              # storage for the roster
    roster.ts               # levels, roles, availability — shared by schema and UI
    admin/                  # one module per screen's data
      desk.ts · players.ts  #   …these two are real, from the database
      matches.ts · tournaments.ts · leads.ts · whatsapp.ts   # ⚠️ still DEMO
migrations/                 # SQL schema, kept for the Supabase port
public/images/              # hero, court, and CTA photography
```

The brand palette and type scale live as `@theme` tokens in `src/app/globals.css`
(`pine`, `clay`, `clay-light`, `clay-wash`, `cream`, `mist`, plus the
`display`/`sans`/`ui` font families).

### Two visual worlds

The marketing site is cream and Fraunces. The club office at `/admin` is white
and Inter, and its greys are Tailwind's `neutral` scale. That is deliberate —
it is a tool the coach uses on a Monday morning, not a brochure — and it is why
admin components use `neutral-*` and `font-ui` rather than the `cream`/`stone`
brand tokens.

## Court booking

Two courts, bookable 06:00–21:00 in 30-minute steps, for 60 or 90 minutes, up
to 14 days ahead.

### How availability works

There is no scheduling engine. The club is in one timezone (Africa/Dar_es_Salaam,
UTC+3, no DST), so a slot is a date string plus an integer number of minutes from
local midnight, and comparing slots is comparing integers.

Two courts x 15 hours x 30-minute steps is 60 cells a day — small enough to
enumerate and subtract what is taken. `occupancy()` flattens scheduled classes,
live bookings and closures into one list of intervals; `freeSlots()` walks the
grid and drops anything that overlaps. That is the whole engine.

The weekly class grid lives in `src/lib/schedule.ts` and is read by **all** of
the published table on the landing page, the availability engine, and the court
desk timeline — so the site can never sell a court that is in the middle of a
clinic, and the desk can never disagree with either.

### How double-booking is prevented

Availability is advisory — it is what gets rendered, from a snapshot that is
stale the moment it is sent. Correctness comes from the write: `createBooking()`
refuses a slot that a live booking already _overlaps_, so two players racing for
the last 18:00 slot produce exactly one `201` and one `409`.

Holds expire lazily: an unpaid hold older than 10 minutes stops counting toward
availability. No cron job is involved, and availability stays correct even when
a scheduled job fails to run.

### Storage

⚠️ `src/lib/bookings.ts` keeps bookings in a module-level `Map`. They survive
one server process and no longer. `/book` works end-to-end against it, which is
what it is for.

The Supabase port replaces the five functions in that file and nothing else —
the routes and the availability engine never see the storage. Two things have to
come across with it:

1. **The schema.** `migrations/0001_init.sql` and `0002_coach.sql` still
   describe the tables (`bookings`, `blocks`, `courts`). They are SQLite, but
   the shape ports directly.
2. **The double-booking guard**, which is the subtle part. Node is
   single-threaded, so the check-then-insert in `createBooking` is atomic for
   free. On Postgres it is not. Add

   ```sql
   CREATE UNIQUE INDEX uniq_live_slot ON bookings (court_id, date, start_min)
     WHERE status IN ('held', 'confirmed');
   ```

   and keep the overlap check in the same statement or transaction — the index
   alone only catches identical start times, and a 90-minute booking at 17:00
   also has to lose to a 60-minute one already sitting at 17:30.

## Club office (`/admin`)

Fourteen screens behind one shell, all built from the Paper file. `noindex`,
and excluded from the sitemap.

### What is real and what is not

⚠️ **Every screen under `/admin` renders from demo data.** Each one has a
module in `src/lib/admin/` holding the sample content the design was drawn
with, marked `⚠️ DEMO` at the top. Nothing is wired to anything: the buttons
are styled, not connected, and the forms are real inputs with no submit behind
them. That is deliberate — the shapes are settled, so when Supabase lands the
work is replacing six data modules, not rebuilding fourteen screens.

The court desk is the exception, and only partly. Its classes and watering are
_derived_ — read straight out of `src/lib/schedule.ts`, the same file the
booking engine reads, so the desk cannot disagree with what `/book` will sell.
Only the player bookings on it are demo data.

### Shared parts

`src/components/admin/ui.tsx` holds the office's small parts — the pill, the
chip, the state badge, the level swatch, the hairline table, the numbered form
step. Thirteen screens describing a pill each is thirteen chances to disagree
about its radius, so they describe it once.

Two rules from the design are worth keeping when adding a screen:

- **Fixed-width lanes in repeated rows.** Table columns and list rows use
  fixed px slots — rendered even when empty — so cells land in the same
  vertical lanes whatever they contain. `Col`/`Cell` in `ui.tsx` enforce this.
- **One clay thing per screen.** The `primary` button, the accented reading,
  the clay-washed card: colour marks the thing that needs acting on, and stops
  meaning that the moment there are two of them.

### The WhatsApp section

`/admin/whatsapp` is a route group: the five tabbed views share a head and a
sub-nav from `(tabs)/layout.tsx`, while the one screen that is a form —
writing a template — sits outside the group with its own head, as the design
draws it. `WhatsAppHeader.tsx` is a client component because the head varies
by tab (the court agent gets its own sentence and its own action).

These screens encode two of Meta's rules, and the code that actually sends —
`src/lib/notify.ts` — implements both:

- **The 24-hour window.** Freeform text may only be sent within 24 hours of
  the customer's last message. Every lead card carries either "reply free ·
  23h left" or "overdue · template needed" for exactly this reason, and the
  composer on an expired conversation is locked with the reason given.
- **Categories.** A _utility_ template answers something the customer asked
  for and is free; a _marketing_ template is anything they did not ask for and
  costs TSh 11. Miscategorising is how accounts get restricted, so the screens
  label it everywhere and the cost strip on the Templates tab spells it out.

## Notifying the coach — WhatsApp

Notifications are optional and silently skipped when unset. Copy `.env.example`
to `.env.local` for local runs, and set the same keys in the host's environment
for production. They are sent from `after()`, so they never delay the response
to the player.

WhatsApp does not allow a business to send arbitrary text to someone
unprompted. Two modes, both supported by `src/lib/notify.ts`:

- **Freeform** — plain text, but only within 24 hours of the coach last
  messaging the business number. Used when `WHATSAPP_TEMPLATE` is unset.
  Fine for testing; unusable in production, because bookings arrive at 06:00.
- **Template** — works at any hour, but the wording must be approved by Meta
  first. Submit a template with four body parameters:

  > New booking at Meru Clay.
  > {{1}} · {{2}}
  > {{3}}
  > {{4}}

  then set `WHATSAPP_TEMPLATE` to its name. Parameters are, in order: when,
  court, player name and phone, and coach/reference.

Mail goes through Resend. The shared `onboarding@resend.dev` sender needs no
domain of our own, at the cost of only delivering to the address that owns the
Resend account — which is why that address is `BOOKING_TO_EMAIL`. Verify a
domain with Resend to lift that, and point `BOOKING_FROM_EMAIL` at it.

## Not built yet

- **A database.** See [Storage](#storage). Everything else waits on this —
  every club-office screen is rendering sample content until it exists.
- **Takings.** The sidebar links to it because the design's sidebar does, but
  there is no artboard for it. `/admin/takings/page.tsx` is a placeholder
  saying so; delete the file when the screen is designed.
- Payment. Bookings are held, then confirmed manually. Wiring AzamPay or
  ClickPesa means calling `confirmBooking()` from a webhook.
- Group-class seat booking. Classes currently only _block_ courts; nobody can
  book a seat in one. That needs a `class_instances` table and a capacity count.
- Punch cards. The 12/24/40 tiers on the pricing section are a credits system
  and will need a `punch_cards` table that bookings decrement.
- Reminders — a scheduled job once there is somewhere to read bookings from.
