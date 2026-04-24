"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { updateSessionType } from "@/app/studio/calendar/actions";

type Type = "in_person" | "zoom" | "in_app";

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

  return (
    <select
      aria-label="session type"
      value={value}
      disabled={pending || disabled}
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
      <option value="in_person">in person</option>
      <option value="zoom">zoom</option>
      <option value="in_app">in app</option>
    </select>
  );
}
