import { notFound } from "next/navigation";

import { ExerciseForm } from "../_components/exercise-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EditExercisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: exercise } = await supabase.from("exercises").select("*").eq("id", id).maybeSingle();
  if (!exercise) notFound();

  return (
    <div className="mx-auto max-w-2xl rise-in">
      <p className="text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">exercise</p>
      <h1 className="mt-2 text-4xl">{exercise.name}</h1>
      <ExerciseForm mode="edit" initial={exercise} />
    </div>
  );
}
