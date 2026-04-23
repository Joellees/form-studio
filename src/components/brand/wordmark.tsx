import { cn } from "@/lib/utils";

type WordmarkProps = {
  /**
   * - `stacked`: Trainer name on top (sans-serif uppercase), "Form Studio" suffix below in Fraunces moss
   * - `inline`: One-line — trainer name sans-serif + "Form Studio" Fraunces moss
   * - `inline-platform`: "Form Studio" only (marketing site)
   *
   * Typographic rule: "Form Studio" is the only remaining Fraunces usage
   * (except very major headlines). Everything else — trainer names,
   * titles, body — is General Sans.
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
      <span className={cn("inline-flex items-baseline gap-2 leading-none", className)}>
        <span className="text-[15px] font-semibold uppercase tracking-[0.14em] text-[color:var(--color-ink)]">
          {name ? `${name}\u2019s` : "Your"}
        </span>
        <span className="font-display text-[22px] text-[color:var(--color-moss)]">Form Studio</span>
      </span>
    );
  }

  // Stacked — used on the public studio page hero
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <span className="text-[clamp(2rem,4.5vw,2.75rem)] font-bold uppercase tracking-[0.04em] leading-[1.05] text-[color:var(--color-ink)]">
        {name ? `${name}\u2019s` : "Your"}
      </span>
      <span className="font-display text-[clamp(1.5rem,3vw,2rem)] leading-none text-[color:var(--color-moss)]">
        Form Studio
      </span>
    </div>
  );
}
