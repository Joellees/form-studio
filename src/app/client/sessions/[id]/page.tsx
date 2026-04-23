import { notFound } from "next/navigation";

import { SessionBuilder } from "@/app/studio/sessions/[id]/session-builder";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { formatInTz } from "@/lib/schedule";
import { requireClient } from "@/lib/trainer";

export const dynamic = "force-dynamic";

export default async function ClientSessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await requireClient();
  const admin = createSupabaseAdminClient();

  const [{ data: me }, { data: session }, { data: blocksRaw }] = await Promise.all([
    admin.from("clients").select("timezone, trainers(timezone)").eq("id", client.id).maybeSingle(),
    admin
      .from("sessions")
      .select("id, scheduled_at, duration_minutes, session_type, status, name, notes, zoom_url")
      .eq("id", id)
      .eq("client_id", client.id)
      .maybeSingle(),
    admin
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

  const trainersRel = me?.trainers as { timezone?: string } | { timezone?: string }[] | null;
  const trainer = Array.isArray(trainersRel) ? trainersRel[0] ?? null : trainersRel;
  const tz = me?.timezone ?? trainer?.timezone ?? "UTC";

  const blocks = (blocksRaw ?? []).map((b) => {
    const bes = (b.session_block_exercises ?? []) as Array<{
      id: string;
      order_index: number;
      setup_override: string | null;
      exercises: Array<Record<string, unknown>> | Record<string, unknown> | null;
      session_set_groups: Array<Record<string, unknown>>;
    }>;
    return {
      ...b,
      session_block_exercises: bes.map((be) => ({
        ...be,
        exercises: Array.isArray(be.exercises) ? be.exercises[0] ?? null : be.exercises,
      })),
    };
  });

  return (
    <div className="rise-in-stagger space-y-8">
      <header className="flex items-start justify-between gap-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">session</p>
          <h1 className="mt-2 text-4xl">{session.name ?? session.session_type.replace("_", " ")}</h1>
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
              className="inline-flex h-10 items-center rounded-full bg-[color:var(--color-ink)] px-5 text-sm font-medium text-[color:var(--color-canvas)] hover:bg-[color:var(--color-moss-deep)]"
            >
              join zoom
            </a>
          </CardContent>
        </Card>
      ) : null}

      <SessionBuilder
        sessionId={session.id}
        sessionNotes={session.notes}
        canEdit={false}
        blocks={blocks as unknown as Parameters<typeof SessionBuilder>[0]["blocks"]}
        library={[]}
      />
    </div>
  );
}
