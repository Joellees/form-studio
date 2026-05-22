import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The canonical card surface across the platform.
 *
 * Earlier this was a parchment-tinted block (`bg-parchment/70 +
 * backdrop-blur + drop shadow`) — the heaviest object on most
 * pages. The calendar's session blocks proved the calmer
 * alternative reads better: a canvas fill on top of the page's
 * parchment ground with a 1px inset ring carrying the
 * boundary. Same "this is a card" cue, half the visual weight,
 * and contents (chips, type, numbers) stay the focal point.
 *
 * Switching the primitive here propagates the calmer treatment
 * to every Card in the studio — library exercise grid, packages
 * table, sessions detail, client detail, etc.
 */
export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-3xl bg-[color:var(--color-canvas)] ring-1 ring-inset ring-[color:var(--color-ink)]/6 shadow-[0_1px_3px_rgba(31,30,27,0.05)]",
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = "Card";

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col gap-1.5 px-7 pt-7", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

export const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn("text-lg font-semibold leading-tight tracking-tight text-[color:var(--color-ink)]", className)}
      {...props}
    />
  ),
);
CardTitle.displayName = "CardTitle";

export const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-[color:var(--color-ink)]/70", className)} {...props} />
  ),
);
CardDescription.displayName = "CardDescription";

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("px-7 py-7", className)} {...props} />
  ),
);
CardContent.displayName = "CardContent";

export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex items-center gap-3 px-7 pb-7 pt-0", className)}
      {...props}
    />
  ),
);
CardFooter.displayName = "CardFooter";
