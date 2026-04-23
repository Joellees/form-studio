import { notFound } from "next/navigation";

import { SessionActions } from "./session-actions";
import { SessionBuilder } from "./session-builder";
import { Badge } from "@/components/ui/badge";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { formatInTz } from "@/lib/schedule";
import { requireTrainer } from "@/lib/trainer";

export const dynamic = "force-dynamic";

export default async function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trainer = await requireTrainer();
  const admin = createSupabaseAdminClient();

  const [{ data: session }, { data: blocksRaw }, { data: exercises }] = await Promise.all([
    admin
      .from("sessions")
      .select("id, scheduled_at, duration_minutes, session_type, status, name, notes, zoom_url, clients(display_name)")
      .eq("id", id)
      .eq("tenant_id", trainer.id)
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
    admin
      .from("exercises")
      .select("id, name, group_tag")
      .eq("tenant_id", trainer.id)
      .eq("archived", false)
      .order("name"),
  ]);

  if (!session) notFound();

  // Supabase nested relations come back as arrays; normalize to single.
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

  const clientName = (() => {
    const c = session.clients as { display_name?: string } | { display_name?: string }[] | null;
    return Array.isArray(c) ? c[0]?.display_name : c?.display_name;
  })();

  return (
    <div className="rise-in-stagger space-y-8">
      <header className="flex items-start justify-between gap-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">session</p>
          <h1 className="mt-2 text-4xl">
            {clientName} · {session.name ?? session.session_type.replace("_", " ")}
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

      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <SessionBuilder
        sessionId={session.id}
        sessionNotes={session.notes}
        canEdit={true}
        blocks={blocks as any}
        library={exercises ?? []}
      />
    </div>
  );
}
