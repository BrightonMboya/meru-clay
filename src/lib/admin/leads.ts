/**
 * Leads — every enquiry from Instagram and Facebook.
 *
 * ⚠️ DEMO DATA. See the note at the top of src/lib/bookings.ts.
 *
 * The one piece of real domain logic embedded in this screen is WhatsApp's
 * 24-hour rule: a business may only send freeform text within 24 hours of the
 * customer's last message. Outside that window it must send a template Meta
 * has approved. That is why every card carries a "reply free · Nh left" or an
 * "overdue · template needed" line, and why the composer at the bottom of the
 * lead detail is locked. See the WhatsApp section of the README, and
 * `src/lib/notify.ts`, which implements both modes.
 */

import type { Reading } from '@/components/admin/ui';

export const FUNNEL_PERIOD = 'THE FUNNEL · 1–30 SEPTEMBER';
export const MEMBER_WORTH = 'a member is worth about TSh 480,000 a year';

/** The funnel, left to right. `accent` marks the step being worked on. */
export const FUNNEL: Reading[] = [
  { label: 'AD SPEND', value: 'TSh 840k', detail: 'Instagram 61% · Facebook 39%' },
  { label: 'LEADS IN', value: '64', detail: 'TSh 13,100 each · 18 this week' },
  { label: 'REPLIED', value: '41', detail: '64% · median reply in 3 hr' },
  { label: 'TRIAL BOOKED', value: '22', detail: '17 turned up · 5 no-shows', accent: true },
  { label: 'JOINED', value: '9', detail: 'TSh 93,300 per member won' },
];

/** The WhatsApp meter above the board — free replies cost nothing, templates do. */
export const MESSAGE_COST = [
  { label: 'Free replies', value: '156 this month' },
  { label: 'Templates sent', value: '90 billable' },
  { label: 'WhatsApp cost', value: 'TSh 990' },
];

/**
 * A card's footer line. `free` is inside the 24-hour window, `overdue` is
 * outside it and needs a template, `money` is a member won, `plain` is a
 * reminder to the coach.
 */
export type FootTone = 'free' | 'overdue' | 'money' | 'plain';

export type Lead = {
  name: string;
  /** How long since the last touch, or when the trial is. */
  age: string;
  /** Their own words where we have them, otherwise what we did. */
  note: string;
  /** Which ad they came from — "IG · JUNIORS 8–12". */
  source: string;
  foot: string;
  tone: FootTone;
  /** Who owns the conversation. */
  owner: string;
};

export type Column = { stage: string; count: number; leads: Lead[] };

export const BOARD: Column[] = [
  {
    stage: 'NEW',
    count: 12,
    leads: [
      {
        name: 'Grace Kimambo',
        age: '14 min',
        note: '“Do you teach complete beginners? I’m 34.”',
        source: 'IG · ADULT BEGINNERS',
        foot: 'Reply free · 23h left',
        tone: 'free',
        owner: 'EK',
      },
      {
        name: 'Ibrahim Swai',
        age: '1 hr',
        note: '“My son is 9. Which day is the kids class?”',
        source: 'IG · JUNIORS 8–12',
        foot: 'Reply free · 23h left',
        tone: 'free',
        owner: 'EK',
      },
      {
        name: 'Rehema Kaaya',
        age: '3 hr',
        note: '“Is the court really clay? Where exactly are you?”',
        source: 'FB · THE CLAY COURT',
        foot: 'Reply free · 21h left',
        tone: 'free',
        owner: 'EK',
      },
    ],
  },
  {
    stage: 'CONTACTED',
    count: 9,
    leads: [
      {
        name: 'Peter Mwakalinga',
        age: '5 hr',
        note: 'Sent the price list and Saturday clinic times.',
        source: 'FB · WEEKEND CLINIC',
        foot: 'Follow up tomorrow',
        tone: 'plain',
        owner: 'EK',
      },
      {
        name: 'Anna Shayo',
        age: '2 days',
        note: 'Asked to think about it. No answer since Friday.',
        source: 'IG · ADULT BEGINNERS',
        foot: 'Overdue · template needed',
        tone: 'overdue',
        owner: 'EK',
      },
      {
        name: 'Joseph Temba',
        age: 'Yesterday',
        note: 'Wants an evening slot under the lights.',
        source: 'FB · EVENING PLAY',
        foot: 'Offer Wed 19:30',
        tone: 'plain',
        owner: 'EK',
      },
    ],
  },
  {
    stage: 'TRIAL BOOKED',
    count: 6,
    leads: [
      {
        name: 'Zawadi Lyimo',
        age: 'Sat 08:00',
        note: 'Free trial lesson with the coach, Court 2.',
        source: 'IG · JUNIORS 8–12',
        foot: 'Reminder sent',
        tone: 'plain',
        owner: 'EK',
      },
      {
        name: 'Salma Juma',
        age: 'Sun 16:00',
        note: 'Bringing a friend. Two rackets needed.',
        source: 'IG · ADULT BEGINNERS',
        foot: 'Confirm on Friday',
        tone: 'plain',
        owner: 'EK',
      },
    ],
  },
  {
    stage: 'CAME TO TRIAL',
    count: 4,
    leads: [
      {
        name: 'Hassan Ally',
        age: '2 days',
        note: 'Loved it. Asked whether there is a family rate.',
        source: 'IG · ADULT BEGINNERS',
        foot: 'Send membership link',
        tone: 'plain',
        owner: 'EK',
      },
      {
        name: 'Fatuma Nyerere',
        age: '5 days',
        note: 'Trialled twice. Waiting on the punch card price.',
        source: "IG · WOMEN'S CLINIC",
        foot: 'Overdue · template needed',
        tone: 'overdue',
        owner: 'EK',
      },
    ],
  },
  {
    stage: 'JOINED',
    count: 9,
    leads: [
      {
        name: 'Editha Mrema',
        age: '4 Sept',
        note: 'Punch card, 12 classes. Plays Tue and Thu.',
        source: 'FB · WEEKEND CLINIC',
        foot: 'TSh 180,000',
        tone: 'money',
        owner: 'EK',
      },
      {
        name: 'Baraka Meena',
        age: '28 Aug',
        note: 'Monthly membership. Came from the juniors ad.',
        source: 'IG · JUNIORS 8–12',
        foot: 'TSh 90,000',
        tone: 'money',
        owner: 'EK',
      },
    ],
  },
];

/* ------------------------------------------------------------- lead detail */

export const LEAD = {
  initials: 'AS',
  name: 'Anna Shayo',
  sub: '+255 764 220 118 · Arusha · came in 8 September',
  facts: [
    { label: 'CAME FROM', value: 'Instagram · Adult beginners' },
    { label: 'WANTS', value: 'Weekday evenings' },
    { label: 'TOUCHES', value: '3 messages · no calls' },
    { label: 'NEXT ACTION', value: 'Overdue since Sunday', accent: true },
  ],
};

/** One entry in the lead's history. `due` is the next thing to do, not done. */
export type Moment = {
  day: string;
  time: string;
  what: string;
  detail: string;
  /** The small tag under the entry, if any. */
  tag?: string;
  /** A second, quieter tag beside it. */
  aside?: string;
  kind: 'inbound' | 'outbound' | 'due';
};

export const CONVERSATION: Moment[] = [
  {
    day: '8 Sept',
    time: '11:04',
    what: 'Filled the Instagram form',
    detail: '“Adult beginners — learn on real clay” · saw the ad twice',
    tag: 'Inbound · Instagram form',
    kind: 'inbound',
  },
  {
    day: '8 Sept',
    time: '13:20',
    what: 'Elias sent the welcome message',
    detail: 'Prices, the Tuesday 18:00 beginner clinic, and where to park.',
    tag: 'Read 13:26',
    aside: 'Template · welcome_prices · free',
    kind: 'outbound',
  },
  {
    day: '12 Sept',
    time: '09:48',
    what: 'She replied',
    detail: '“Let me check with my husband about Tuesdays and come back to you.”',
    tag: 'Inbound · opened a free window until 13 Sept 09:48',
    kind: 'inbound',
  },
  {
    day: 'Today',
    time: 'due',
    what: 'Second nudge — offer a free trial',
    detail: 'Two days quiet. The trial offer converts about a third of these.',
    kind: 'due',
  },
];

export const WINDOW_CLOSED = {
  headline: 'Free reply window closed · 3 days ago',
  detail:
    'Anna last messaged 12 Sept 09:48, so replies were free until 13 Sept 09:48. Send an approved template to reopen the conversation — her reply starts a fresh 24 hours.',
  locked: 'Typing a free message is locked until Anna writes back',
};

/** Templates the club may send. `state` decides how the chip is drawn. */
export const TEMPLATE_CHIPS = [
  { name: 'Free trial offer', cost: 'utility · free', state: 'chosen' },
  { name: "This week's clinic times", cost: 'utility · free', state: 'ready' },
  { name: 'Punch card prices', cost: 'marketing · TSh 11', state: 'ready' },
  { name: 'Come see the clay', cost: 'marketing · TSh 11', state: 'ready' },
  { name: "Members' round-robin", cost: 'in review', state: 'pending' },
] as const;

export const DRAFT = {
  body: 'Hi Anna — Elias from Meru Clay. You asked about adult beginners a few days back. We keep a free trial lesson open on Tuesday at 18:00 if you’d like to come and hit on the clay before deciding. Shall I put your name down?',
  meta: ['2 variables filled from her record', 'Swahili version available'],
  note: 'Sending logs to her timeline and reopens free replies for 24 hours once she answers.',
};

/* ------------------------------------------------------------------- ads */

export type Ad = {
  name: string;
  detail: string;
  /** Cost per member won, or a note when there are none. */
  cost: string;
  /** 0–1, drawn as a bar against the best-performing ad. */
  share: number;
  rate: string;
};

export const ADS: Ad[] = [
  {
    name: 'Juniors 8–12',
    detail: 'IG reels · 21 leads · 4 joined',
    cost: 'TSh 61k each',
    share: 1,
    rate: '19%',
  },
  {
    name: 'Weekend clinic',
    detail: 'FB feed · 13 leads · 2 joined',
    cost: 'TSh 118k each',
    share: 0.52,
    rate: '15%',
  },
  {
    name: 'Adult beginners',
    detail: 'IG stories · 24 leads · 3 joined',
    cost: 'TSh 96k each',
    share: 0.64,
    rate: '13%',
  },
  {
    name: 'The clay court (brand)',
    detail: 'FB video · 6 leads · 0 joined',
    cost: 'no members yet',
    share: 0.06,
    rate: '0%',
  },
];

export const AD_VERDICT = {
  headline: 'The juniors ad brings the cheapest members. The brand video brings none.',
  detail:
    "Parents book faster than adults do. Shifting the brand video's budget to juniors would buy roughly three more members a month at today's rates.",
};

export const NUMBER_HEALTH = {
  name: 'Meru Clay Tennis',
  number: '+255 736 118 400 · sending number',
  facts: [
    { label: 'Quality rating', value: 'High' },
    { label: 'Daily send limit', value: '250 · 14 used' },
    { label: 'Templates', value: '4 approved · 1 in review' },
    { label: 'Blocked you', value: '2 leads' },
  ],
};
