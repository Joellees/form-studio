import { ExerciseForm } from "../_components/exercise-form";
import { PageHeader } from "@/components/ui/page-header";
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
      <PageHeader
        eyebrow="library"
        title="Add exercise."
        subtitle="name it, pick a group, set the default sets. fine-tune per session later."
      />
      <ExerciseForm mode="create" groups={groups ?? []} />
    </div>
  );
}
