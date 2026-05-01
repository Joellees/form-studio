import { LibraryView } from "./_components/library-view";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { requireTrainer } from "@/lib/trainer";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    tab?: "exercises" | "workouts" | "groups";
    group?: string;
    q?: string;
  }>;
};

export default async function LibraryPage({ searchParams }: Props) {
  const sp = await searchParams;
  const trainer = await requireTrainer();
  const admin = createSupabaseAdminClient();

  const [{ data: groups }, { data: exercises }, { data: memberships }, { data: workouts }] =
    await Promise.all([
      admin
        .from("exercise_groups")
        .select("id, name, sort_index, is_universal")
        .eq("tenant_id", trainer.id)
        .order("sort_index")
        .order("name"),
      admin
        .from("exercises")
        .select("id, name, group_id, equipment, is_timed, default_rep_type, video_url, thumbnail_url")
        .eq("tenant_id", trainer.id)
        .eq("archived", false)
        .order("name"),
      admin
        .from("exercise_group_memberships")
        .select("exercise_id, group_id")
        .eq("tenant_id", trainer.id),
      admin
        .from("session_templates")
        .select("id, name, day_label, description, created_at")
        .eq("tenant_id", trainer.id)
        .eq("archived", false)
        .order("created_at", { ascending: false }),
    ]);

  // Merge memberships into each exercise as `group_ids: string[]`.
  // Junction is the source of truth; if it's empty for a given
  // exercise we fall back to the legacy `group_id` so the row still
  // appears in some section instead of vanishing.
  const groupIdsByExercise = new Map<string, string[]>();
  for (const m of memberships ?? []) {
    const list = groupIdsByExercise.get(m.exercise_id as string) ?? [];
    list.push(m.group_id as string);
    groupIdsByExercise.set(m.exercise_id as string, list);
  }
  const exercisesWithGroups = (exercises ?? []).map((ex) => {
    const ids = groupIdsByExercise.get(ex.id as string) ?? (ex.group_id ? [ex.group_id as string] : []);
    return { ...ex, group_ids: ids };
  });

  return (
    <div className="rise-in-stagger space-y-4 md:space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">
          library
        </p>
        <h1 className="mt-1 text-2xl md:mt-2 md:text-4xl">Everything you coach.</h1>
      </div>

      <LibraryView
        initialTab={sp.tab ?? "exercises"}
        initialGroupFilter={sp.group ?? ""}
        initialQuery={sp.q ?? ""}
        groups={groups ?? []}
        exercises={exercisesWithGroups}
        workouts={workouts ?? []}
      />
    </div>
  );
}
