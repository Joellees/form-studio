import Link from "next/link";

import { ClientSessionRow } from "./client-session-row";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatInTz } from "@/lib/schedule";

export const dynamic = "force-dynamic";

export default async function ClientCalendarPage() {
  const supabase = await createSupabaseServerClient();
  const { data: me } = await supabase
    .from("clients")
    .select("timezone, trainers(timezone)")
    .maybeSingle();
  const tz =
    me?.timezone ??
    // @ts-expect-error — nested typings
    me?.trainers?.timezone ??
    "UTC";

  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, scheduled_at, duration_minutes, session_type, status, name, zoom_url")
    .order("scheduled_at");

  const upcoming = (sessions ?? []).filter((s) => new Date(s.scheduled_at) > new Date() && s.status !== "cancelled");
  const past = (sessions ?? []).filter((s) => new Date(s.scheduled_at) <= new Date() || s.status === "cancelled");

  return (
    <div className="rise-in-stagger space-y-10">
      <section>
        <p className="text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">calendar</p>
        <h1 className="mt-2 font-display text-4xl">Your sessions.</h1>
      </section>

      <section>
        <h2 className="font-display text-2xl">Upcoming</h2>
        <Card className="mt-4">
          <CardContent className="p-0">
            {upcoming.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="Nothing scheduled"
                  body="Your trainer will schedule your sessions. You can also request one when you&rsquo;re ready."
                />
              </div>
            ) : (
              <ul className="divide-y divide-[color:var(--color-stone-soft)]">
                {upcoming.map((s) => (
                  <ClientSessionRow key={s.id} session={s} timezone={tz} formatInTz={formatInTz} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      {past.length > 0 ? (
        <section>
          <h2 className="font-display text-2xl">Past</h2>
          <Card className="mt-4">
            <CardContent className="p-0">
              <ul className="divide-y divide-[color:var(--color-stone-soft)]">
                {past.slice(0, 10).map((s) => (
                  <li key={s.id} className="flex items-center justify-between px-6 py-4">
                    <div>
                      <p className="text-xs tabular-nums text-[color:var(--color-stone)]">
                        {formatInTz(new Date(s.scheduled_at), tz, "EEE, MMM d · HH:mm")}
                      </p>
                      <p className="font-medium">
                        <Link href={`/client/sessions/${s.id}`} className="hover:text-[color:var(--color-moss-deep)]">
                          {s.name ?? "Session"}
                        </Link>
                      </p>
                    </div>
                    <Badge tone={s.status === "completed" ? "moss" : "stone"}>{s.status}</Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
