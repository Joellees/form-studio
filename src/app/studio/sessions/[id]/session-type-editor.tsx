"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { updateSessionType } from "@/app/studio/calendar/actions";
import { FEATURES } from "@/lib/features";
import { prettySessionType } from "@/lib/session-type";

type Type = "in_person" | "zoom" | "in_app";

/**
 * Session-type control on the session-detail page.
 *
 * Renders a dropdown when the type IS editable (default case), or a
 * static badge when it isn't — the trainer asked us to not show a
 * dropdown affordance for something that can't actually be changed
 * (e.g. a cancelled session). The visual treatment is the same
 * parchment pill either way; the only difference is whether it has
 * a chevron and accepts clicks.
 *
 * The `disabled` prop drives the static-badge fallback. Currently
 * the only caller passes `disabled={status === "cancelled"}` but
 * the gate is generic — `disabled` also fires for any future state
 * we want locked.
 */
export function SessionTypeEditor({
  sessionId,
  initialType,
  disabled,
}: {
  sessionId: string;
  initialType: Type;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState<Type>(initialType);
  const [pending, startTransition] = useTransition();

  /* Static badge when not actionable. No chevron, no dropdown, no
   * hover state — just the label rendered with the same chrome the
   * editable pill uses so the badge sits in the same shape on the
   * page. */
  if (disabled) {
    return (
      <span className="inline-flex h-7 items-center rounded-full bg-[color:var(--color-parchment)] px-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-[color:var(--color-ink)]/70">
        {prettySessionType(value)}
      </span>
    );
  }

  return (
    <select
      aria-label="session type"
      value={value}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value as Type;
        setValue(next);
        startTransition(async () => {
          await updateSessionType({ sessionId, sessionType: next });
          router.refresh();
        });
      }}
      className="appearance-none cursor-pointer rounded-full bg-[color:var(--color-parchment)] py-1 pl-4 pr-8 text-[11px] font-semibold uppercase tracking-[0.1em] text-[color:var(--color-ink)] transition-colors hover:bg-[color:var(--color-stone-soft)] focus-visible:outline-none disabled:opacity-60"
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><path fill='none' stroke='%231F1E1B' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round' d='M4 6.5l4 4 4-4'/></svg>\")",
        backgroundPosition: "right 10px center",
        backgroundSize: "10px",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* In-person is no longer offered for new selections; the
        * option only renders while the current value is in-person
        * so legacy session rows still display correctly. Flipping
        * to "online" removes the option on the next render. */}
      {value === "in_person" ? <option value="in_person">in person</option> : null}
      <option value="zoom">online</option>
      {/* in-app option gated by FEATURES.IN_APP_SESSIONS — see lib/features.ts */}
      {FEATURES.IN_APP_SESSIONS ? (
        <option value="in_app">in-app</option>
      ) : null}
    </select>
  );
}
