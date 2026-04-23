import { cn } from "@/lib/utils";

type WordmarkProps = {
  /**
   * - `stacked`: trainer name big + "Form Studio" suffix below (hero only)
   * - `inline`: one-line — trainer name as a small prefix, "Form Studio" as the logotype
   * - `inline-platform`: "Form Studio" only, for marketing
   *
   * Design rule: "Form Studio" is the logotype and the visual anchor.
   * The trainer possessive is a quiet prefix — lighter, smaller, dimmer —
   * so the two feel like "Joelle's [logo]" instead of two equal words.
   */
  variant?: "stacked" | "inline" | "inline-platform";
  name?: string;
  className?: string;
};

export function Wordmark({ variant = "inline-platform", name, className }: WordmarkProps) {
  if (variant === "inline-platform") {
    return (
      <span
        className={cn("font-display text-[22px] leading-none text-[color:var(--color-moss)]", className)}
      >
        Form Studio
      </span>
    );
  }

  if (variant === "inline") {
    return (
      <span className={cn("inline-flex items-baseline gap-[0.45em] leading-none", className)}>
        <span className="text-[13px] font-normal tracking-tight text-[color:var(--color-ink)]/55">
          {name ? `${name}\u2019s` : "Your"}
        </span>
        <span className="font-display text-[22px] text-[color:var(--color-moss)]">Form Studio</span>
      </span>
    );
  }

  // Stacked — public studio page hero only
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <span className="text-[clamp(1rem,1.8vw,1.25rem)] font-normal tracking-tight text-[color:var(--color-ink)]/55">
        {name ? `${name}\u2019s` : "Your"}
      </span>
      <span className="font-display text-[clamp(2.75rem,5.5vw,3.5rem)] leading-none text-[color:var(--color-moss)]">
        Form Studio
      </span>
    </div>
  );
}
