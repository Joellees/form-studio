import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireTrainer } from "@/lib/trainer";
import { formatInTz, weekRange } from "@/lib/schedule";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ week?: string }> };

export default async function CalendarPage({ searchParams }: Props) {
  const sp = await searchParams;
  const trainer = await requireTrainer();
  const reference = sp.week ? new Date(sp.week) : new Date();
  const { start, end, days } = weekRange(reference, trainer.timezone);

  const supabase = await createSupabaseServerClient();
  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, scheduled_at, duration_minutes, session_type, status, name, day_label, clients(display_name)")
    .gte("scheduled_at", start.toISOString())
    .lte("scheduled_at", end.toISOString())
    .order("scheduled_at");

  const byDay = new Map<string, typeof sessions>();
  for (const d of days) byDay.set(formatInTz(d, trainer.timezone, "yyyy-MM-dd"), []);
  for (const s of sessions ?? []) {
    const key = formatInTz(new Date(s.scheduled_at), trainer.timezone, "yyyy-MM-dd");
    byDay.get(key)?.push(s);
  }

  return (
    <div className="rise-in-stagger space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">calendar</p>
          <h1 className="mt-2 text-4xl">This week.</h1>
          <p className="mt-1 text-sm text-[color:var(--color-stone)] tabular-nums">
            {formatInTz(start, trainer.timezone, "MMM d")} — {formatInTz(end, trainer.timezone, "MMM d, yyyy")}
            {" · "}
            {trainer.timezone}
          </p>
        </div>
        <Button asChild>
          <Link href="/studio/calendar/new">schedule a session</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-7">
        {days.map((d) => {
          const key = formatInTz(d, trainer.timezone, "yyyy-MM-dd");
          const daysSessions = byDay.get(key) ?? [];
          return (
            <Card key={key} className="min-h-[12rem]">
              <CardContent className="p-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
                  {formatInTz(d, trainer.timezone, "EEE")}
                </p>
                <p className="text-2xl tabular-nums">{formatInTz(d, trainer.timezone, "d")}</p>
                <div className="mt-3 space-y-2">
                  {daysSessions.length === 0 ? (
                    <p className="text-xs text-[color:var(--color-stone)]">—</p>
                  ) : (
                    daysSessions.map((s) => (
                      <Link
                        key={s.id}
                        href={`/studio/sessions/${s.id}`}
                        className="block rounded-md border border-[color:var(--color-stone-soft)]/60 bg-[color:var(--color-canvas)] px-3 py-2 hover:border-[color:var(--color-moss)]"
                      >
                        <p className="text-xs tabular-nums text-[color:var(--color-stone)]">
                          {formatInTz(new Date(s.scheduled_at), trainer.timezone, "HH:mm")}
                        </p>
                        <p className="truncate text-sm font-medium">
                          {/* @ts-expect-error — nested typings */}
                          {s.clients?.display_name ?? "Client"}
                        </p>
                        <div className="mt-1 flex items-center gap-1">
                          <Badge tone={s.status === "requested" ? "signal" : s.session_type === "in_app" ? "moss" : "stone"}>
                            {s.status === "requested" ? "request" : s.session_type.replace("_", " ")}
                          </Badge>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {sessions && sessions.length === 0 ? (
        <EmptyState title="Nothing scheduled this week" body="Add your first session from the top right." />
      ) : null}
    </div>
  );
}
