"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { logCycle, requestExtraInAppSession } from "./actions";
import { RequestSessionDialog } from "./dashboard/request-session-dialog";
import { cancelSession } from "@/app/studio/calendar/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EXTRA_INAPP_PRICE_USD } from "@/lib/pricing";
import { prettySessionType } from "@/lib/session-type";
import { cn } from "@/lib/utils";

type Session = {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  session_type: "in_person" | "zoom" | "in_app";
  in_app_origin: "trainer_pushed" | "client_requested" | null;
  in_app_surcharge_paid: boolean | null;
  status: "scheduled" | "completed" | "cancelled" | "requested" | "declined";
  name: string | null;
  zoom_url: string | null;
  notes: string | null;
  formattedWhen: string;
  formattedDay: string;
  /**
   * Computed server-side from the trainer-tz cutoff. False once we
   * cross into the day of the session — the server will also reject
   * the cancel, so this is purely UI affordance.
   */
  canCancel: boolean;
};

type Props = {
  upcoming: Session[];
  past: Session[];
  cycleEnabled: boolean;
};

/**
 * The calendar section is the only working surface on the client
 * portal — every action a client can take in v1 lives on a session
 * row or in this section&rsquo;s header.
 *
 * Two distinct request flows live in the header:
 *  - "request session" — books a slot from the existing package
 *    (in-person/zoom, deducts on approval)
 *  - "request extra workout · $3" — out-of-package, one-off in-app
 *    workout the trainer prescribes; charges $3 and does NOT deduct
 *    from the package count
 */
export function CalendarSection({ upcoming, past, cycleEnabled }: Props) {
  const [requestOpen, setRequestOpen] = useState(false);
  const [extraOpen, setExtraOpen] = useState(false);
  const [cycleOpen, setCycleOpen] = useState(false);
  const [showPast, setShowPast] = useState(false);

  return (
    <section className="space-y-4">
      <header className="space-y-3 md:flex md:flex-wrap md:items-end md:justify-between md:gap-3 md:space-y-0">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
            calendar
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">
            Your sessions.
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {cycleEnabled ? (
            <Button size="sm" variant="outline" onClick={() => setCycleOpen(true)}>
              log cycle
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => setExtraOpen(true)}>
            extra workout · ${EXTRA_INAPP_PRICE_USD}
          </Button>
          <Button size="sm" onClick={() => setRequestOpen(true)}>
            request session
          </Button>
        </div>
      </header>

      {upcoming.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-[color:var(--color-stone-soft)] px-6 py-10 text-center">
          <p className="text-sm font-semibold">Nothing scheduled.</p>
          <p className="mt-1 text-sm text-[color:var(--color-ink)]/70">
            Tap <span className="font-medium">request session</span> when you want to train.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {upcoming.map((s) => (
            <SessionItem key={s.id} session={s} />
          ))}
        </ul>
      )}

      {past.length > 0 ? (
        <div className="pt-3">
          <button
            type="button"
            onClick={() => setShowPast((v) => !v)}
            className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)] hover:text-[color:var(--color-moss-deep)]"
          >
            {showPast ? "hide past" : `show past (${past.length})`}
          </button>
          {showPast ? (
            <ul className="mt-3 space-y-2">
              {past.slice(0, 12).map((s) => (
                <SessionItem key={s.id} session={s} muted />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {requestOpen ? (
        <RequestSessionDialog onClose={() => setRequestOpen(false)} />
      ) : null}
      {extraOpen ? <ExtraInAppDialog onClose={() => setExtraOpen(false)} /> : null}
      {cycleOpen ? <CycleDialog onClose={() => setCycleOpen(false)} /> : null}
    </section>
  );
}

function SessionItem({ session: s, muted = false }: { session: Session; muted?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);
  const closed = s.status === "cancelled" || s.status === "completed";
  const isInApp = s.session_type === "in_app";
  // Client-requested in-app sessions are paid out-of-pocket — the
  // package count is unaffected. We tag them so the client can
  // visually distinguish them from trainer-pushed in-app workouts.
  const isExtraInApp = isInApp && s.in_app_origin === "client_requested";

  function onCancel() {
    if (!confirm("Cancel this session?")) return;
    setMenuOpen(false);
    startTransition(async () => {
      const result = await cancelSession({ sessionId: s.id, actor: "client" });
      if (!result.ok) alert(result.error);
      router.refresh();
    });
  }

  return (
    <li
      className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[color:var(--color-parchment)]/70 px-4 py-3 ${
        muted ? "opacity-75" : ""
      }`}
    >
      <div className="min-w-0">
        <p className="text-xs tabular-nums text-[color:var(--color-stone)]">{s.formattedWhen} · {s.duration_minutes} min</p>
        <p className="font-medium">
          {isInApp && s.status !== "cancelled" ? (
            <Link
              href={`/client/sessions/${s.id}`}
              className="hover:text-[color:var(--color-moss-deep)]"
            >
              {s.name ?? "in-app session"}
            </Link>
          ) : (
            <span>{s.name ?? prettySessionType(s.session_type)}</span>
          )}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Badge tone={pillTone(s.status)}>{s.status}</Badge>
          <Badge tone="stone">{prettySessionType(s.session_type)}</Badge>
          {isExtraInApp ? (
            <Badge tone="signal">+${EXTRA_INAPP_PRICE_USD}</Badge>
          ) : null}
          {s.zoom_url ? (
            <a
              href={s.zoom_url}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-[color:var(--color-moss)]"
            >
              join call
            </a>
          ) : null}
        </div>
      </div>

      {!closed ? (
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--color-ink)] hover:bg-[color:var(--color-canvas)]"
            aria-label="session actions"
            disabled={pending}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <circle cx="3" cy="8" r="1.4" fill="currentColor" />
              <circle cx="8" cy="8" r="1.4" fill="currentColor" />
              <circle cx="13" cy="8" r="1.4" fill="currentColor" />
            </svg>
          </button>
          {menuOpen ? (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full z-40 mt-1 min-w-[200px] rounded-2xl border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] p-1 shadow-[0_12px_32px_-8px_rgba(31,30,27,0.25)]">
                {s.canCancel ? (
                  <button
                    type="button"
                    className="block w-full rounded-xl px-3 py-2 text-left text-sm text-[color:var(--color-sienna)] hover:bg-[color:var(--color-parchment)]"
                    onClick={onCancel}
                  >
                    cancel session
                  </button>
                ) : (
                  <div className="rounded-xl px-3 py-2 text-left">
                    <p className="text-sm text-[color:var(--color-ink)]/40 line-through">
                      cancel session
                    </p>
                    <p className="mt-0.5 text-[11px] text-[color:var(--color-stone)]">
                      cutoff was midnight yesterday — message your trainer.
                    </p>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/**
 * Confirm-and-charge modal for client-requested in-app workouts.
 * Distinct from RequestSessionDialog because:
 *   - it always creates a $3 payment record
 *   - it never deducts from the package
 *   - the workout is "to be prescribed by your trainer" — there is no
 *     workout picker on the client side
 */
function ExtraInAppDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [when, setWhen] = useState(() => defaultDateTime());
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await requestExtraInAppSession({
        scheduledAt: new Date(when).toISOString(),
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[color:var(--color-ink)]/40 p-0 md:items-center md:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "w-full max-w-md rounded-t-3xl bg-[color:var(--color-canvas)] p-5 pb-7 shadow-[0_24px_64px_-12px_rgba(31,30,27,0.35)] md:rounded-3xl md:p-6 md:pb-6",
          pending && "opacity-80",
        )}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-moss)]">
          extra workout
        </p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight">
          Request an extra in-app workout
        </h2>
        <p className="mt-2 text-sm text-[color:var(--color-ink)]/70">
          Pick a day and time. Your trainer will prescribe the workout — sets,
          reps, videos — and you&rsquo;ll see it here when it&rsquo;s ready.
        </p>

        <div className="mt-4 rounded-2xl bg-[color:var(--color-parchment)] px-4 py-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-medium">workout cost</span>
            <span className="tabular-nums font-semibold">${EXTRA_INAPP_PRICE_USD}.00</span>
          </div>
          <p className="mt-1 text-xs text-[color:var(--color-ink)]/65">
            Charged on top of your package. Your remaining session count
            won&rsquo;t change.
          </p>
        </div>

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
              placeholder="What kind of workout? e.g. 'upper body, 30 min', 'mobility flow'."
            />
          </div>
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
          <Button type="button" onClick={save} disabled={pending} className="w-full sm:w-auto">
            {pending ? "sending…" : `confirm · $${EXTRA_INAPP_PRICE_USD}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CycleDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [phase, setPhase] = useState<"menstrual" | "follicular" | "ovulation" | "luteal">("follicular");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await logCycle({ phase, notes: notes || null });
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
        className="w-full max-w-sm rounded-t-3xl bg-[color:var(--color-canvas)] p-5 pb-7 shadow-[0_24px_64px_-12px_rgba(31,30,27,0.35)] md:rounded-3xl md:p-6 md:pb-6"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-moss)]">
          cycle
        </p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight">Where are you today?</h2>
        <div className="mt-5 grid grid-cols-2 gap-2">
          {(["menstrual", "follicular", "ovulation", "luteal"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPhase(p)}
              className={`rounded-2xl px-3 py-3 text-sm font-medium transition-colors ${
                phase === p
                  ? "bg-[color:var(--color-ink)] text-[color:var(--color-canvas)]"
                  : "bg-[color:var(--color-parchment)] text-[color:var(--color-ink)] hover:bg-[color:var(--color-parchment)]/70"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="anything else (optional)"
          className="mt-4 w-full rounded-2xl border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] px-4 py-3 text-sm"
        />
        {error ? <p className="mt-2 text-xs text-[color:var(--color-sienna)]">{error}</p> : null}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={pending}
            className="w-full sm:w-auto"
          >
            cancel
          </Button>
          <Button onClick={save} disabled={pending} className="w-full sm:w-auto">
            {pending ? "saving…" : "save"}
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

function pillTone(s: Session["status"]): "moss" | "signal" | "stone" {
  if (s === "scheduled" || s === "completed") return "moss";
  if (s === "requested") return "signal";
  return "stone";
}
