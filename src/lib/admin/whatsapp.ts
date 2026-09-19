/**
 * The club's WhatsApp number — templates, broadcasts, automations, and the
 * court agent.
 *
 * ⚠️ DEMO DATA. See the note at the top of src/lib/bookings.ts.
 *
 * Two of Meta's rules shape everything in here, and they are worth stating
 * once:
 *
 *   The 24-hour window. A business may send freeform text only within 24
 *   hours of the customer's last message. Outside it, only a template Meta
 *   has approved may go out.
 *
 *   Categories. A *utility* template answers something the customer asked
 *   for and is free; a *marketing* template is anything they did not ask for
 *   and is billed. Miscategorising is how accounts get restricted, which is
 *   why the screens say which is which everywhere.
 *
 * `src/lib/notify.ts` implements both sending modes.
 */

export type Category = 'Utility' | 'Marketing';
export type Approval = 'Approved' | 'In review' | 'Rejected' | 'Paused';

/** What a message costs, by kind. The three-up strip on the Templates tab. */
export const COSTS = [
  {
    label: 'Replying inside 24 hr',
    price: 'Free',
    volume: '156 sent this month',
    detail: 'Type anything you like once they have written to you.',
  },
  {
    label: 'Utility template',
    price: 'Free',
    volume: '62 sent this month',
    detail: 'Answers to a request — prices, times, a booking reminder.',
  },
  {
    label: 'Marketing template',
    price: 'TSh 11',
    volume: 'each · 90 sent · TSh 990',
    detail: 'Anything they did not ask for. This is what broadcasts use.',
    accent: true,
  },
];

export type Template = {
  name: string;
  /** The first line of the body, as the list previews it. */
  preview: string;
  category: Category;
  languages: string;
  status: Approval;
  /** How long it has been in review, when it is. */
  statusNote?: string;
  sent: string;
  replied: string;
  action: 'Edit' | 'View';
};

export const TEMPLATES: Template[] = [
  {
    name: 'welcome_prices',
    preview: 'Hi {{name}} — Elias from Meru Clay. Adult beginners hit on…',
    category: 'Utility',
    languages: 'EN · SW',
    status: 'Approved',
    sent: '41',
    replied: '64%',
    action: 'Edit',
  },
  {
    name: 'free_trial_offer',
    preview: 'Hi {{name}} — you asked about {{interest}} a few days back. We keep a free…',
    category: 'Utility',
    languages: 'EN · SW',
    status: 'Approved',
    sent: '28',
    replied: '39%',
    action: 'Edit',
  },
  {
    name: 'trial_reminder',
    preview: 'Reminder: your trial lesson is {{day}} at {{time}} on Court {{court}}.',
    category: 'Utility',
    languages: 'EN · SW',
    status: 'Approved',
    sent: '22',
    replied: '77%',
    action: 'Edit',
  },
  {
    name: 'punch_card_prices',
    preview: 'A 12-class punch card is TSh 180,000 and never expires. Want one?',
    category: 'Marketing',
    languages: 'EN',
    status: 'Approved',
    sent: '90',
    replied: '18%',
    action: 'Edit',
  },
  {
    name: 'members_round_robin',
    preview: "Saturday round-robin at {{time}}. Reply YES and we'll pencil you in.",
    category: 'Marketing',
    languages: 'EN · SW',
    status: 'In review',
    statusNote: '2 days',
    sent: '—',
    replied: '—',
    action: 'View',
  },
];
