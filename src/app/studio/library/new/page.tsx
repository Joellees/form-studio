import { ExerciseForm } from "../_components/exercise-form";

export default function NewExercisePage() {
  return (
    <div className="mx-auto max-w-2xl rise-in">
      <p className="text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">library</p>
      <h1 className="mt-2 font-display text-4xl">Add an exercise.</h1>
      <p className="mt-3 text-[color:var(--color-ink)]/75">
        Name it, describe how you cue it, drop a video. You&rsquo;ll reuse this everywhere.
      </p>
      <ExerciseForm mode="create" />
    </div>
  );
}
