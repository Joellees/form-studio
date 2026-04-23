import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold tracking-wide transition-all focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Primary is near-black ink on canvas text — deliberately high
        // contrast so buttons read as actionable, not decorative.
        primary:
          "bg-[color:var(--color-ink)] text-[color:var(--color-canvas)] shadow-[0_1px_0_rgba(31,30,27,0.15),0_6px_18px_-8px_rgba(31,30,27,0.35)] hover:bg-[color:var(--color-moss-deep)] active:translate-y-[0.5px]",
        secondary:
          "border border-[color:var(--color-ink)] bg-transparent text-[color:var(--color-ink)] hover:bg-[color:var(--color-ink)] hover:text-[color:var(--color-canvas)]",
        outline:
          "border-2 border-[color:var(--color-ink)]/80 bg-transparent text-[color:var(--color-ink)] hover:border-[color:var(--color-ink)] hover:bg-[color:var(--color-ink)]/5",
        ghost:
          "bg-transparent text-[color:var(--color-ink)] hover:bg-[color:var(--color-parchment)]",
        danger:
          "bg-[color:var(--color-sienna)] text-[color:var(--color-canvas)] shadow-[0_1px_0_rgba(31,30,27,0.15),0_6px_18px_-8px_rgba(168,70,31,0.4)] hover:bg-[color:var(--color-sienna)]/90",
        link: "text-[color:var(--color-moss-deep)] underline underline-offset-4 hover:text-[color:var(--color-ink)]",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        md: "h-10 px-5",
        lg: "h-12 px-7 text-[15px]",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { buttonVariants };
