import * as React from "react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  title: string;
  body?: string;
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({ title, body, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-4 rounded-3xl border border-dashed border-[color:var(--color-stone-soft)] bg-[color:var(--color-parchment)]/40 px-8 py-10",
        className,
      )}
    >
      <h3 className="text-lg font-semibold tracking-tight text-[color:var(--color-ink)]">{title}</h3>
      {body ? <p className="max-w-lg text-sm text-[color:var(--color-ink)]/75">{body}</p> : null}
      {action}
    </div>
  );
}
