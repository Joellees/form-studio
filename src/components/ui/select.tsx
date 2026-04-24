import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Styled native select. Custom chevron sits a proper 16px from the right
 * edge, and the pill shape matches Input. Use anywhere we&rsquo;d reach for
 * a native `<select>`.
 */
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "h-11 w-full appearance-none rounded-full border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] pl-5 pr-10 text-sm text-[color:var(--color-ink)] transition-colors focus-visible:border-[color:var(--color-ink)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60",
        "bg-no-repeat",
        className,
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><path fill='none' stroke='%231F1E1B' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round' d='M4 6.5l4 4 4-4'/></svg>\")",
        backgroundPosition: "right 16px center",
        backgroundSize: "14px",
      }}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = "Select";
