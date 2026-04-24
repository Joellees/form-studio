import Link from "next/link";

import { LibraryView } from "./_components/library-view";
import { Button } from "@/components/ui/button";
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

  const [{ data: groups }, { data: exercises }, { data: workouts }] = await Promise.all([
    admin
      .from("exercise_groups")
      .select("id, name, sort_index")
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
      .from("session_templates")
      .select("id, name, day_label, description, created_at")
      .eq("tenant_id", trainer.id)
      .eq("archived", false)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div className="rise-in-stagger space-y-6 md:space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">
            library
          </p>
          <h1 className="mt-2 text-3xl md:text-4xl">Everything you coach.</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="secondary" size="md">
            <Link href="/studio/templates/new">new workout</Link>
          </Button>
          <Button asChild size="md">
            <Link href="/studio/library/new">add exercise</Link>
          </Button>
        </div>
      </div>

      <LibraryView
        initialTab={sp.tab ?? "exercises"}
        initialGroupFilter={sp.group ?? ""}
        initialQuery={sp.q ?? ""}
        groups={groups ?? []}
        exercises={exercises ?? []}
        workouts={workouts ?? []}
      />
    </div>
  );
}
