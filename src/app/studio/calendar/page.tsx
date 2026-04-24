import Link from "next/link";

import { SessionRow, type SessionSummary } from "../_components/session-row";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { requireTrainer } from "@/lib/trainer";
import { formatInTz, weekRange } from "@/lib/schedule";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ week?: string }> };

export default async function CalendarPage({ searchParams }: Props) {
  const sp = await searchParams;
  const trainer = await requireTrainer();
  const reference = sp.week ? new Date(sp.week) : new Date();
  const { start, end, days } = weekRange(reference, trainer.timezone);

  const admin = createSupabaseAdminClient();
  const { data: sessions } = await admin
    .from("sessions")
    .select("id, scheduled_at, duration_minutes, session_type, status, name, day_label, clients(display_name)")
    .eq("tenant_id", trainer.id)
    .gte("scheduled_at", start.toISOString())
    .lte("scheduled_at", end.toISOString())
    .order("scheduled_at");

  // Normalize + group by day in trainer timezone
  const byDay = new Map<string, SessionSummary[]>();
  for (const d of days) byDay.set(formatInTz(d, trainer.timezone, "yyyy-MM-dd"), []);
  for (const s of sessions ?? []) {
    const key = formatInTz(new Date(s.scheduled_at), trainer.timezone, "yyyy-MM-dd");
    const clientRel = s.clients as { display_name?: string } | { display_name?: string }[] | null;
    const client = Array.isArray(clientRel) ? clientRel[0] : clientRel;
    byDay.get(key)?.push({
      id: s.id,
      scheduled_at: s.scheduled_at,
      duration_minutes: s.duration_minutes,
      session_type: s.session_type as SessionSummary["session_type"],
      status: s.status as SessionSummary["status"],
      name: s.name,
      client_name: client?.display_name ?? null,
      formatted_time: formatInTz(new Date(s.scheduled_at), trainer.timezone, "HH:mm"),
    });
  }

  return (
    <div className="rise-in-stagger space-y-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">
            calendar
          </p>
          <h1 className="mt-2 text-4xl">This week.</h1>
          <p className="mt-1 text-sm text-[color:var(--color-stone)] tabular-nums">
            {formatInTz(start, trainer.timezone, "MMM d")} —{" "}
            {formatInTz(end, trainer.timezone, "MMM d, yyyy")} · {trainer.timezone}
          </p>
        </div>
        <Button asChild>
          <Link href="/studio/calendar/new">schedule a session</Link>
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-7">
        {days.map((d) => {
          const key = formatInTz(d, trainer.timezone, "yyyy-MM-dd");
          const daysSessions = byDay.get(key) ?? [];
          const isToday =
            formatInTz(new Date(), trainer.timezone, "yyyy-MM-dd") === key;
          return (
            <div
              key={key}
              className="flex min-h-[10rem] flex-col rounded-2xl bg-[color:var(--color-parchment)]/60 p-3"
            >
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
                  {formatInTz(d, trainer.timezone, "EEE")}
                </span>
                <span
                  className={
                    "text-lg font-semibold tabular-nums tracking-tight " +
                    (isToday
                      ? "text-[color:var(--color-ink)]"
                      : "text-[color:var(--color-ink)]/60")
                  }
                >
                  {formatInTz(d, trainer.timezone, "d")}
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                {daysSessions.length === 0 ? (
                  <span className="mt-1 text-xs text-[color:var(--color-stone)]/60">—</span>
                ) : (
                  daysSessions.map((s) => <SessionRow key={s.id} session={s} variant="card" />)
                )}
              </div>
            </div>
          );
        })}
      </div>

      {sessions && sessions.length === 0 ? (
        <EmptyState
          bordered
          title="Nothing scheduled this week"
          body="Add your first session from the top right."
        />
      ) : null}
    </div>
  );
}
