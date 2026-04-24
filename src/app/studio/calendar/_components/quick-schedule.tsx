"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { scheduleSession } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type ClientOpt = {
  id: string;
  displayName: string;
  // Active blocks available to draw a session from
  activeBlocks: {
    id: string;
    packageName: string;
    sessionsRemaining: number;
    sessionCount: number;
  }[];
};

type WorkoutOpt = { id: string; name: string };
type SessionType = "in_person" | "zoom" | "in_app";

type Props = {
  isoDate: string;     // yyyy-MM-dd (trainer tz)
  dayLabel: string;    // "Mon, Apr 28"
  clients: ClientOpt[];
  workouts: WorkoutOpt[];
  onClose: () => void;
};

/**
 * Minimal "Google-Calendar-style" quick add. Picks client + type + time,
 * optionally a pre-built workout. Shows the client&rsquo;s active block inline
 * so the trainer sees how many sessions are left without hunting for it.
 */
export function QuickSchedule({ isoDate, dayLabel, clients, workouts, onClose }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [type, setType] = useState<SessionType>("in_person");
  const [time, setTime] = useState("09:00");
  const [workoutId, setWorkoutId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const client = clients.find((c) => c.id === clientId);
  const activeBlock = client?.activeBlocks[0];

  function save() {
    if (!clientId) {
      setError("Pick a client.");
      return;
    }
    setError(null);
    const localIso = `${isoDate}T${time}:00`;
    startTransition(async () => {
      const result = await scheduleSession({
        clientId,
        scheduledAt: new Date(localIso).toISOString(),
        durationMinutes: 60,
        sessionType: type,
        templateId: workoutId || null,
        zoomUrl: null,
        name: null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

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
          schedule
        </p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight">{dayLabel}</h2>

        <div className="mt-5 flex flex-col gap-4">
          {clients.length === 0 ? (
            <p className="rounded-2xl bg-[color:var(--color-parchment)] px-4 py-3 text-sm text-[color:var(--color-ink)]/75">
              Add a client first.
            </p>
          ) : (
            <Row label="client">
              <Select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                autoFocus
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName}
                  </option>
                ))}
              </Select>
              {activeBlock ? (
                <p className="mt-1 text-xs text-[color:var(--color-stone)]">
                  {activeBlock.packageName} ·{" "}
                  <span className="tabular-nums text-[color:var(--color-ink)]/70">
                    session {activeBlock.sessionCount - activeBlock.sessionsRemaining + 1} of{" "}
                    {activeBlock.sessionCount}
                  </span>
                </p>
              ) : client ? (
                <p className="mt-1 text-xs text-[color:var(--color-stone)]">no active block</p>
              ) : null}
            </Row>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Row label="time">
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </Row>
            <Row label="type">
              <Select
                value={type}
                onChange={(e) => setType(e.target.value as SessionType)}
              >
                <option value="in_person">in person</option>
                <option value="zoom">zoom</option>
                <option value="in_app">in app</option>
              </Select>
            </Row>
          </div>

          {workouts.length > 0 ? (
            <Row label="workout (optional)">
              <Select value={workoutId} onChange={(e) => setWorkoutId(e.target.value)}>
                <option value="">no workout</option>
                {workouts.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </Select>
            </Row>
          ) : null}

          {error ? <p className="text-xs text-[color:var(--color-sienna)]">{error}</p> : null}
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            cancel
          </Button>
          <Button
            type="button"
            onClick={save}
            disabled={pending || clients.length === 0}
          >
            {pending ? "adding…" : "add session"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
