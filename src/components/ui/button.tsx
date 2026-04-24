import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold tracking-tight transition-all focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-[color:var(--color-ink)] text-[color:var(--color-canvas)] shadow-[0_1px_0_rgba(31,30,27,0.2),0_8px_24px_-10px_rgba(31,30,27,0.45)] hover:bg-[color:var(--color-moss-deep)] hover:shadow-[0_1px_0_rgba(31,30,27,0.25),0_12px_28px_-10px_rgba(31,30,27,0.55)] active:translate-y-[0.5px]",
        secondary:
          "bg-[color:var(--color-parchment)] text-[color:var(--color-ink)] hover:bg-[color:var(--color-stone-soft)]",
        outline:
          "border-[1.5px] border-[color:var(--color-ink)] bg-transparent text-[color:var(--color-ink)] hover:bg-[color:var(--color-ink)] hover:text-[color:var(--color-canvas)]",
        ghost:
          "bg-transparent text-[color:var(--color-ink)] hover:bg-[color:var(--color-parchment)]",
        danger:
          "bg-[color:var(--color-sienna)] text-[color:var(--color-canvas)] shadow-[0_1px_0_rgba(31,30,27,0.2),0_8px_22px_-10px_rgba(168,70,31,0.55)] hover:bg-[color:var(--color-sienna)]/92",
        link: "text-[color:var(--color-moss-deep)] underline underline-offset-4 hover:text-[color:var(--color-ink)]",
      },
      size: {
        sm: "h-8 px-4 text-[13px]",
        md: "h-10 px-6",
        lg: "h-12 px-8 text-[15px]",
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
