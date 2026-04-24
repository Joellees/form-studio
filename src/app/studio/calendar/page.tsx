import { CalendarWeek } from "./_components/calendar-week";
import { type SessionSummary } from "../_components/session-row";
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
  const [
    { data: sessions },
    { data: clientRows },
    { data: workouts },
  ] = await Promise.all([
    admin
      .from("sessions")
      .select("id, scheduled_at, duration_minutes, session_type, status, name, day_label, clients(display_name)")
      .eq("tenant_id", trainer.id)
      .gte("scheduled_at", start.toISOString())
      .lte("scheduled_at", end.toISOString())
      .order("scheduled_at"),
    admin
      .from("clients")
      .select(
        "id, display_name, subscriptions(id, sessions_remaining, payment_status, packages(name, session_count))",
      )
      .eq("tenant_id", trainer.id)
      .eq("active", true)
      .order("display_name"),
    admin
      .from("session_templates")
      .select("id, name")
      .eq("tenant_id", trainer.id)
      .eq("archived", false)
      .order("name"),
  ]);

  // Group sessions by day in trainer&rsquo;s timezone
  const sessionsByDay: Record<string, SessionSummary[]> = {};
  for (const s of sessions ?? []) {
    const key = formatInTz(new Date(s.scheduled_at), trainer.timezone, "yyyy-MM-dd");
    const clientRel = s.clients as { display_name?: string } | { display_name?: string }[] | null;
    const client = Array.isArray(clientRel) ? clientRel[0] : clientRel;
    (sessionsByDay[key] ??= []).push({
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

  const todayKey = formatInTz(new Date(), trainer.timezone, "yyyy-MM-dd");
  const dayObjects = days.map((d) => {
    const key = formatInTz(d, trainer.timezone, "yyyy-MM-dd");
    return {
      key,
      weekday: formatInTz(d, trainer.timezone, "EEE"),
      dayNum: formatInTz(d, trainer.timezone, "d"),
      humanDate: formatInTz(d, trainer.timezone, "EEE, MMM d"),
      isToday: key === todayKey,
    };
  });

  const clients = (clientRows ?? []).map((c) => {
    const subs = (c.subscriptions ?? []) as Array<{
      id: string;
      sessions_remaining: number;
      payment_status: string;
      packages: { name: string; session_count: number } | { name: string; session_count: number }[] | null;
    }>;
    const activeBlocks = subs
      .filter((s) => s.payment_status === "paid" && s.sessions_remaining > 0)
      .map((s) => {
        const p = Array.isArray(s.packages) ? s.packages[0] : s.packages;
        return {
          id: s.id,
          packageName: p?.name ?? "Block",
          sessionsRemaining: s.sessions_remaining,
          sessionCount: p?.session_count ?? s.sessions_remaining,
        };
      });
    return { id: c.id, displayName: c.display_name, activeBlocks };
  });

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
      </div>

      <CalendarWeek
        days={dayObjects}
        sessionsByDay={sessionsByDay}
        clients={clients}
        workouts={workouts ?? []}
      />

      {clients.length === 0 ? (
        <EmptyState
          bordered
          title="No clients yet"
          body="Add a client first so you have someone to schedule."
        />
      ) : !sessions || sessions.length === 0 ? (
        <p className="text-sm text-[color:var(--color-stone)]">
          Click a day to schedule a session.
        </p>
      ) : null}
    </div>
  );
}
