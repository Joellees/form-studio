/**
 * Quiet single-line banner at the top of /studio/* surfaces during
 * the last 24 hours of a Beta 2 trial.
 *
 * The studio layout only renders this when `trialState(trainer)`
 * reports the trial is still active AND hoursRemaining ≤ 24, so by
 * the time we're rendering we already know there's something useful
 * to show. The component itself is presentational.
 *
 * Visual intent (per spec):
 *   - parchment background — same warm beige used on Notes blocks,
 *     deliberately NOT yellow/red. Reads as a quiet aside, not an
 *     alarm.
 *   - no border, no shadow
 *   - single line of copy with the countdown inline
 *   - "Subscribe →" link opens WhatsApp with the monthly-plan prefill
 *     pattern used on /studio/expired, since the trainer hasn't
 *     picked a cadence yet
 *
 * The countdown updates on each page render — no live ticker. The
 * spec calls this out as fine: a refresh shows fresh hours.
 *
 * Renders inside StudioShell, so it sits below the shell's nav and
 * above the page's own content.
 */

const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "971507305023";

export function TrialBanner({
  hoursRemaining,
  firstName,
}: {
  hoursRemaining: number;
  firstName: string;
}) {
  const message =
    `Hello Form Studio, I'd like to activate my monthly plan ($29 / AED 109). ` +
    `Thanks! — ${firstName}`;
  const waUrl = `https://wa.me/${WHATSAPP_NUMBER.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(
    message,
  )}`;
  /* "hour" vs "hours" — pluralise on >1. At 1h or less we still say
   * "1 hour" rather than the count flickering to 0 mid-final-window. */
  const safeHours = Math.max(1, hoursRemaining);
  const hourLabel = safeHours === 1 ? "hour" : "hours";

  return (
    <div className="mb-4 rounded-2xl bg-[color:var(--color-parchment)] px-4 py-2.5 text-sm text-[color:var(--color-ink)]/75 md:mb-6">
      <span>
        Your trial ends in{" "}
        <span className="font-medium text-[color:var(--color-ink)] tabular-nums">
          {safeHours} {hourLabel}
        </span>
        {" — "}
      </span>
      <a
        href={waUrl}
        target="_blank"
        rel="noreferrer"
        className="font-medium text-[color:var(--color-moss-deep)] underline underline-offset-4 hover:text-[color:var(--color-ink)]"
      >
        Subscribe →
      </a>
    </div>
  );
}
