import { ExerciseForm } from "../_components/exercise-form";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { requireTrainer } from "@/lib/trainer";

export const dynamic = "force-dynamic";

export default async function NewExercisePage() {
  const trainer = await requireTrainer();
  const admin = createSupabaseAdminClient();
  const { data: groups } = await admin
    .from("exercise_groups")
    .select("id, name")
    .eq("tenant_id", trainer.id)
    .order("sort_index")
    .order("name");

  return (
    <div className="mx-auto max-w-2xl rise-in">
      <p className="text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">library</p>
      <h1 className="mt-2 text-4xl">Add exercise.</h1>
      <p className="mt-3 text-[color:var(--color-ink)]/75">
        Name it, pick a group, set the default sets. Fine-tune per session later.
      </p>
      <ExerciseForm mode="create" groups={groups ?? []} />
    </div>
  );
}
