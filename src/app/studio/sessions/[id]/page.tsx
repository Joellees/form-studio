import { notFound } from "next/navigation";

import { SessionActions } from "./session-actions";
import { SessionBuilder } from "./session-builder";
import { SessionTypeEditor } from "./session-type-editor";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { isMissingColumnError } from "@/lib/postgrest-errors";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { formatInTz } from "@/lib/schedule";
import { isLegacyInApp, type SessionTypeValue } from "@/lib/session-type";
import { requireTrainer } from "@/lib/trainer";

export const dynamic = "force-dynamic";

export default async function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trainer = await requireTrainer();
  const admin = createSupabaseAdminClient();

  /* The session-block-exercises select tries to pull `source_template_id`
   * first (added in migration 0013). On a pre-migration DB, PostgREST
   * returns 42703 — the catch retries with the narrower legacy
   * column set. The session log just doesn't render the "from <workout>"
   * breadcrumb until the migration is applied. */
  async function loadBlocks() {
    const wide = await admin
      .from("session_blocks")
      .select(
        `id, order_index,
         session_block_exercises(id, order_index, setup_override, source_template_id,
           exercises(id, name, default_descriptor, video_url),
           session_set_groups(id, order_index, label, sets, rep_type, rep_value, weight_type, weight_value, rest_seconds, performed_sets, performed_reps, performed_weight, performed_notes)
         )`,
      )
      .eq("session_id", id)
      .order("order_index");
    if (wide.error && isMissingColumnError(wide.error)) {
      return admin
        .from("session_blocks")
        .select(
          `id, order_index,
           session_block_exercises(id, order_index, setup_override,
             exercises(id, name, default_descriptor, video_url),
             session_set_groups(id, order_index, label, sets, rep_type, rep_value, weight_type, weight_value, rest_seconds, performed_sets, performed_reps, performed_weight, performed_notes)
           )`,
        )
        .eq("session_id", id)
        .order("order_index");
    }
    return wide;
  }

  const [
    { data: session },
    { data: blocksRaw },
    { data: exercises },
    { data: groups },
    { data: templatesRaw },
  ] = await Promise.all([
    admin
      .from("sessions")
      .select("id, scheduled_at, duration_minutes, session_type, status, name, notes, zoom_url, clients(display_name)")
      .eq("id", id)
      .eq("tenant_id", trainer.id)
      .maybeSingle(),
    loadBlocks(),
    admin
      .from("exercises")
      .select("id, name, group_id")
      .eq("tenant_id", trainer.id)
      .eq("archived", false)
      .order("name"),
    admin
      .from("exercise_groups")
      .select("id, name")
      .eq("tenant_id", trainer.id)
      .order("sort_index")
      .order("name"),
    /* Workout templates for the new Workouts tab in the sidebar. We
     * pull the count of block_exercises per template so the row can
     * show "12 exercises · Push day" without a per-row query later. */
    admin
      .from("session_templates")
      .select("id, name, day_label, template_blocks(template_block_exercises(id))")
      .eq("tenant_id", trainer.id)
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

  /* Flatten the nested exercise-count select into a single number per
   * template so the sidebar row can render its subtitle cheaply. */
  const workouts = (templatesRaw ?? []).map((t) => {
    const blocks =
      ((t as { template_blocks?: Array<{ template_block_exercises?: Array<unknown> }> })
        .template_blocks) ?? [];
    const exerciseCount = blocks.reduce(
      (sum, b) => sum + (b.template_block_exercises?.length ?? 0),
      0,
    );
    return {
      id: (t as { id: string }).id,
      name: (t as { name: string }).name,
      day_label: (t as { day_label: string | null }).day_label,
      exercise_count: exerciseCount,
    };
  });

  return (
    <div className="rise-in-stagger space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="session"
        title={
          <>
            {/* When session.name is null (common for newly-created
              * sessions and seeded showcase rows), just show the
              * client name — the previous "Joanne · Session"
              * trailing fallback read as filler. The "session"
              * label is already implied by the eyebrow above. */}
            {clientName}
            {session.name ? (
              <span className="text-[color:var(--color-ink)]/55"> · {session.name}</span>
            ) : null}
          </>
        }
        subtitle={`${formatInTz(new Date(session.scheduled_at), trainer.timezone, "EEE, MMM d, yyyy · HH:mm")} · ${session.duration_minutes} min`}
        actions={
          <>
            {session.status === "requested" ? <Badge tone="signal">request</Badge> : null}
            {session.status === "cancelled" ? <Badge tone="stone">cancelled</Badge> : null}
            {session.status === "completed" ? <Badge tone="moss">completed</Badge> : null}
            <SessionTypeEditor
              sessionId={session.id}
              initialType={session.session_type as "in_person" | "zoom" | "in_app"}
              disabled={session.status === "cancelled"}
            />
          </>
        }
      />

      <SessionActions session={session} />

      {isLegacyInApp(session.session_type as SessionTypeValue) ? (
        // Legacy seed/test row: trainer originally set this to in-app.
        // The feature is paused for Beta 2 (FEATURES.IN_APP_SESSIONS).
        // The session-type editor will silently flip it to in-person/
        // online next time the trainer touches it; until then, surface
        // the state so it's not confusing.
        <div className="rounded-2xl border border-dashed border-[color:var(--color-stone-soft)] px-4 py-3 text-sm text-[color:var(--color-ink)]/70">
          This session was originally set to in-app — that option is
          paused for Beta 2. Switch the type above to in-person or
          online and it&rsquo;ll behave normally.
        </div>
      ) : null}

      <SessionBuilder
        sessionId={session.id}
        sessionNotes={session.notes}
        canEdit={true}
        blocks={blocks as unknown as Parameters<typeof SessionBuilder>[0]["blocks"]}
        library={exercises ?? []}
        libraryGroups={groups ?? []}
        workouts={workouts}
      />
    </div>
  );
}
