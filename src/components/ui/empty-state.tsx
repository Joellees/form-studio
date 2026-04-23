import * as React from "react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  title: string;
  body?: string;
  action?: React.ReactNode;
  className?: string;
  /**
   * When true, renders a dashed-border container. Use only at the top
   * level (never inside a Card — that produces ugly card-in-card).
   * Default is flat: just title + body + action, inheriting the parent
   * container&rsquo;s background.
   */
  bordered?: boolean;
};

export function EmptyState({ title, body, action, className, bordered = false }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-3",
        bordered && "rounded-3xl border border-dashed border-[color:var(--color-stone-soft)] px-8 py-10",
        !bordered && "py-2",
        className,
      )}
    >
      <h3 className="text-base font-semibold tracking-tight text-[color:var(--color-ink)]">{title}</h3>
      {body ? <p className="max-w-lg text-sm text-[color:var(--color-ink)]/70">{body}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
