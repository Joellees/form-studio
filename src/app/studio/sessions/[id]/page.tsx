import { notFound } from "next/navigation";

import { SessionActions } from "./session-actions";
import { SessionLogger } from "./session-logger";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatInTz } from "@/lib/schedule";
import { requireTrainer } from "@/lib/trainer";

export const dynamic = "force-dynamic";

export default async function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trainer = await requireTrainer();
  const supabase = await createSupabaseServerClient();

  const [{ data: session }, { data: blocks }] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, scheduled_at, duration_minutes, session_type, status, name, notes, zoom_url, clients(display_name)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("session_blocks")
      .select(
        `id, order_index,
         session_block_exercises(id, order_index, setup_override,
           exercises(id, name, default_descriptor, video_url),
           session_set_groups(id, order_index, label, sets, rep_type, rep_value, weight_type, weight_value, rest_seconds, performed_sets, performed_reps, performed_weight, performed_notes)
         )`,
      )
      .eq("session_id", id)
      .order("order_index"),
  ]);

  if (!session) notFound();

  return (
    <div className="rise-in-stagger space-y-8">
      <header className="flex items-start justify-between gap-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">session</p>
          <h1 className="mt-2 font-display text-4xl">
            {/* @ts-expect-error — nested typings */}
            {session.clients?.display_name} · {session.name ?? session.session_type.replace("_", " ")}
          </h1>
          <p className="mt-1 text-sm text-[color:var(--color-stone)] tabular-nums">
            {formatInTz(new Date(session.scheduled_at), trainer.timezone, "EEE, MMM d, yyyy · HH:mm")} ·{" "}
            {session.duration_minutes} min
          </p>
        </div>
        <Badge tone={session.status === "completed" ? "moss" : session.status === "requested" ? "signal" : "stone"}>
          {session.status}
        </Badge>
      </header>

      <SessionActions session={session} />

      <Card>
        <CardHeader>
          <CardTitle>
            {session.session_type === "in_app" ? "Prescribed workout" : "Log what happened"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SessionLogger sessionId={session.id} blocks={(blocks ?? []) as unknown as never} />
        </CardContent>
      </Card>
    </div>
  );
}
