"use client";

import Link from "next/link";
import { useState } from "react";

import { GroupsSection } from "./groups-section";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Group = { id: string; name: string; sort_index: number };
type Exercise = {
  id: string;
  name: string;
  group_id: string | null;
  equipment: string | null;
  is_timed: boolean;
  default_rep_type: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
};

type Tab = "exercises" | "groups";

export function LibraryView({
  initialTab,
  initialGroupFilter,
  initialQuery,
  groups,
  exercises,
}: {
  initialTab: Tab;
  initialGroupFilter: string;
  initialQuery: string;
  groups: Group[];
  exercises: Exercise[];
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [groupFilter, setGroupFilter] = useState(initialGroupFilter);
  const [query, setQuery] = useState(initialQuery);

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-[color:var(--color-stone-soft)]">
        <TabButton active={tab === "exercises"} onClick={() => setTab("exercises")}>
          Exercises ({exercises.length})
        </TabButton>
        <TabButton active={tab === "groups"} onClick={() => setTab("groups")}>
          Groups ({groups.length})
        </TabButton>
      </div>

      {tab === "exercises" ? (
        <ExercisesTab
          exercises={exercises}
          groups={groups}
          groupFilter={groupFilter}
          setGroupFilter={setGroupFilter}
          query={query}
          setQuery={setQuery}
        />
      ) : (
        <GroupsSection groups={groups} exerciseCountByGroup={countByGroup(exercises)} />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative px-4 py-3 text-sm font-semibold tracking-tight transition-colors",
        active
          ? "text-[color:var(--color-ink)] after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:bg-[color:var(--color-ink)]"
          : "text-[color:var(--color-ink)]/50 hover:text-[color:var(--color-ink)]",
      )}
    >
      {children}
    </button>
  );
}

function ExercisesTab({
  exercises,
  groups,
  groupFilter,
  setGroupFilter,
  query,
  setQuery,
}: {
  exercises: Exercise[];
  groups: Group[];
  groupFilter: string;
  setGroupFilter: (v: string) => void;
  query: string;
  setQuery: (v: string) => void;
}) {
  const filtered = exercises.filter((e) => {
    if (groupFilter && e.group_id !== groupFilter) return false;
    if (query && !e.name.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  if (exercises.length === 0) {
    return (
      <EmptyState
        title="Nothing here yet"
        body="Add your first exercise — just the name, maybe a video, and assign it to a group."
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={query}
          placeholder="search"
          className="max-w-xs"
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value)}
          className="h-11 rounded-full border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] px-3 text-sm"
        >
          <option value="">all groups</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
          <option value="__ungrouped">(no group)</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No matches" body="Try clearing the filter or search." />
      ) : (
        <GroupedExerciseList filtered={filtered} groups={groups} groupFilter={groupFilter} />
      )}
    </div>
  );
}

function GroupedExerciseList({
  filtered,
  groups,
  groupFilter,
}: {
  filtered: Exercise[];
  groups: Group[];
  groupFilter: string;
}) {
  // When a specific group is selected, render a flat grid (no section headers).
  if (groupFilter) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((ex) => (
          <ExerciseCard key={ex.id} exercise={ex} group={groups.find((g) => g.id === ex.group_id)} />
        ))}
      </div>
    );
  }

  // Otherwise group by group, rendered in section blocks.
  const byGroup = new Map<string, Exercise[]>();
  for (const ex of filtered) {
    const key = ex.group_id ?? "__ungrouped";
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key)!.push(ex);
  }

  const ordered: Array<{ key: string; name: string; items: Exercise[] }> = [];
  for (const g of groups) {
    const items = byGroup.get(g.id);
    if (items?.length) ordered.push({ key: g.id, name: g.name, items });
  }
  const ungrouped = byGroup.get("__ungrouped");
  if (ungrouped?.length) ordered.push({ key: "__ungrouped", name: "Unassigned", items: ungrouped });

  return (
    <div className="space-y-8">
      {ordered.map((section) => (
        <section key={section.key}>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
            {section.name}{" "}
            <span className="ml-1 tabular-nums text-[color:var(--color-stone)]/70">
              {section.items.length}
            </span>
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {section.items.map((ex) => (
              <ExerciseCard
                key={ex.id}
                exercise={ex}
                group={section.key === "__ungrouped" ? undefined : { id: section.key, name: section.name, sort_index: 0 }}
                hideGroupBadge
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ExerciseCard({
  exercise,
  group,
  hideGroupBadge,
}: {
  exercise: Exercise;
  group?: Group;
  hideGroupBadge?: boolean;
}) {
  return (
    <Link href={`/studio/library/${exercise.id}`} className="focus-visible:outline-none">
      <Card className="h-full overflow-hidden transition-transform hover:-translate-y-[1px]">
        <div className="relative aspect-video w-full bg-[color:var(--color-canvas)]">
          {exercise.thumbnail_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={exercise.thumbnail_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-5xl text-[color:var(--color-stone)]">
              {exercise.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <CardContent className="space-y-3">
          <h3 className="font-semibold tracking-tight">{exercise.name}</h3>
          <div className="flex flex-wrap gap-2 text-xs">
            {!hideGroupBadge && group ? <Badge tone="moss">{group.name}</Badge> : null}
            {exercise.is_timed ? <Badge tone="stone">timed</Badge> : null}
            {exercise.equipment ? <Badge tone="stone">{exercise.equipment}</Badge> : null}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function countByGroup(exercises: Exercise[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const ex of exercises) {
    const k = ex.group_id ?? "__ungrouped";
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
