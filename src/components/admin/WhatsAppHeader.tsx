'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Btn, Head } from './ui';

/**
 * The WhatsApp section's head and sub-nav.
 *
 * One component rather than one per tab, because four of the five tabs share
 * the same head — but not all five: the court agent is a different kind of
 * thing from the templates, and the design gives it its own sentence and its
 * own primary action. So the head reads the path too, and the tabs and the
 * title can never disagree about which view is open.
 *
 * Tabs are underlined rather than pilled: these are five views of one thing,
 * not five filters.
 */
const TABS = [
  { label: 'Templates', href: '/admin/whatsapp/templates' },
  { label: 'Broadcasts', href: '/admin/whatsapp/broadcasts' },
  { label: 'Automations', href: '/admin/whatsapp/automations' },
  { label: 'Court agent', href: '/admin/whatsapp/agent' },
  { label: 'Number & opt-outs', href: '/admin/whatsapp/number' },
];

type SectionHead = {
  blurb: string;
  /** The primary action. No href on the agent tab — it opens a group picker. */
  action: { label: string; href?: string };
};

const DEFAULT_HEAD: SectionHead = {
  blurb:
    'Everything the club sends runs through one number. Meta approves the wording before it can go out.',
  action: { label: 'New template', href: '/admin/whatsapp/templates/new' },
};

const AGENT_HEAD: SectionHead = {
  blurb:
    "The club's booking desk, sitting in the members' own group chats. It answers when someone says its name, holds the court, and hands over anything it should not decide.",
  action: { label: 'Add to a group' },
};

export default function WhatsAppHeader() {
  const pathname = usePathname();
  const onAgent = pathname.startsWith('/admin/whatsapp/agent');
  const { blurb, action } = onAgent ? AGENT_HEAD : DEFAULT_HEAD;

  return (
    <>
      <Head
        title="WhatsApp"
        blurb={blurb}
        back={{ label: 'Leads', href: '/admin/leads' }}
        actions={
          <>
            <Btn>Open Meta Manager</Btn>
            <Btn variant="primary" href={action.href}>
              {action.label}
            </Btn>
          </>
        }
      />

      <nav className="flex flex-wrap items-center gap-7 border-b border-neutral-200">
        {TABS.map((tab) => {
          const on = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={on ? 'page' : undefined}
              className={`-mb-px flex items-center border-b-2 pb-[13px] text-[15px] leading-5 transition-colors ${
                on
                  ? 'border-pine font-semibold text-pine'
                  : 'border-transparent text-neutral-500 hover:text-pine'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
