import type { Desk } from '@/lib/admin/desk';

const railHeading = 'text-[11px] font-bold leading-[14px] tracking-[0.17em] text-neutral-500';
const ghostButton =
  'flex items-center justify-center rounded-full border border-pine/[0.22] px-[18px] py-[10px] text-[13.5px] font-semibold leading-[18px] text-neutral-900 transition-colors hover:bg-neutral-50';

/**
 * The one thing on the page that is a decision rather than information: an
 * unconfirmed hold, counting down. It sits at the top of the rail and is the
 * only clay-washed surface on the screen, so it is impossible to miss.
 */
export function NeedsYou({
  hold,
  busy = false,
  onAct,
}: {
  hold: NonNullable<Desk['needsYou']>;
  /** An action is in flight — the buttons stop taking a second one. */
  busy?: boolean;
  onAct?: (action: 'confirm' | 'cancel') => void;
}) {
  // Tanzanian numbers are stored as +255…; wa.me wants the digits alone.
  const whatsapp = `https://wa.me/${hold.phone.replace(/\D/g, '')}`;

  return (
    <section className="flex w-full flex-col gap-[14px]">
      <h2 className={railHeading}>NEEDS YOU</h2>
      <div className="flex w-full flex-col gap-[14px] rounded-xl border border-clay/40 bg-clay/[0.08] p-[18px]">
        <div className="flex items-center gap-2">
          <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-clay" />
          <span className="text-[11px] font-bold leading-[14px] tracking-[0.1em] text-[#9E4327]">
            HOLD EXPIRES IN {hold.expiresIn}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[21px] font-medium leading-[26px] text-pine">{hold.name}</span>
          <span className="text-[13.5px] leading-[18px] text-neutral-600">{hold.line}</span>
          <span className="text-[13.5px] leading-[18px] text-neutral-600">{hold.phone}</span>
        </div>
        <div className="flex w-full flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onAct?.('confirm')}
            className="flex items-center justify-center rounded-full bg-pine px-5 py-[10px] text-[13.5px] font-semibold leading-[18px] text-white transition-colors hover:bg-pine-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Confirm
          </button>
          <a href={whatsapp} target="_blank" rel="noopener" className={ghostButton}>
            WhatsApp
          </a>
          <button
            type="button"
            disabled={busy}
            onClick={() => onAct?.('cancel')}
            className={`${ghostButton} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            Release
          </button>
        </div>
      </div>
    </section>
  );
}
