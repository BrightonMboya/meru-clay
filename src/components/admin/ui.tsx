/**
 * The club office's small parts.
 *
 * Every admin screen in the Paper file is built from the same handful of
 * shapes: a pill button, a filter chip, an uppercase status badge, a level
 * dot, a hairline-ruled table. They live here so thirteen screens describe
 * them once, and so a change to the pill radius is one edit rather than
 * thirteen.
 *
 * Palette note: the design's greys are Tailwind's `neutral` scale, so these
 * use `neutral-*` rather than the marketing `cream`/`stone` brand tokens.
 * See the "Two visual worlds" section of the README.
 */

import Link from 'next/link';

/* ------------------------------------------------------------------ layout */

/** The 40px gutter every screen's content sits in. */
export const GUTTER = 'px-10';

/**
 * One screen's scrolling column. `gap` varies by screen in the design —
 * roomier where the page is a few large blocks, tighter where it is a list.
 */
export function Screen({ gap = 36, children }: { gap?: number; children: React.ReactNode }) {
  return (
    <div className={`flex min-w-0 grow flex-col ${GUTTER} py-10`} style={{ gap }}>
      {children}
    </div>
  );
}

/**
 * Title and one line of explanation, with the screen's actions opposite.
 * `day` is only for screens that are about a particular day — it puts the
 * date between two steppers, ahead of the actions.
 */
export function Head({
  title,
  blurb,
  day,
  back,
  actions,
}: {
  title: string;
  /** Omitted on screens whose title already says everything. */
  blurb?: string;
  day?: { label: string; onPrev?: () => void; onNext?: () => void };
  /** Where this screen came from — set on the screens that are a form. */
  back?: { label: string; href: string };
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col items-start justify-between gap-6 pb-1 lg:flex-row lg:gap-12">
      <div className="flex max-w-[700px] flex-col gap-[5px]">
        {back && (
          <Link
            href={back.href}
            className="flex w-fit items-center gap-1.5 pb-[3px] font-sans text-[13px] font-medium leading-4 text-neutral-500 transition-colors hover:text-pine"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" className="shrink-0" aria-hidden>
              <path
                d="M7.2 2.4 3.6 6l3.6 3.6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {back.label}
          </Link>
        )}
        <h1 className="text-[28px] font-semibold leading-[34px] tracking-[-0.02em] text-pine">
          {title}
        </h1>
        {blurb && (
          <p className="font-sans text-[15px] leading-[22px] text-neutral-500">{blurb}</p>
        )}
      </div>
      {(day || actions) && (
        <div className="flex shrink-0 flex-wrap items-center gap-[10px]">
          {/* The day row is a fixed width with an arrow pinned to each end, so
              stepping through the week never wraps the date onto a second line
              or shuffles the arrows sideways as its length changes. */}
          {day && (
            <div className="flex w-[292px] max-w-full shrink-0 items-center justify-between gap-3">
              <Stepper direction="prev" onClick={day.onPrev} />
              <span className="min-w-0 grow whitespace-nowrap text-center text-[20px] font-medium leading-6 text-pine">
                {day.label}
              </span>
              <Stepper direction="next" onClick={day.onNext} />
            </div>
          )}
          {actions}
        </div>
      )}
    </header>
  );
}

function Stepper({ direction, onClick }: { direction: 'prev' | 'next'; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-label={direction === 'prev' ? 'Previous day' : 'Next day'}
      className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] border border-pine/[0.18] transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <svg width="7" height="12" viewBox="0 0 7 12" fill="none" aria-hidden>
        <path
          d={direction === 'prev' ? 'M6 1L1 6L6 11' : 'M1 1L6 6L1 11'}
          stroke="#3C3F38"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

/** One reading on the strip below a screen's head. */
export type Reading = {
  label: string;
  value: string;
  detail: string;
  /** The one reading that is a problem rather than a fact. */
  accent?: boolean;
};

/**
 * A screen's headline numbers, on a hairline-ruled strip rather than in cards
 * — these are readings, not objects, and boxing each one would give it a
 * weight it has not earned.
 */
export function Readings({ readings }: { readings: Reading[] }) {
  const last = readings.length - 1;

  return (
    <div className="flex w-full flex-col border-y border-neutral-200 sm:flex-row">
      {readings.map((reading, i) => (
        <div
          key={reading.label}
          className={[
            'flex min-w-0 grow basis-0 flex-col gap-1.5 py-[18px]',
            // Hairlines between readings: horizontal when stacked, vertical
            // once they sit side by side.
            i > 0 ? 'border-t border-neutral-200 sm:border-l sm:border-t-0 sm:pl-6' : '',
            i < last ? 'sm:pr-6' : '',
          ].join(' ')}
        >
          <span
            className={`font-sans text-[11px] font-semibold uppercase leading-[14px] tracking-[0.13em] ${
              reading.accent ? 'text-clay' : 'text-neutral-500'
            }`}
          >
            {reading.label}
          </span>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-[28px] font-semibold leading-[34px] tracking-[-0.02em] ${
                reading.accent ? 'text-clay' : 'text-pine'
              }`}
            >
              {reading.value}
            </span>
            <span className="min-w-0 truncate font-sans text-[13px] leading-4 text-neutral-500">
              {reading.detail}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * A segmented control — a group of exclusive choices on a recessed ground,
 * the chosen one raised on white. Used where a screen switches view rather
 * than filters a list.
 */
export function Segmented({ options, chosen }: { options: readonly string[]; chosen: string }) {
  return (
    <div className="flex shrink-0 items-center gap-1 rounded-full bg-neutral-100 p-1">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={option === chosen}
          className={`rounded-full px-[15px] py-[7px] text-[12px] leading-4 transition-colors ${
            option === chosen
              ? 'bg-white font-semibold text-pine shadow-[0_1px_2px_rgba(19,39,29,0.06)]'
              : 'font-medium text-neutral-500 hover:text-pine'
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

/**
 * A numbered step inside a form card: its label, a rule that takes the slack,
 * and a note on the right saying what the step will and will not allow.
 */
export function StepRule({ step, label, note }: { step: number; label: string; note?: string }) {
  return (
    <div className="flex items-center gap-[10px]">
      <Eyebrow tone="loud">
        {step} · {label}
      </Eyebrow>
      <span className="h-px grow bg-neutral-200" />
      {note && <span className="shrink-0 text-[12px] leading-4 text-neutral-500">{note}</span>}
    </div>
  );
}

/** A lane heading — 10px, wide-tracked, upper case. */
export function Eyebrow({
  children,
  tone = 'quiet',
}: {
  children: React.ReactNode;
  tone?: 'quiet' | 'loud' | 'inverse';
}) {
  const color =
    tone === 'loud' ? 'text-pine' : tone === 'inverse' ? 'text-[#b7bfb6]' : 'text-neutral-500';
  return (
    <div className={`text-[10px] font-bold leading-3 tracking-[0.14em] ${color}`}>{children}</div>
  );
}

/* ----------------------------------------------------------------- buttons */

type BtnProps = {
  children: React.ReactNode;
  icon?: React.ReactNode;
  /** Renders a link instead of a button when set. */
  href?: string;
  variant?: 'primary' | 'outline' | 'quiet';
  size?: 'md' | 'sm';
  onClick?: () => void;
  disabled?: boolean;
  /** Pressed state for a pill that opens a panel. */
  pressed?: boolean;
};

/**
 * The pill. `primary` is the one clay thing on a screen — there is never more
 * than one, which is what makes it read as the thing to do.
 */
export function Btn({
  children,
  icon,
  href,
  variant = 'outline',
  size = 'md',
  onClick,
  disabled,
  pressed,
}: BtnProps) {
  const base =
    'inline-flex shrink-0 items-center justify-center gap-[7px] rounded-full transition-colors';
  // The primary pill is a shade wider than the outline ones — the design gives
  // the one clay button a little more air than its neighbours.
  const scale =
    size === 'md'
      ? `h-[38px] text-[13px] leading-4 ${variant === 'primary' ? 'px-[18px]' : 'px-[15px]'}`
      : 'h-[30px] px-[13px] text-[12px] leading-4';
  const skin = {
    primary: 'bg-clay font-semibold text-white hover:bg-clay/90',
    outline:
      'border border-neutral-200 font-medium text-pine hover:border-neutral-300 hover:bg-neutral-50',
    quiet: 'font-medium text-neutral-500 hover:text-pine',
  }[variant];
  const cls = `${base} ${scale} ${skin} disabled:cursor-not-allowed disabled:opacity-50 ${
    pressed ? 'ring-2 ring-clay/35' : ''
  }`;

  const body = (
    <>
      {icon}
      <span>{children}</span>
    </>
  );

  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <button
      type="button"
      className={cls}
      onClick={onClick}
      disabled={disabled}
      aria-expanded={pressed === undefined ? undefined : pressed}
    >
      {body}
    </button>
  );
}

/**
 * A chip. One per group is `on`.
 *
 * Two ways of showing the choice, both from the design: `solid` fills with
 * pine, `ring` keeps the chip white and thickens its border. The forms use
 * `ring` where the options are plain words, and `solid` where the chip is
 * naming a thing that has its own identity — a level, a template.
 */
export function Chip({
  children,
  count,
  mark,
  on = false,
  chosen = 'solid',
  size = 'md',
  href,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  count?: number;
  /** A swatch or dot ahead of the label. */
  mark?: React.ReactNode;
  on?: boolean;
  chosen?: 'solid' | 'ring';
  /** `lg` is the 38px-tall chip the form screens use. */
  size?: 'md' | 'lg';
  href?: string;
  /** Set to make the chip a real choice rather than a label. */
  onClick?: () => void;
  disabled?: boolean;
}) {
  const onCls =
    chosen === 'solid'
      ? 'bg-pine font-semibold text-cream'
      : 'border-[1.5px] border-pine font-semibold text-pine';
  const scale = size === 'lg' ? 'h-[38px] px-[14px]' : 'px-[14px] py-[9px]';
  const cls = `inline-flex shrink-0 items-center gap-2 rounded-full text-[13px] leading-4 transition-colors ${scale} ${
    on ? onCls : 'border border-neutral-200 font-medium text-neutral-700 hover:border-neutral-300'
  }`;
  const body = (
    <>
      {mark}
      <span>{children}</span>
      {count !== undefined && (
        <span className={on && chosen === 'solid' ? 'text-cream/70' : 'text-neutral-500'}>
          {count}
        </span>
      )}
    </>
  );
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : !onClick ? (
    <span className={cls}>{body}</span>
  ) : (
    <button
      type="button"
      className={`${cls} disabled:cursor-not-allowed disabled:opacity-50`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
    >
      {body}
    </button>
  );
}

/** The search field. Styled, not wired — there is nothing to search yet. */
export function Search({ placeholder, width = 200 }: { placeholder: string; width?: number }) {
  return (
    <div
      className="flex shrink-0 items-center gap-[9px] rounded-full border border-neutral-200 bg-white px-[14px] py-[9px]"
      style={{ width }}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" className="shrink-0" aria-hidden>
        <circle cx="6.2" cy="6.2" r="4.4" fill="none" stroke="#8C948B" strokeWidth="1.4" />
        <path d="M9.6 9.6L12.4 12.4" stroke="#8C948B" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-w-0 grow bg-transparent text-[13px] leading-4 text-pine outline-none placeholder:text-neutral-500"
      />
    </div>
  );
}

/* ------------------------------------------------------------------ badges */

export type BadgeTone = 'grey' | 'stone' | 'clay' | 'pine' | 'green';

/** An uppercase state badge. Small, wide-tracked, on a tinted ground. */
export function Badge({
  children,
  tone = 'grey',
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
}) {
  const skin = {
    grey: 'bg-neutral-100 text-neutral-600',
    stone: 'bg-neutral-100 text-neutral-600',
    clay: 'bg-clay-wash text-clay-ink',
    pine: 'bg-pine text-cream',
    green: 'bg-[#EAF2EC] text-[#2C5138]',
  }[tone];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-[10px] py-[5px] text-[11px] font-semibold leading-[14px] tracking-[0.04em] ${skin}`}
    >
      {children}
    </span>
  );
}

/**
 * A player level, as a square of the level ramp plus its name. The ramp is a
 * pure monotone run — red ball palest, open darkest — so a glance down the
 * column reads as a ladder without needing to read the words.
 */
export const LEVELS = ['Red ball', 'Green ball', 'Social', 'Club', 'Competitive', 'Open'] as const;
export type Level = (typeof LEVELS)[number];

/** The level ramp as background classes, so a bar segment and a dot agree. */
export const LEVEL_BG: Record<Level, string> = {
  'Red ball': 'bg-neutral-300',
  'Green ball': 'bg-neutral-400',
  Social: 'bg-neutral-500',
  Club: 'bg-neutral-600',
  Competitive: 'bg-neutral-800',
  Open: 'bg-pine',
};

export function LevelDot({ level, size = 8 }: { level: Level; size?: number }) {
  return (
    <span
      className={`shrink-0 rounded-[2px] ${LEVEL_BG[level]}`}
      style={{ width: size, height: size }}
    />
  );
}

export function LevelTag({ level }: { level: Level }) {
  return (
    <span className="flex items-center gap-[7px]">
      <LevelDot level={level} />
      <span className="text-[13px] font-medium leading-4 text-neutral-700">{level}</span>
    </span>
  );
}

/** Initials in a circle. `tone="dark"` for use on a pine surface. */
export function Avatar({
  initials,
  size = 36,
  tone = 'light',
}: {
  initials: string;
  size?: number;
  /** `dark`/`dark-alt` are for pine surfaces; alternating the two makes an
      overlapping stack read as separate faces without a hard outline. */
  tone?: 'light' | 'dark' | 'dark-alt';
}) {
  const skin = {
    light: 'bg-neutral-100 text-neutral-700',
    dark: 'border-2 border-pine bg-[#38503F] text-cream',
    'dark-alt': 'border-2 border-pine bg-[#42594A] text-cream',
  }[tone];
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${skin}`}
      style={{ width: size, height: size, fontSize: size >= 36 ? 12 : 10 }}
    >
      {initials}
    </span>
  );
}

/* ------------------------------------------------------------------ tables */

/** A column in one of the office's tables. */
export type Col = {
  head: string;
  /** Fixed px width, or omitted for the one column that takes the slack. */
  w?: number;
  align?: 'left' | 'right';
};

/**
 * A hairline table. Columns are fixed-width slots so that every row's cells
 * land in the same vertical lanes whatever they contain — the one rule that
 * keeps a dense list readable.
 */
export function Table({
  cols,
  headings = true,
  children,
}: {
  cols: Col[];
  /** Off where a section heading already says what the columns are. */
  headings?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col">
      {headings && (
        <div className="flex items-center gap-4 border-b border-neutral-200 px-1 pb-[10px]">
          {cols.map((col, i) => (
            <div
              key={`${col.head}-${i}`}
              className={`text-[10px] font-bold leading-3 tracking-[0.14em] text-neutral-500 ${
                col.w ? 'shrink-0' : 'min-w-0 grow basis-0'
              } ${col.align === 'right' ? 'text-right' : ''}`}
              style={col.w ? { width: col.w } : undefined}
            >
              {col.head}
            </div>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}

export function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 border-b border-neutral-200/70 px-1 py-[14px] last:border-b-0">
      {children}
    </div>
  );
}

/** One cell, in the lane its column defines. */
export function Cell({
  col,
  children,
  className = '',
}: {
  col: Col;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex min-w-0 items-center ${col.w ? 'shrink-0' : 'grow basis-0'} ${
        col.align === 'right' ? 'justify-end' : ''
      } ${className}`}
      style={col.w ? { width: col.w } : undefined}
    >
      {children}
    </div>
  );
}

/** A name over a quieter second line — the shape of every table's first cell. */
export function NameCell({ name, sub }: { name: string; sub: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-[3px]">
      <span className="truncate text-[15px] font-semibold leading-[18px] text-pine">{name}</span>
      <span className="truncate text-[12px] leading-4 text-neutral-500">{sub}</span>
    </div>
  );
}

/* ------------------------------------------------------------------- forms */

/**
 * A numbered step of a form, ruled off from the one above it. The office's
 * forms are long, and this is what keeps them readable: a rule, a numbered
 * label, and on the right a note about what the step does or will not allow.
 */
export function Fieldset({
  step,
  label,
  note,
  gap = 20,
  children,
}: {
  step: number;
  label: string;
  note?: string;
  gap?: number;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="flex flex-col border-t border-neutral-200 pb-[30px] pt-[26px] last:pb-1">
      <div className="flex flex-wrap items-baseline justify-between gap-4 pb-[18px]">
        <legend className="font-sans text-[11px] font-semibold uppercase leading-[14px] tracking-[0.13em] text-neutral-500">
          {step} · {label}
        </legend>
        {note && <span className="text-[12px] leading-4 text-neutral-500">{note}</span>}
      </div>
      <div className="flex flex-col" style={{ gap }}>
        {children}
      </div>
    </fieldset>
  );
}

/**
 * A text field. Every form in the club office is styled but unwired — there
 * is no database to save into yet — so these are real inputs with real
 * defaults and no submit behind them.
 */
export function Field({
  label,
  hint,
  placeholder,
  value,
  type = 'text',
  width,
  children,
}: {
  label: string;
  /** A quieter aside beside the label — "optional · receipts only". */
  hint?: string;
  placeholder?: string;
  value?: string;
  type?: string;
  /** Fixed px width, for the short fields. Omitted means take the slack. */
  width?: number;
  /** A control other than a text input — a select, a row of chips. */
  children?: React.ReactNode;
}) {
  return (
    <label
      className={`flex min-w-0 flex-col gap-2 ${width ? 'shrink-0' : 'grow basis-0'}`}
      style={width ? { width } : undefined}
    >
      <span className="flex items-baseline gap-1.5">
        <span className="font-sans text-[13px] font-medium leading-4 text-neutral-700">
          {label}
        </span>
        {hint && <span className="font-sans text-[12px] leading-4 text-neutral-400">{hint}</span>}
      </span>
      {children ?? (
        <input
          type={type}
          placeholder={placeholder}
          defaultValue={value}
          className="h-[46px] w-full rounded-[10px] border border-neutral-200 bg-white px-[14px] text-[15px] font-medium leading-5 text-pine outline-none transition-colors placeholder:font-normal placeholder:text-neutral-400 focus:border-pine/40"
        />
      )}
    </label>
  );
}

/** A field whose value is picked, not typed. Styled as the design draws it. */
export function Picker({ value }: { value: string }) {
  return (
    <span className="flex h-[46px] items-center justify-between gap-[10px] rounded-[10px] border border-neutral-200 px-[14px]">
      <span className="text-[15px] font-medium leading-5 text-pine">{value}</span>
      <svg width="12" height="12" viewBox="0 0 12 12" className="shrink-0" aria-hidden>
        <path
          d="M2.8 4.4 6 7.6l3.2-3.2"
          fill="none"
          stroke="#737373"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/** Fields side by side, stacking on a narrow window. */
export function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col items-start gap-5 sm:flex-row">{children}</div>;
}

/** A row of exclusive choices. `chosen` names the one that is picked. */
export function Choices({
  options,
  chosen,
  chosenStyle = 'solid',
  size = 'lg',
}: {
  /** A plain string, or a label with a swatch — which may differ when picked. */
  options: readonly (
    string | { label: string; mark?: React.ReactNode; markOn?: React.ReactNode }
  )[];
  chosen: string;
  chosenStyle?: 'solid' | 'ring';
  size?: 'md' | 'lg';
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.map((option) => {
        const { label, mark, markOn } = typeof option === 'string' ? { label: option } : option;
        const on = label === chosen;
        return (
          <Chip
            key={label}
            mark={on ? (markOn ?? mark) : mark}
            on={on}
            chosen={chosenStyle}
            size={size}
          >
            {label}
          </Chip>
        );
      })}
    </div>
  );
}

/** A quiet explanatory line under a step, with a small ⓘ. */
export function Aside({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2">
      <svg width="14" height="14" viewBox="0 0 14 14" className="mt-0.5 shrink-0" aria-hidden>
        <circle cx="7" cy="7" r="5.6" fill="none" stroke="#A3A3A3" strokeWidth="1.2" />
        <path
          d="M7 6.4v3.4M7 4.3v.9"
          fill="none"
          stroke="#A3A3A3"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
      <span className="font-sans text-[13px] leading-[18px] text-neutral-500">{children}</span>
    </p>
  );
}

/**
 * A card of choices — membership tiers, message categories. One is picked,
 * and picking it thickens the border rather than filling the card, so the
 * prices inside stay as legible as each other.
 */
export function PickCard({
  title,
  headline,
  detail,
  on = false,
}: {
  title: string;
  headline: string;
  detail: string;
  on?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={`flex min-w-0 grow basis-0 flex-col gap-1.5 rounded-[10px] p-4 text-left transition-colors ${
        on ? 'border-[1.5px] border-pine' : 'border border-neutral-200 hover:border-neutral-300'
      }`}
    >
      <span className="text-[16px] font-semibold leading-[22px] text-pine">{title}</span>
      <span className="text-[22px] font-semibold leading-7 tracking-[-0.01em] text-pine">
        {headline}
      </span>
      <span className="font-sans text-[13px] leading-[18px] text-neutral-500">{detail}</span>
    </button>
  );
}

/** A checked line in a form rail — what saving this will actually do. */
export function OnSave({ items }: { items: string[] }) {
  return (
    <div className="flex flex-col gap-[14px]">
      <Eyebrow>ON SAVE</Eyebrow>
      {items.map((item) => (
        <div key={item} className="flex items-start gap-[10px]">
          <svg width="14" height="14" viewBox="0 0 14 14" className="mt-0.5 shrink-0" aria-hidden>
            <path
              d="M2.4 7.4 5.6 10.6 11.6 3.8"
              fill="none"
              stroke="var(--color-clay)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="font-sans text-[14px] leading-5 text-neutral-700">{item}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------- icons */

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.3,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export const icons = {
  plus: (
    <svg width="14" height="14" viewBox="0 0 14 14" className="shrink-0" aria-hidden>
      <path d="M7 2.6v8.8M2.6 7h8.8" {...stroke} strokeWidth={1.5} />
    </svg>
  ),
  download: (
    <svg width="14" height="14" viewBox="0 0 14 14" className="shrink-0" aria-hidden>
      <path d="M7 1.8v8M3.8 6.6 7 9.8l3.2-3.2M2.2 12.2h9.6" {...stroke} />
    </svg>
  ),
  list: (
    <svg width="14" height="14" viewBox="0 0 14 14" className="shrink-0" aria-hidden>
      <path d="M2 2.4h10M2 7h10M2 11.6h6" {...stroke} strokeLinejoin="miter" />
    </svg>
  ),
  chat: (
    <svg width="14" height="14" viewBox="0 0 14 14" className="shrink-0" aria-hidden>
      <path d="M2 12l.9-3A5 5 0 1 1 5 11.1L2 12z" {...stroke} strokeLinecap="butt" />
    </svg>
  ),
  arrow: (
    <svg width="14" height="10" viewBox="0 0 14 10" className="shrink-0" aria-hidden>
      <path d="M1 5H12M12 5L8.5 1.5M12 5L8.5 8.5" {...stroke} strokeWidth={1.4} />
    </svg>
  ),
} as const;
