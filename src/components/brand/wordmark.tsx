import { cn } from "@/lib/utils";

type WordmarkProps = {
  variant?: "stacked" | "inline" | "inline-platform";
  name?: string;
  className?: string;
};

export function Wordmark({ variant = "inline-platform", name, className }: WordmarkProps) {
  if (variant === "inline-platform") {
    return (
      <span
        className={cn(
          "font-display text-[22px] leading-none text-[color:var(--color-moss)] md:text-[26px]",
          className,
        )}
      >
        Form Studio
      </span>
    );
  }

  if (variant === "inline") {
    return (
      <span
        className={cn(
          "inline-flex items-baseline gap-[0.3em] leading-none whitespace-nowrap",
          className,
        )}
      >
        <span className="text-[18px] font-semibold tracking-[-0.02em] text-[color:var(--color-ink)] md:text-[24px]">
          {name ? `${name}\u2019s` : "Your"}
        </span>
        <span className="font-display text-[18px] text-[color:var(--color-moss)] md:text-[24px]">
          Form Studio
        </span>
      </span>
    );
  }

  // Stacked — hero on public studio page only
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="text-[clamp(2.75rem,5.5vw,3.75rem)] font-semibold tracking-[-0.02em] leading-[1] text-[color:var(--color-ink)]">
        {name ? `${name}\u2019s` : "Your"}
      </span>
      <span className="font-display text-[clamp(2.75rem,5.5vw,3.75rem)] leading-[1] text-[color:var(--color-moss)]">
        Form Studio
      </span>
    </div>
  );
}
