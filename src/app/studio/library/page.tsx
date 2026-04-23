import Link from "next/link";

import { LibraryFilters } from "./_components/library-filters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ q?: string; group?: string }> };

export default async function LibraryPage({ searchParams }: Props) {
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("exercises")
    .select("id, name, default_descriptor, group_tag, is_unilateral, equipment, archived, thumbnail_url")
    .eq("archived", false)
    .order("name");

  if (sp.q) query = query.ilike("name", `%${sp.q}%`);
  if (sp.group) query = query.eq("group_tag", sp.group);

  const { data: exercises } = await query;

  const { data: groupsRaw } = await supabase
    .from("exercises")
    .select("group_tag")
    .eq("archived", false)
    .not("group_tag", "is", null);

  const groups = Array.from(new Set((groupsRaw ?? []).map((g) => g.group_tag).filter(Boolean))) as string[];

  return (
    <div className="rise-in-stagger space-y-8">
      <div className="flex items-center justify-between gap-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">library</p>
          <h1 className="mt-2 text-4xl">The movements you coach.</h1>
        </div>
        <Button asChild>
          <Link href="/studio/library/new">add exercise</Link>
        </Button>
      </div>

      <LibraryFilters groups={groups} initialQuery={sp.q ?? ""} initialGroup={sp.group ?? ""} />

      {!exercises || exercises.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          body="Add your first exercise — just the name, maybe a video, and a group tag for browsing."
          action={
            <Button asChild>
              <Link href="/studio/library/new">add your first exercise</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {exercises.map((ex) => (
            <Link key={ex.id} href={`/studio/library/${ex.id}`} className="focus-visible:outline-none">
              <Card className="h-full transition-transform hover:-translate-y-[1px]">
                <div className="relative aspect-video w-full overflow-hidden rounded-t-lg bg-[color:var(--color-canvas)]">
                  {ex.thumbnail_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={ex.thumbnail_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-5xl text-[color:var(--color-stone)]">
                      {ex.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">{ex.name}</h3>
                    {ex.is_unilateral ? <Badge tone="moss">unilateral</Badge> : null}
                  </div>
                  {ex.default_descriptor ? (
                    <p className="line-clamp-2 text-xs text-[color:var(--color-ink)]/70">{ex.default_descriptor}</p>
                  ) : null}
                  <div className="flex gap-2 text-xs text-[color:var(--color-stone)]">
                    {ex.group_tag ? <Badge tone="stone">{ex.group_tag}</Badge> : null}
                    {ex.equipment ? <Badge tone="stone">{ex.equipment}</Badge> : null}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
