import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]",
  {
    variants: {
      tone: {
        neutral: "bg-[color:var(--color-parchment)] text-[color:var(--color-ink)]",
        moss: "bg-[color:var(--color-moss)] text-[color:var(--color-canvas)]",
        stone: "bg-[color:var(--color-stone-soft)] text-[color:var(--color-ink)]",
        signal: "bg-[color:var(--color-sienna)]/15 text-[color:var(--color-sienna)]",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
