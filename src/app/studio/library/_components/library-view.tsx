"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { GroupsSection } from "./groups-section";
import { ImportUniversalButton } from "./import-universal-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Group = { id: string; name: string; sort_index: number };
type Exercise = {
  id: string;
  name: string;
  /** Legacy single-group pointer — still written by the edit form. */
  group_id: string | null;
  /** Source of truth for group memberships. Empty = unassigned. */
  group_ids: string[];
  equipment: string | null;
  is_timed: boolean;
  default_rep_type: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
};

type Workout = {
  id: string;
  name: string;
  day_label: string | null;
  description: string | null;
  created_at: string;
};

type Tab = "exercises" | "workouts" | "groups";

export function LibraryView({
  initialTab,
  initialGroupFilter,
  initialQuery,
  groups,
  exercises,
  workouts,
}: {
  initialTab: Tab;
  initialGroupFilter: string;
  initialQuery: string;
  groups: Group[];
  exercises: Exercise[];
  workouts: Workout[];
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [groupFilter, setGroupFilter] = useState(initialGroupFilter);
  const [query, setQuery] = useState(initialQuery);

  return (
    <div className="space-y-6">
      <div className="flex gap-1 overflow-x-auto border-b border-[color:var(--color-stone-soft)]">
        <TabButton active={tab === "exercises"} onClick={() => setTab("exercises")}>
          Exercises <span className="tabular-nums text-[color:var(--color-stone)]">{exercises.length}</span>
        </TabButton>
        <TabButton active={tab === "workouts"} onClick={() => setTab("workouts")}>
          Workouts <span className="tabular-nums text-[color:var(--color-stone)]">{workouts.length}</span>
        </TabButton>
        <TabButton active={tab === "groups"} onClick={() => setTab("groups")}>
          Groups <span className="tabular-nums text-[color:var(--color-stone)]">{groups.length}</span>
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
      ) : tab === "workouts" ? (
        <WorkoutsTab workouts={workouts} />
      ) : (
        <GroupsSection
          groups={groups}
          exercises={exercises.map((ex) => ({ id: ex.id, name: ex.name, group_ids: ex.group_ids }))}
          exerciseCountByGroup={countByGroup(exercises)}
        />
      )}
    </div>
  );
}

function WorkoutsTab({ workouts }: { workouts: Workout[] }) {
  if (workouts.length === 0) {
    return (
      <EmptyState
        title="No workouts yet"
        body="Build a reusable session once — exercises, sets, reps, rest. You&rsquo;ll attach it to any client&rsquo;s calendar in one click."
        action={
          <Link
            href="/studio/templates/new"
            className="inline-flex h-10 items-center rounded-full bg-[color:var(--color-ink)] px-6 text-sm font-semibold text-[color:var(--color-canvas)] hover:bg-[color:var(--color-moss-deep)]"
          >
            create your first workout
          </Link>
        }
      />
    );
  }
  return (
    <div className="space-y-4">
      <div>
        <Button asChild size="md">
          <Link href="/studio/templates/new">new workout</Link>
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {workouts.map((w) => (
          <Link
            key={w.id}
            href={`/studio/templates/${w.id}`}
            className="group rounded-2xl bg-[color:var(--color-parchment)]/60 p-5 transition-colors hover:bg-[color:var(--color-parchment)]"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--color-stone)]">
              {w.day_label || "workout"}
            </p>
            <h3 className="mt-1 text-lg font-semibold tracking-tight group-hover:text-[color:var(--color-moss-deep)]">
              {w.name}
            </h3>
            {w.description ? (
              <p className="mt-2 line-clamp-2 text-sm text-[color:var(--color-ink)]/70">
                {w.description}
              </p>
            ) : null}
            <p className="mt-4 text-xs tabular-nums text-[color:var(--color-stone)]">
              added {new Date(w.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </p>
          </Link>
        ))}
      </div>
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
    if (groupFilter === "__ungrouped") {
      if (e.group_ids.length > 0) return false;
    } else if (groupFilter && !e.group_ids.includes(groupFilter)) {
      return false;
    }
    if (query && !e.name.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  // Counts per group, plus an "ungrouped" bucket and an "all" total.
  const counts = useMemo(() => {
    const out: Record<string, number> = { __all: exercises.length, __ungrouped: 0 };
    for (const ex of exercises) {
      if (ex.group_ids.length === 0) {
        out["__ungrouped"] = (out["__ungrouped"] ?? 0) + 1;
        continue;
      }
      for (const gid of ex.group_ids) {
        out[gid] = (out[gid] ?? 0) + 1;
      }
    }
    return out;
  }, [exercises]);

  const groupsById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);

  if (exercises.length === 0) {
    return (
      <EmptyState
        title="Nothing here yet"
        body="Start with the universal library — common lifts, olympic, conditioning, core. Or add your own from scratch."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ImportUniversalButton />
            <Link
              href="/studio/library/new"
              className="inline-flex h-10 items-center rounded-full border border-[color:var(--color-ink)]/15 px-5 text-sm font-medium text-[color:var(--color-ink)] hover:bg-[color:var(--color-parchment)]"
            >
              add my own
            </Link>
          </div>
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Single header row: add + search side by side, search takes
          the rest of the width. Modern, minimal, mobile-first. */}
      <div className="flex items-center gap-2">
        <Button asChild size="md" className="shrink-0">
          <Link href="/studio/library/new">add exercise</Link>
        </Button>
        <Input
          value={query}
          placeholder="search exercises"
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1"
        />
      </div>

      {/* Pill-chip group filter — one tap to switch groups. Replaces
          the old accordion + dropdown. Scrolls horizontally on
          phones; wraps cleanly on tablet+. */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        <FilterChip
          active={groupFilter === ""}
          onClick={() => setGroupFilter("")}
          label="all"
          count={counts["__all"] ?? 0}
        />
        {groups.map((g) => {
          const c = counts[g.id] ?? 0;
          if (c === 0) return null;
          return (
            <FilterChip
              key={g.id}
              active={groupFilter === g.id}
              onClick={() => setGroupFilter(g.id)}
              label={g.name}
              count={c}
            />
          );
        })}
        {(counts["__ungrouped"] ?? 0) > 0 ? (
          <FilterChip
            active={groupFilter === "__ungrouped"}
            onClick={() => setGroupFilter("__ungrouped")}
            label="unassigned"
            count={counts["__ungrouped"] ?? 0}
          />
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No matches" body="Try a different search or pick another group." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((ex) => (
            <ExerciseCard
              key={ex.id}
              exercise={ex}
              groups={ex.group_ids
                .map((gid) => groupsById.get(gid))
                .filter((g): g is Group => Boolean(g))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors",
        active
          ? "bg-[color:var(--color-ink)] text-[color:var(--color-canvas)]"
          : "bg-[color:var(--color-parchment)]/70 text-[color:var(--color-ink)] hover:bg-[color:var(--color-parchment)]",
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          "tabular-nums text-[11px]",
          active ? "text-[color:var(--color-canvas)]/70" : "text-[color:var(--color-stone)]",
        )}
      >
        {count}
      </span>
    </button>
  );
}

function ExerciseCard({
  exercise,
  groups,
}: {
  exercise: Exercise;
  groups: Group[];
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
          <div className="flex flex-wrap gap-1.5 text-xs">
            {groups.map((g) => (
              <Badge key={g.id} tone="moss">
                {g.name}
              </Badge>
            ))}
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
    if (ex.group_ids.length === 0) {
      out["__ungrouped"] = (out["__ungrouped"] ?? 0) + 1;
      continue;
    }
    for (const gid of ex.group_ids) {
      out[gid] = (out[gid] ?? 0) + 1;
    }
  }
  return out;
}
