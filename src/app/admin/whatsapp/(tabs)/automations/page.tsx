import { Btn } from '@/components/admin/ui';

/**
 * Automations — the messages that go out without anyone deciding to send
 * them.
 *
 * ⚠️ DEMO. Styled but unwired; see the note at the top of
 * src/lib/bookings.ts.
 *
 * The last rule is the one that matters most and is the only one that cannot
 * be switched off: Meta requires that replying STOP opts someone out of
 * marketing, so its toggle is drawn locked rather than left to the coach.
 */

type Rule = {
  /** The trigger, as a sentence. */
  when: string;
  /** The action, split so the template name can be set as a chip. */
  does: [before: string, template: string, after: string];
  count: string;
  outcome: string;
  /** `on`, `off`, or `locked` — required by Meta and not ours to turn off. */
  state: 'on' | 'off' | 'locked';
  action: 'Edit' | 'View';
};

const RULES: Rule[] = [
  {
    when: 'A form comes in from Instagram or Facebook',
    does: ['straight away, send', 'welcome_prices', 'and put them in New'],
    count: '41 times this month',
    outcome: '64% wrote back',
    state: 'on',
    action: 'Edit',
  },
  {
    when: 'A lead goes quiet for two days',
    does: ['flag them overdue and offer', 'free_trial_offer', 'for you to approve first'],
    count: '18 times this month',
    outcome: '39% wrote back',
    state: 'on',
    action: 'Edit',
  },
  {
    when: 'A trial lesson is two hours away',
    does: ['send', 'trial_reminder', 'with the court and the time'],
    count: '22 times this month',
    outcome: '5 no-shows, down from 9',
    state: 'on',
    action: 'Edit',
  },
  {
    when: 'A membership falls due',
    does: ['on the 1st, send', 'dues_reminder', 'with the amount owed'],
    count: 'Off',
    outcome: 'last run 1 August',
    state: 'off',
    action: 'Edit',
  },
  {
    when: 'Anyone replies STOP',
    does: ['opt them out of marketing for good', '', 'required by Meta'],
    count: '2 people',
    outcome: 'cannot be turned off',
    state: 'locked',
    action: 'View',
  },
];

export default function AutomationsPage() {
  return (
    <div className="flex flex-col">
      {RULES.map((rule) => (
        <RuleRow key={rule.when} rule={rule} />
      ))}
    </div>
  );
}

function RuleRow({ rule }: { rule: Rule }) {
  const [before, template, after] = rule.does;
  const off = rule.state === 'off';

  return (
    <div className="flex flex-wrap items-center gap-[22px] border-b border-neutral-200 py-[22px] last:border-b-0">
      <div className="flex w-10 shrink-0 items-center">
        <Toggle state={rule.state} label={rule.when} />
      </div>

      <div className="flex min-w-0 grow flex-col gap-[7px]">
        <span className="text-[16px] font-semibold leading-[22px] text-pine">{rule.when}</span>
        {/* Each fragment is its own element: two bare strings side by side in
            a flex row are one text node, and would run together when a rule
            has no template between them. */}
        <span className="flex flex-wrap items-center gap-2 font-sans text-[13px] leading-[18px] text-neutral-500">
          <span>{before}</span>
          {template && (
            <span className="flex h-[26px] items-center rounded-full bg-neutral-100 px-[10px] font-sans text-[12px] font-semibold leading-4 text-neutral-700">
              {template}
            </span>
          )}
          {after && <span>{after}</span>}
        </span>
      </div>

      <div className="flex w-[200px] shrink-0 flex-col gap-[3px]">
        <span
          className={`text-[14px] font-semibold leading-[18px] ${
            off ? 'text-neutral-500' : 'text-pine'
          }`}
        >
          {rule.count}
        </span>
        <span className="font-sans text-[12px] leading-4 text-neutral-500">{rule.outcome}</span>
      </div>

      <div className="flex w-[70px] shrink-0 justify-end">
        <Btn size="sm">{rule.action}</Btn>
      </div>
    </div>
  );
}

/**
 * The switch. A locked rule is drawn on but in sage rather than pine, so it
 * reads as on-and-not-yours rather than merely on.
 */
function Toggle({ state, label }: { state: Rule['state']; label: string }) {
  const on = state !== 'off';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={state === 'locked'}
      className={`flex h-[22px] w-[38px] shrink-0 items-center rounded-full p-[3px] transition-colors ${
        state === 'on'
          ? 'bg-pine'
          : state === 'locked'
            ? 'cursor-not-allowed bg-[#7A8C81]'
            : 'bg-neutral-300'
      } ${on ? 'justify-end' : 'justify-start'}`}
    >
      <span className="h-4 w-4 shrink-0 rounded-full bg-white" />
    </button>
  );
}
