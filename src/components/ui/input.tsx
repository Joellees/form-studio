import * as React from "react";

import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = "text", ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-11 w-full rounded-full border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] px-5 text-sm text-[color:var(--color-ink)] transition-colors placeholder:text-[color:var(--color-stone)] focus-visible:border-[color:var(--color-ink)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, rows = 4, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        "flex w-full rounded-2xl border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] px-5 py-3 text-sm text-[color:var(--color-ink)] transition-colors placeholder:text-[color:var(--color-stone)] focus-visible:border-[color:var(--color-ink)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";
