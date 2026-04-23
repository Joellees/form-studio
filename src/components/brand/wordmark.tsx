import { cn } from "@/lib/utils";

type WordmarkProps = {
  /**
   * - `stacked`: Trainer's name big, "Form Studio" suffix below in Fraunces moss
   * - `inline`: One-line — trainer name in sans + "Form Studio" in Fraunces moss
   * - `inline-platform`: "Form Studio" only (marketing site)
   *
   * Typographic rule: "Form Studio" stays in Fraunces; the trainer name
   * is General Sans, mixed case (not uppercased).
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
    // Match "Form Studio" visually: same size, aligned on baseline, just
    // a different typeface for the possessive. No caps, no tight tracking.
    return (
      <span className={cn("inline-flex items-baseline gap-[0.4em] leading-none", className)}>
        <span className="text-[22px] font-medium tracking-tight text-[color:var(--color-ink)]">
          {name ? `${name}\u2019s` : "Your"}
        </span>
        <span className="font-display text-[22px] text-[color:var(--color-moss)]">Form Studio</span>
      </span>
    );
  }

  // Stacked — public studio page hero
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="text-[clamp(2.5rem,5vw,3.25rem)] font-semibold tracking-tight leading-[1.05] text-[color:var(--color-ink)]">
        {name ? `${name}\u2019s` : "Your"}
      </span>
      <span className="font-display text-[clamp(1.75rem,3.5vw,2.25rem)] leading-none text-[color:var(--color-moss)]">
        Form Studio
      </span>
    </div>
  );
}
