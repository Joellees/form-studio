import Link from "next/link";

import { ClientSessionRow } from "./client-session-row";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { requireClient } from "@/lib/trainer";
import { formatInTz } from "@/lib/schedule";

export const dynamic = "force-dynamic";

export default async function ClientCalendarPage() {
  const client = await requireClient();
  const admin = createSupabaseAdminClient();

  const { data: me } = await admin
    .from("clients")
    .select("timezone, trainers(timezone)")
    .eq("id", client.id)
    .maybeSingle();
  const trainersRel = me?.trainers as { timezone?: string } | { timezone?: string }[] | null;
  const trainer = Array.isArray(trainersRel) ? trainersRel[0] ?? null : trainersRel;
  const tz = me?.timezone ?? trainer?.timezone ?? "UTC";

  const { data: sessions } = await admin
    .from("sessions")
    .select("id, scheduled_at, duration_minutes, session_type, status, name, zoom_url")
    .eq("client_id", client.id)
    .order("scheduled_at");

  const now = new Date();
  const upcoming = (sessions ?? []).filter((s) => new Date(s.scheduled_at) > now && s.status !== "cancelled");
  const past = (sessions ?? []).filter((s) => new Date(s.scheduled_at) <= now || s.status === "cancelled");

  return (
    <div className="rise-in-stagger space-y-10">
      <section>
        <p className="text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">calendar</p>
        <h1 className="mt-2 text-4xl">Your sessions.</h1>
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight">Upcoming</h2>
        {upcoming.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              bordered
              title="Nothing scheduled"
              body="Your trainer will schedule your sessions. You can also request one when you&rsquo;re ready."
            />
          </div>
        ) : (
          <Card className="mt-3">
            <CardContent className="p-0">
              <ul className="divide-y divide-[color:var(--color-stone-soft)]">
                {upcoming.map((s) => (
                  <ClientSessionRow key={s.id} session={s} timezone={tz} formatInTz={formatInTz} />
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </section>

      {past.length > 0 ? (
        <section>
          <h2 className="text-lg font-semibold tracking-tight">Past</h2>
          <Card className="mt-3">
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
