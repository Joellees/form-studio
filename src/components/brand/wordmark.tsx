import { cn } from "@/lib/utils";

type WordmarkProps = {
  /**
   * - `stacked`: Trainer possessive on top ("Joelle&rsquo;s"), "Form Studio" suffix below
   * - `inline`: One-line with "Form Studio" in moss accent — used in nav bars
   * - `inline-platform`: For the marketing site, where no trainer name exists
   */
  variant?: "stacked" | "inline" | "inline-platform";
  /** The trainer&rsquo;s first name. Not needed for `inline-platform`. */
  name?: string;
  className?: string;
};

export function Wordmark({ variant = "inline-platform", name, className }: WordmarkProps) {
  if (variant === "inline-platform") {
    return (
      <span className={cn("font-display text-[22px] leading-none", className)}>
        <span className="text-[color:var(--color-ink)]">Form</span>{" "}
        <span className="text-[color:var(--color-moss)]">Studio</span>
      </span>
    );
  }

  if (variant === "inline") {
    return (
      <span className={cn("font-display text-[22px] leading-none", className)}>
        <span
          className="text-[color:var(--color-ink)]"
          style={{ fontVariationSettings: '"SOFT" 40, "opsz" 144, "wght" 400', letterSpacing: "-0.028em" }}
        >
          {name ? `${name}\u2019s` : "Your"}
        </span>{" "}
        <span className="text-[color:var(--color-moss)]">Form Studio</span>
      </span>
    );
  }

  // Stacked — used on the public studio page hero
  return (
    <div className={cn("flex flex-col", className)}>
      <span
        className="font-display text-[clamp(2.75rem,5.5vw,3.5rem)] leading-[0.95] text-[color:var(--color-ink)]"
        style={{ fontVariationSettings: '"SOFT" 40, "opsz" 144, "wght" 400', letterSpacing: "-0.028em" }}
      >
        {name ? `${name}\u2019s` : "Your"}
      </span>
      <span className="mt-2 text-[11px] font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">
        Form Studio
      </span>
    </div>
  );
}
