import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em]",
  {
    variants: {
      tone: {
        neutral: "bg-[color:var(--color-parchment)] text-[color:var(--color-ink)]",
        moss: "bg-[color:var(--color-moss)]/10 text-[color:var(--color-moss-deep)]",
        stone: "bg-transparent text-[color:var(--color-stone)] border border-[color:var(--color-stone-soft)]",
        signal: "bg-[color:var(--color-sienna)]/12 text-[color:var(--color-sienna)]",
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
