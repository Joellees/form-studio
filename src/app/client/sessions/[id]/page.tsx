import { notFound } from "next/navigation";

import { SessionLogger } from "@/app/studio/sessions/[id]/session-logger";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatInTz } from "@/lib/schedule";

export const dynamic = "force-dynamic";

export default async function ClientSessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const [{ data: me }, { data: session }, { data: blocks }] = await Promise.all([
    supabase.from("clients").select("timezone, trainers(timezone)").maybeSingle(),
    supabase
      .from("sessions")
      .select("id, scheduled_at, duration_minutes, session_type, status, name, notes, zoom_url")
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
  const tz = me?.timezone ?? (me?.trainers as { timezone?: string } | null)?.timezone ?? "UTC";

  return (
    <div className="rise-in-stagger space-y-8">
      <header className="flex items-start justify-between gap-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">session</p>
          <h1 className="mt-2 font-display text-4xl">{session.name ?? session.session_type.replace("_", " ")}</h1>
          <p className="mt-1 text-sm text-[color:var(--color-stone)] tabular-nums">
            {formatInTz(new Date(session.scheduled_at), tz, "EEE, MMM d, yyyy · HH:mm")} · {session.duration_minutes} min
          </p>
        </div>
        <Badge tone={session.status === "completed" ? "moss" : "stone"}>{session.status}</Badge>
      </header>

      {session.session_type === "zoom" && session.zoom_url ? (
        <Card>
          <CardContent className="flex items-center justify-between py-4">
            <p className="text-sm">Join when it&rsquo;s time.</p>
            <a
              href={session.zoom_url}
              target="_blank"
              rel="noreferrer"
              className="rounded-md bg-[color:var(--color-moss)] px-4 py-2 text-sm font-medium text-[color:var(--color-canvas)] hover:bg-[color:var(--color-moss-deep)]"
            >
              join zoom
            </a>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>
            {session.session_type === "in_app" ? "Your workout" : "What we did"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SessionLogger sessionId={session.id} blocks={(blocks ?? []) as unknown as never} />
        </CardContent>
      </Card>
    </div>
  );
}
