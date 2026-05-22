import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The platform's single page-header primitive.
 *
 * The calendar page set the canonical shape:
 *
 *   eyebrow         (optional · tabular-quiet)
 *   PRIMARY TITLE   (text-3xl md:text-4xl semibold tracking-tight)
 *   subtitle line   (optional · stone · text-xs md:text-[13px])
 *                                                  [actions cluster]
 *
 * Before this primitive every page rolled its own header inline with
 * subtle drift — different eyebrow colors, different H1 sizes,
 * different gap rules between title and subtitle, sometimes a
 * `font-display` flourish where the brand doesn't call for one. The
 * drift made the platform feel like a stack of pages instead of one
 * coherent product. Standardising here keeps the calendar's polish
 * everywhere else without each route having to opt back into it.
 *
 * Voice rules (from CLAUDE.md):
 *   - lowercase-comfortable across all chrome
 *   - the eyebrow carries semantic color: MOSS for type/identity
 *     labels (e.g. "client", "workout", "session"), STONE for date
 *     or quantity data (e.g. "2026", "8 of 12")
 *   - Fraunces (`font-display`) is opt-in via the `displayTitle` prop
 *     and reserved for very major marketing headlines (the dashboard
 *     greeting; the trainer-profile masthead). Every other H1 uses
 *     General Sans.
 *
 * Responsive shape: title block on top + actions wrapping below at
 * mobile widths, title left + actions right at md+. Packing them on
 * one line at < 425px breaks the H1 across two lines OR truncates
 * the actions; splitting deliberately gives the heading room.
 */

export type PageHeaderProps = {
  /**
   * Optional eyebrow line above the title. Pass a string ("client"),
   * a number/date ("2026"), or any React node (e.g. a Badge wrapped
   * in plain text). Omit for pages where the H1 alone identifies the
   * surface.
   */
  eyebrow?: React.ReactNode;
  /**
   * Eyebrow color. Defaults to `moss` for entity-type labels;
   * `stone` (tabular-nums) is the right pick for dates / counts.
   */
  eyebrowTone?: "moss" | "stone";
  /** The primary H1 — string or JSX. */
  title: React.ReactNode;
  /**
   * Opt in to Fraunces display for the H1. Reserved for very major
   * marketing headlines — dashboard greeting, trainer-profile
   * masthead. Defaults to the standard sans H1.
   */
  displayTitle?: boolean;
  /**
   * Subtitle line below the title — typically a tabular count or a
   * tz / date hint. Long-form text belongs in the body, not here.
   */
  subtitle?: React.ReactNode;
  /**
   * Right-side action cluster. Wrap multiple buttons in a fragment;
   * the component handles spacing.
   */
  actions?: React.ReactNode;
  /**
   * Optional extra content rendered BELOW the actions row (still
   * inside the header block). Used by detail pages that want to
   * surface badges or a tiny inline note (e.g. note-to-trainer
   * blockquote) without forcing a separate section.
   */
  children?: React.ReactNode;
  /** Optional wrapper class — for spacing tweaks at the call site. */
  className?: string;
};

export function PageHeader({
  eyebrow,
  eyebrowTone = "moss",
  title,
  displayTitle = false,
  subtitle,
  actions,
  children,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "space-y-3 md:flex md:flex-wrap md:items-end md:justify-between md:gap-4 md:space-y-0",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p
            className={cn(
              "text-xs font-medium uppercase tracking-[0.26em]",
              eyebrowTone === "stone"
                ? "text-[color:var(--color-stone)] tabular-nums"
                : "text-[color:var(--color-moss)]",
            )}
          >
            {eyebrow}
          </p>
        ) : null}
        <h1
          className={cn(
            "leading-tight tracking-tight text-[color:var(--color-ink)]",
            displayTitle
              ? "font-display text-2xl md:text-3xl"
              : "text-3xl font-semibold md:text-4xl",
            eyebrow ? "mt-1 md:mt-1.5" : "mt-0",
          )}
        >
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1.5 text-xs text-[color:var(--color-stone)] md:text-[13px]">
            {subtitle}
          </p>
        ) : null}
        {children ? (
          /* Slot for inline header extras (badges row, short
           * notes). Lives in the title column so it shares the
           * left-aligned baseline with the H1; the actions cluster
           * stays on the right. */
          <div className="mt-3 md:mt-4">{children}</div>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
