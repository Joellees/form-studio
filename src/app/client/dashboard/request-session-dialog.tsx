"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { requestSession } from "@/app/studio/calendar/actions";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Props = {
  onClose: () => void;
  defaultType?: "in_person" | "zoom" | "in_app";
  title?: string;
  description?: string;
};

/**
 * Client-initiated request. Goes into the sessions table with
 * status=requested; the trainer sees it in their calendar and can
 * approve or decline from the ⋯ menu. Defaulting to in_app lets a
 * client quickly ask for a home workout.
 */
export function RequestSessionDialog({
  onClose,
  defaultType = "in_app",
  title = "Request a session",
  description = "Pick a day and time. Your trainer will confirm or suggest another slot.",
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [when, setWhen] = useState(() => defaultDateTime());
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await requestSession({
        scheduledAt: new Date(when).toISOString(),
        durationMinutes: 60,
        sessionType: defaultType,
        notes: notes || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  const isInApp = defaultType === "in_app";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[color:var(--color-ink)]/40 p-4 md:items-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "w-full max-w-md rounded-3xl bg-[color:var(--color-canvas)] p-6 shadow-[0_24px_64px_-12px_rgba(31,30,27,0.35)]",
          pending && "opacity-80",
        )}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-moss)]">
          request
        </p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-2 text-sm text-[color:var(--color-ink)]/70">{description}</p>

        {isInApp ? (
          <p className="mt-3 rounded-2xl bg-[color:var(--color-parchment)] px-4 py-3 text-xs text-[color:var(--color-ink)]/75">
            In-app sessions are <strong>$5 extra</strong> on top of your block. You&rsquo;ll see the
            full workout (sets, reps, videos) here when your trainer sends it over.
          </p>
        ) : null}

        <div className="mt-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>when</Label>
            <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>note (optional)</Label>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything your trainer should know — e.g. 'upper body today', 'feeling off'."
            />
          </div>
          {error ? <p className="text-xs text-[color:var(--color-sienna)]">{error}</p> : null}
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            cancel
          </Button>
          <Button type="button" onClick={save} disabled={pending}>
            {pending ? "sending…" : "send request"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function defaultDateTime(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
}
