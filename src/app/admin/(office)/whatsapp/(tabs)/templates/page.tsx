import { Badge, Btn, Cell, Row, Table, type Col } from '@/components/admin/ui';
import { COSTS, TEMPLATES, type Approval, type Template } from '@/lib/admin/whatsapp';

const cols: Col[] = [
  { head: 'TEMPLATE' },
  { head: 'CATEGORY', w: 120 },
  { head: 'LANGUAGES', w: 110 },
  { head: 'STATUS', w: 130 },
  { head: 'SENT 30D', w: 90, align: 'right' },
  { head: 'REPLIED', w: 90, align: 'right' },
  { head: '', w: 80, align: 'right' },
];

/** Meta's verdict, as a dot. Green is sendable; amber is waiting. */
const statusDot: Record<Approval, string> = {
  Approved: 'bg-[#2F7D4F]',
  'In review': 'bg-[#C99A2E]',
  Rejected: 'bg-clay',
  Paused: 'bg-neutral-400',
};

export default function TemplatesPage() {
  return (
    <>
      {/* What a message costs. The club is small enough that TSh 11 a message
          matters, and the split between free and billed drives every choice
          made on the other tabs. */}
      <section className="flex flex-col border-b border-neutral-200 pb-[22px] pt-1 sm:flex-row">
        {COSTS.map((cost, i) => (
          <div
            key={cost.label}
            className={`flex min-w-0 grow basis-0 flex-col gap-[7px] ${
              i < COSTS.length - 1 ? 'sm:border-r sm:border-neutral-200 sm:pr-7' : ''
            } ${i > 0 ? 'mt-5 sm:mt-0 sm:pl-7' : ''}`}
          >
            <span
              className={`font-sans text-[11px] font-semibold uppercase leading-[14px] tracking-[0.13em] ${
                cost.accent ? 'text-clay' : 'text-neutral-500'
              }`}
            >
              {cost.label}
            </span>
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-[26px] font-semibold leading-8 tracking-[-0.01em] text-pine">
                {cost.price}
              </span>
              <span className="font-sans text-[13px] leading-[18px] text-neutral-500">
                {cost.volume}
              </span>
            </div>
            <p className="font-sans text-[13px] leading-[19px] text-neutral-500">{cost.detail}</p>
          </div>
        ))}
      </section>

      <Table cols={cols}>
        {TEMPLATES.map((template) => (
          <TemplateRow key={template.name} template={template} />
        ))}
      </Table>
    </>
  );
}

function TemplateRow({ template }: { template: Template }) {
  return (
    <Row>
      <Cell col={cols[0]}>
        <div className="flex min-w-0 flex-col gap-[3px]">
          <span className="truncate text-[15px] font-semibold leading-5 text-pine">
            {template.name}
          </span>
          <span className="truncate font-sans text-[13px] leading-[18px] text-neutral-500">
            {template.preview}
          </span>
        </div>
      </Cell>
      <Cell col={cols[1]}>
        {/* A marketing template costs money to send, so it is the one that
            gets colour. */}
        <Badge tone={template.category === 'Marketing' ? 'clay' : 'grey'}>
          {template.category}
        </Badge>
      </Cell>
      <Cell col={cols[2]}>
        <span className="text-[14px] leading-[18px] text-neutral-700">{template.languages}</span>
      </Cell>
      <Cell col={cols[3]} className="gap-[7px]">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot[template.status]}`} />
        <span
          className={`truncate font-sans text-[13px] font-medium leading-[18px] ${
            template.status === 'Approved' ? 'text-pine' : 'text-neutral-700'
          }`}
        >
          {template.status}
          {template.statusNote && ` · ${template.statusNote}`}
        </span>
      </Cell>
      <Cell col={cols[4]}>
        <span
          className={`text-[15px] font-semibold leading-5 ${
            template.sent === '—' ? 'text-neutral-400' : 'text-pine'
          }`}
        >
          {template.sent}
        </span>
      </Cell>
      <Cell col={cols[5]}>
        <span
          className={`text-[15px] font-medium leading-5 ${
            template.replied === '—' ? 'text-neutral-400' : 'text-neutral-700'
          }`}
        >
          {template.replied}
        </span>
      </Cell>
      <Cell col={cols[6]}>
        <Btn size="sm">{template.action}</Btn>
      </Cell>
    </Row>
  );
}
