"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { GroupsSection } from "./groups-section";
import { ImportUniversalButton } from "./import-universal-button";
import { appendExercisesToTemplate, createTemplateWithExercises } from "@/app/studio/templates/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Group = { id: string; name: string; sort_index: number; is_universal?: boolean };
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
          workouts={workouts}
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
  workouts,
  groupFilter,
  setGroupFilter,
  query,
  setQuery,
}: {
  exercises: Exercise[];
  groups: Group[];
  workouts: Workout[];
  groupFilter: string;
  setGroupFilter: (v: string) => void;
  query: string;
  setQuery: (v: string) => void;
}) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creatingWorkout, setCreatingWorkout] = useState(false);

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelect() {
    setSelecting(false);
    setSelected(new Set());
    setCreatingWorkout(false);
  }

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
    <div className="space-y-7">
      {/* Toolbar: [add exercise] [shorter search] [space] [select / add to workout].
          The same right-edge button toggles modes — "select" enters
          select mode; in select mode it becomes "add to workout (N)"
          and a small × cancels. */}
      {/* Toolbar — one primary at a time. In normal mode the primary
          is "add exercise"; in select mode it shifts to "add to
          workout" and "add exercise" demotes to outline. */}
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant={selecting ? "outline" : "primary"} size="md" className="shrink-0">
          <Link href="/studio/library/new">add exercise</Link>
        </Button>
        <Input
          value={query}
          placeholder="search exercises"
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-[260px] flex-1"
        />
        <div className="ml-auto flex items-center gap-2">
          {selecting ? (
            <>
              <Button
                size="md"
                onClick={() => setCreatingWorkout(true)}
                disabled={selected.size === 0}
              >
                add to workout{selected.size > 0 ? ` (${selected.size})` : ""}
              </Button>
              <button
                type="button"
                onClick={exitSelect}
                aria-label="cancel selection"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[color:var(--color-stone)] hover:bg-[color:var(--color-parchment)]"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                  <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                </svg>
              </button>
            </>
          ) : (
            <Button variant="outline" size="md" onClick={() => setSelecting(true)}>
              select
            </Button>
          )}
        </div>
      </div>

      {/* Pill-chip group filter — one tap to switch groups. Scrolls
          horizontally on phones; wraps cleanly on tablet+. */}
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
          filter by group
        </p>
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
              selecting={selecting}
              isSelected={selected.has(ex.id)}
              onToggle={toggleSelected}
            />
          ))}
        </div>
      )}

      {creatingWorkout ? (
        <AddToWorkoutModal
          exerciseIds={[...selected]}
          workouts={workouts}
          onClose={() => setCreatingWorkout(false)}
          onCommitted={exitSelect}
        />
      ) : null}
    </div>
  );
}

/**
 * Modal for the "add to workout" bulk flow.
 *
 * Two paths in one screen — pick an existing workout from the dropdown
 * or pick the leading "+ create new workout" option which reveals a
 * name input. The single primary CTA at the bottom changes label and
 * action based on the choice ("create + add" vs. "add to {name}").
 */
function AddToWorkoutModal({
  exerciseIds,
  workouts,
  onClose,
  onCommitted,
}: {
  exerciseIds: string[];
  workouts: Workout[];
  onClose: () => void;
  onCommitted: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Special sentinel for "+ create new"; otherwise holds a template id.
  const [target, setTarget] = useState<string>(workouts[0]?.id ?? "__new");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isNew = target === "__new";
  const targetWorkout = workouts.find((w) => w.id === target);

  function commit() {
    setError(null);
    startTransition(async () => {
      if (isNew) {
        if (!name.trim()) {
          setError("Give the workout a name.");
          return;
        }
        const result = await createTemplateWithExercises({
          name: name.trim(),
          exerciseIds,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onCommitted();
        router.push(`/studio/templates/${result.data.id}`);
        return;
      }
      const result = await appendExercisesToTemplate({
        templateId: target,
        exerciseIds,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onCommitted();
      router.push(`/studio/templates/${result.data.id}`);
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[color:var(--color-ink)]/40 p-0 md:items-center md:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-3xl bg-[color:var(--color-canvas)] p-5 pb-7 shadow-[0_24px_64px_-12px_rgba(31,30,27,0.35)] md:rounded-3xl md:p-6 md:pb-6"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-moss)]">
          add to workout
        </p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight">
          {exerciseIds.length} exercise{exerciseIds.length === 1 ? "" : "s"} →
        </h2>

        <div className="mt-5 flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="workout-target">workout</Label>
            <select
              id="workout-target"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              autoFocus
              className="select-pill h-11 rounded-full border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] text-sm"
            >
              <option value="__new">+ create new workout</option>
              {workouts.length > 0 ? <option disabled>──────────</option> : null}
              {workouts.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          {isNew ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="workout-name">workout name</Label>
              <Input
                id="workout-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Lower A · strength"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commit();
                  }
                }}
              />
            </div>
          ) : targetWorkout ? (
            <p className="rounded-2xl bg-[color:var(--color-parchment)] px-4 py-3 text-xs text-[color:var(--color-ink)]/75">
              The selected exercises will be appended to{" "}
              <span className="font-semibold">{targetWorkout.name}</span> at the end of its
              current blocks.
            </p>
          ) : null}

          {error ? (
            <p className="text-xs text-[color:var(--color-sienna)]">{error}</p>
          ) : null}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={pending}
            className="w-full sm:w-auto"
          >
            cancel
          </Button>
          <Button
            onClick={commit}
            disabled={pending || (isNew && !name.trim())}
            className="w-full sm:w-auto"
          >
            {pending
              ? isNew
                ? "creating…"
                : "adding…"
              : isNew
                ? "create + add"
                : `add to ${targetWorkout?.name ?? "workout"}`}
          </Button>
        </div>
      </div>
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
  selecting = false,
  isSelected = false,
  onToggle,
}: {
  exercise: Exercise;
  groups: Group[];
  selecting?: boolean;
  isSelected?: boolean;
  onToggle?: (id: string) => void;
}) {
  // No thumbnail? Don't reserve a 16:9 slot for a placeholder letter.
  // The card adapts and reads cleaner without the empty grey block.
  const inner = (
    <Card
      className={cn(
        "relative h-full overflow-hidden transition-transform",
        selecting ? "" : "hover:-translate-y-[1px]",
        isSelected ? "ring-2 ring-[color:var(--color-ink)]" : "",
      )}
    >
      {selecting ? (
        <span
          className={cn(
            "absolute right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border",
            isSelected
              ? "border-[color:var(--color-ink)] bg-[color:var(--color-ink)] text-[color:var(--color-canvas)]"
              : "border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)]/85",
          )}
          aria-hidden
        >
          {isSelected ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M2 6l3 3 5-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : null}
        </span>
      ) : null}
      {exercise.thumbnail_url ? (
        <div className="relative aspect-video w-full bg-[color:var(--color-canvas)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={exercise.thumbnail_url} alt="" className="h-full w-full object-cover" />
        </div>
      ) : null}
      <CardContent className="space-y-3">
        <h3 className="font-semibold tracking-tight">{exercise.name}</h3>
        <div className="flex flex-wrap gap-1">
          {groups.map((g) => (
            <Tag key={g.id} tone="moss">
              {g.name}
            </Tag>
          ))}
          {exercise.is_timed ? <Tag tone="stone">timed</Tag> : null}
          {exercise.equipment ? <Tag tone="stone">{exercise.equipment}</Tag> : null}
        </div>
      </CardContent>
    </Card>
  );

  // In select mode the card becomes a toggle target instead of a
  // navigation link — otherwise the trainer can't pick something to
  // archive without leaving the page.
  if (selecting && onToggle) {
    return (
      <button
        type="button"
        onClick={() => onToggle(exercise.id)}
        className="block w-full text-left focus-visible:outline-none"
      >
        {inner}
      </button>
    );
  }
  return (
    <Link href={`/studio/library/${exercise.id}`} className="focus-visible:outline-none">
      {inner}
    </Link>
  );
}

/**
 * Compact tag — smaller than the platform `Badge` so a card showing
 * group + equipment + "timed" doesn't drown its own title. Sentence
 * case, lighter weight, slimmer padding. Used only on exercise cards.
 */
function Tag({
  tone,
  children,
}: {
  tone: "moss" | "stone";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium leading-none",
        tone === "moss"
          ? "bg-[color:var(--color-moss)]/12 text-[color:var(--color-moss-deep)]"
          : "bg-[color:var(--color-stone-soft)] text-[color:var(--color-ink)]/80",
      )}
    >
      {children}
    </span>
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
