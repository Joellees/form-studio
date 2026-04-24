import { notFound } from "next/navigation";

import { ExerciseForm } from "../_components/exercise-form";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { requireTrainer } from "@/lib/trainer";

export const dynamic = "force-dynamic";

export default async function EditExercisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trainer = await requireTrainer();
  const admin = createSupabaseAdminClient();

  const [{ data: exercise }, { data: groups }] = await Promise.all([
    admin.from("exercises").select("*").eq("id", id).eq("tenant_id", trainer.id).maybeSingle(),
    admin
      .from("exercise_groups")
      .select("id, name")
      .eq("tenant_id", trainer.id)
      .order("sort_index")
      .order("name"),
  ]);
  if (!exercise) notFound();

  return (
    <div className="mx-auto max-w-2xl rise-in">
      <p className="text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">exercise</p>
      <h1 className="mt-2 text-4xl">{exercise.name}</h1>
      <ExerciseForm mode="edit" initial={exercise} groups={groups ?? []} />
    </div>
  );
}
