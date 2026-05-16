"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { scheduleSession } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { FEATURES } from "@/lib/features";
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
    /**
     * Default session delivery for this package — derived from the
     * package&rsquo;s `delivery_method` (in_person or online). Trainer
     * can still flip it per-session via the type dropdown.
     */
    defaultSessionType: "in_person" | "zoom";
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
  /* Default to "zoom" (online). The previous default was "in_person";
   * we no longer offer in-person as a new-session option — only
   * legacy sessions with `session_type = 'in_person'` keep displaying
   * their stored value. `prettySessionType()` still labels them as
   * "in person" for display, and the inline editors keep an
   * in-person option visible only when the row's current value is
   * already in-person (see `session-row.tsx`). */
  const [type, setType] = useState<SessionType>("zoom");
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

  // When the trainer picks a different client, default the session
  // type to whatever their package locked in — unless the package
  // says in-person. In-person is no longer offered as a new-session
  // option (trainer feedback: not a daily-driver path), so a
  // package configured for in_person now falls through to "zoom".
  // The package's delivery_method is unchanged in the DB.
  useEffect(() => {
    if (!activeBlock) return;
    setType(activeBlock.defaultSessionType === "in_person" ? "zoom" : activeBlock.defaultSessionType);
  }, [activeBlock]);

  function save() {
    if (!clientId) {
      setError("Pick a client.");
      return;
    }
    if (type === "in_app" && !workoutId) {
      setError("In-app sessions need a workout — pick one before scheduling.");
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
      className="fixed inset-0 z-50 flex items-end justify-center bg-[color:var(--color-ink)]/40 p-0 md:items-center md:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          // Mobile: full-width bottom sheet, generous bottom padding
          // for thumb reach. Desktop: floating card.
          "w-full max-w-md bg-[color:var(--color-canvas)] p-5 shadow-[0_24px_64px_-12px_rgba(31,30,27,0.35)]",
          "rounded-t-3xl pb-7 md:rounded-3xl md:p-6 md:pb-6",
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

          <div className="grid gap-3 sm:grid-cols-2">
            <Row label="time">
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </Row>
            <Row label="type">
              <Select
                value={type}
                onChange={(e) => setType(e.target.value as SessionType)}
              >
                {/* "in_person" removed from the new-session picker per
                  * trainer feedback. Legacy sessions with that value
                  * still display as "in person" everywhere (see
                  * `prettySessionType`); the inline edit on existing
                  * cards keeps an in-person option visible only while
                  * the current value is in-person. */}
                <option value="zoom">online</option>
                {/* in-app option gated by FEATURES.IN_APP_SESSIONS — see lib/features.ts */}
                {FEATURES.IN_APP_SESSIONS ? (
                  <option value="in_app">in-app</option>
                ) : null}
              </Select>
              {type === "in_app" && client ? (
                <p className="mt-1 text-xs text-[color:var(--color-ink)]/65">
                  Trainer-pushed — deducts 1 from {client.displayName}&rsquo;s package count.
                </p>
              ) : null}
            </Row>
          </div>

          {workouts.length > 0 ? (
            <Row label={type === "in_app" ? "workout" : "workout (optional)"}>
              <Select value={workoutId} onChange={(e) => setWorkoutId(e.target.value)}>
                <option value="">{type === "in_app" ? "pick a workout" : "no workout"}</option>
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

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={pending}
            className="w-full sm:w-auto"
          >
            cancel
          </Button>
          <Button
            type="button"
            onClick={save}
            disabled={pending || clients.length === 0}
            className="w-full sm:w-auto"
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
