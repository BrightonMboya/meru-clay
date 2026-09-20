import { Head, Screen } from '@/components/admin/ui';

/**
 * Takings — not drawn yet.
 *
 * The sidebar links here because the Paper file's sidebar does, but there is
 * no Takings artboard to build from. Rather than leave a nav row that 404s,
 * this says so. Delete the whole file when the screen is designed.
 *
 * The numbers it will need already exist: `deskDay()` in src/lib/admin/desk.ts
 * computes the day's money, and `src/lib/pricing.ts` is the price list.
 */
export default function TakingsPage() {
  return (
    <Screen>
      <Head
        title="Takings"
        blurb="What the courts and the classes brought in, and what is still owed."
      />
      <div className="flex max-w-[520px] flex-col gap-3 border-t border-neutral-200 pt-7">
        <p className="text-[15px] leading-[23px] text-neutral-600">
          This screen has not been designed yet. The court desk shows today&rsquo;s money in the
          meantime — what was taken, and who has not paid.
        </p>
      </div>
    </Screen>
  );
}
