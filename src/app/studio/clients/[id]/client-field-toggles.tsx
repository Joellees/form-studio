"use client";

import { useState, useTransition } from "react";

import { updateClientFields } from "./actions";
import { cn } from "@/lib/utils";

type Fields = {
  weight: boolean;
  cycle: boolean;
  measurements: boolean;
  progress_photos: boolean;
  mood: boolean;
  sleep: boolean;
  prs: boolean;
};

const LABELS: Record<keyof Fields, string> = {
  weight: "Weight",
  cycle: "Cycle",
  measurements: "Measurements",
  progress_photos: "Progress photos",
  mood: "Mood",
  sleep: "Sleep",
  prs: "Personal records",
};

export function ClientFieldToggles({ clientId, initial }: { clientId: string; initial: Fields }) {
  const [state, setState] = useState(initial);
  const [pending, startTransition] = useTransition();

  function toggle(key: keyof Fields) {
    const next = { ...state, [key]: !state[key] };
    setState(next);
    startTransition(async () => {
      await updateClientFields({ clientId, fields: next });
    });
  }

  return (
    <div className="flex flex-col divide-y divide-[color:var(--color-stone-soft)]">
      {(Object.keys(LABELS) as (keyof Fields)[]).map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => toggle(key)}
          className="flex items-center justify-between py-3 text-left text-sm"
          aria-pressed={state[key]}
        >
          <span>{LABELS[key]}</span>
          <span
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
              state[key] ? "bg-[color:var(--color-moss)]" : "bg-[color:var(--color-stone-soft)]",
              pending && "opacity-80",
            )}
          >
            <span
              className={cn(
                "inline-block h-4 w-4 rounded-full bg-[color:var(--color-canvas)] transition-transform",
                state[key] ? "translate-x-4" : "translate-x-0.5",
              )}
            />
          </span>
        </button>
      ))}
    </div>
  );
}
