"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

type ToggleProps = {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  className?: string;
  id?: string;
};

/**
 * iOS-style switch. Replaces plain `<input type=checkbox>` anywhere we
 * want a true on/off affordance.
 */
export function Toggle({ checked, onChange, label, className, id }: ToggleProps) {
  return (
    <label
      className={cn("inline-flex cursor-pointer items-center gap-3 select-none", className)}
      htmlFor={id}
    >
      <span
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-[color:var(--color-ink)]" : "bg-[color:var(--color-stone-soft)]",
        )}
      >
        <input
          id={id}
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-0.5 h-5 w-5 rounded-full bg-[color:var(--color-canvas)] shadow-sm transition-transform",
            checked ? "translate-x-[22px]" : "translate-x-0.5",
          )}
        />
      </span>
      {label ? <span className="text-sm font-medium text-[color:var(--color-ink)]">{label}</span> : null}
    </label>
  );
}
