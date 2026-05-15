"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export type LibrarySidebarExercise = {
  id: string;
  name: string;
  group_id: string | null;
};

export type LibrarySidebarGroup = {
  id: string;
  name: string;
};

export type LibrarySidebarWorkout = {
  id: string;
  name: string;
  day_label: string | null;
  exercise_count: number;
};

/**
 * Shared library picker used by the template + session builders.
 *
 * Two-tab layout when `workouts` + `onApplyWorkout` are both provided
 * (currently: session-builder). The Exercises tab is the original
 * grouped-and-searchable list. The Workouts tab lists trainer-built
 * workout templates that can be applied to the current session in
 * one tap. Each workout row also wraps `useDraggable` so a host
 * with a configured DndContext can support drop-into-session — the
 * dragged payload carries `{ type: "library-workout", workoutId }`.
 *
 * When the caller omits `workouts`/`onApplyWorkout`, the tab bar is
 * hidden and the legacy exercises-only sidebar renders unchanged
 * (template-builder still uses this mode).
 *
 * When `onCreate` is provided, a "+ new exercise" footer reveals a
 * small inline form (name + group). Scoped to the Exercises tab so
 * it doesn't confuse trainers under the Workouts tab.
 */
export function LibrarySidebar({
  exercises,
  groups,
  workouts,
  onAdd,
  onApplyWorkout,
  onCreate,
  pending,
  emptyHint,
}: {
  exercises: LibrarySidebarExercise[];
  groups: LibrarySidebarGroup[];
  workouts?: LibrarySidebarWorkout[];
  onAdd: (exerciseId: string) => void;
  onApplyWorkout?: (workoutId: string) => void;
  onCreate?: (input: { name: string; groupId: string | null }) => Promise<string | null>;
  pending?: boolean;
  emptyHint?: string;
}) {
  const showTabs = !!workouts && !!onApplyWorkout;
  const [activeTab, setActiveTab] = useState<"exercises" | "workouts">("exercises");

  const [query, setQuery] = useState("");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newGroupId, setNewGroupId] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [savingNew, startSave] = useTransition();
  const trimmedQuery = query.trim().toLowerCase();

  const sections = useMemo(() => {
    const filtered = exercises.filter((e) =>
      trimmedQuery ? e.name.toLowerCase().includes(trimmedQuery) : true,
    );
    const byGroup = new Map<string, LibrarySidebarExercise[]>();
    for (const ex of filtered) {
      const key = ex.group_id ?? "__ungrouped";
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key)!.push(ex);
    }
    const ordered: Array<{ key: string; name: string; items: LibrarySidebarExercise[] }> = [];
    for (const g of groups) {
      const items = byGroup.get(g.id);
      if (items?.length) ordered.push({ key: g.id, name: g.name, items });
    }
    const ungrouped = byGroup.get("__ungrouped");
    if (ungrouped?.length) ordered.push({ key: "__ungrouped", name: "Unassigned", items: ungrouped });
    return ordered;
  }, [exercises, groups, trimmedQuery]);

  function isOpen(key: string): boolean {
    if (trimmedQuery) return true;
    return openGroups[key] ?? false;
  }
  function toggle(key: string) {
    setOpenGroups((s) => ({ ...s, [key]: !s[key] }));
  }

  /* Special-case the "absolutely empty" library so we don't render
   * the tab bar above a single sad "no exercises" line. */
  if (exercises.length === 0 && (!workouts || workouts.length === 0)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>library</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[color:var(--color-ink)]/70">
            {emptyHint ?? "Add exercises to your library first."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>library</CardTitle>
      </CardHeader>
      <CardContent>
        {showTabs ? (
          <div
            role="tablist"
            aria-label="library content"
            className="mb-3 flex items-center gap-1 rounded-full border border-[color:var(--color-stone-soft)]/60 bg-[color:var(--color-canvas)] p-1"
          >
            <TabButton active={activeTab === "exercises"} onClick={() => setActiveTab("exercises")}>
              Exercises
            </TabButton>
            <TabButton active={activeTab === "workouts"} onClick={() => setActiveTab("workouts")}>
              Workouts
            </TabButton>
          </div>
        ) : null}

        {showTabs && activeTab === "workouts" ? (
          /* Workouts tab — list of templates, tap or drag to apply. */
          (workouts ?? []).length === 0 ? (
            <p className="text-sm text-[color:var(--color-ink)]/70">
              No workouts yet. Build one in /studio/library, then apply it here.
            </p>
          ) : (
            <ul className="max-h-[55vh] space-y-1 overflow-y-auto pr-1">
              {(workouts ?? []).map((w) => (
                <DraggableWorkoutRow
                  key={w.id}
                  workout={w}
                  onApply={() => onApplyWorkout!(w.id)}
                  pending={pending}
                />
              ))}
            </ul>
          )
        ) : (
          /* Exercises tab (default) — same structure as before. */
          <>
            <Input
              placeholder="search exercises"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="mb-3"
            />
            {sections.length === 0 ? (
              <p className="text-sm text-[color:var(--color-ink)]/70">
                No matches — try a different search.
              </p>
            ) : (
              <ul className="max-h-[55vh] space-y-1 overflow-y-auto pr-1">
                {sections.map((section) => {
                  const open = isOpen(section.key);
                  return (
                    <li key={section.key} className="rounded-2xl">
                      <button
                        type="button"
                        onClick={() => toggle(section.key)}
                        className="flex w-full items-center justify-between gap-2 rounded-xl px-2 py-2 text-left hover:bg-[color:var(--color-parchment)]/60"
                      >
                        <span className="flex items-center gap-2">
                          <Chevron open={open} />
                          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--color-stone)]">
                            {section.name}
                          </span>
                        </span>
                        <span className="text-[11px] tabular-nums text-[color:var(--color-stone)]/80">
                          {section.items.length}
                        </span>
                      </button>
                      {open ? (
                        <ul className="mt-1 space-y-0.5 pl-5">
                          {section.items.map((ex) => (
                            <DraggableExerciseRow
                              key={ex.id}
                              exercise={ex}
                              onAdd={() => onAdd(ex.id)}
                              pending={pending}
                            />
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}

            {onCreate ? (
              <div className="mt-3 border-t border-[color:var(--color-stone-soft)]/60 pt-3">
                {creating ? (
                  <div className="space-y-2">
                    <Input
                      autoFocus
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="exercise name"
                    />
                    <select
                      value={newGroupId}
                      onChange={(e) => setNewGroupId(e.target.value)}
                      className="select-pill h-9 w-full rounded-full border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] text-sm"
                    >
                      <option value="">no group</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-[color:var(--color-stone)]">
                      Quick add — name + group only. You can fill in the video,
                      default sets, and notes from the exercise editor afterward
                      via the{" "}
                      <a
                        href="/studio/library/new"
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-2 hover:text-[color:var(--color-moss-deep)]"
                      >
                        full editor
                      </a>
                      .
                    </p>
                    {createError ? (
                      <p className="text-xs text-[color:var(--color-sienna)]">{createError}</p>
                    ) : null}
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        disabled={savingNew || !newName.trim()}
                        onClick={() =>
                          startSave(async () => {
                            setCreateError(null);
                            const id = await onCreate({
                              name: newName.trim(),
                              groupId: newGroupId || null,
                            });
                            if (!id) {
                              setCreateError("Couldn't save. Try a different name.");
                              return;
                            }
                            setNewName("");
                            setNewGroupId("");
                            setCreating(false);
                          })
                        }
                      >
                        {savingNew ? "saving…" : "create + add"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={savingNew}
                        onClick={() => {
                          setCreating(false);
                          setNewName("");
                          setNewGroupId("");
                          setCreateError(null);
                        }}
                      >
                        cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setCreating(true)}
                    disabled={pending}
                  >
                    + new exercise
                  </Button>
                )}
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
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
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium uppercase tracking-[0.16em] transition-colors ${
        active
          ? "bg-[color:var(--color-ink)] text-[color:var(--color-canvas)]"
          : "text-[color:var(--color-stone)] hover:text-[color:var(--color-ink)]"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * One row in the exercises list. Draggable (via `useDraggable`) so a
 * host with a DndContext can catch a drop and call its own
 * "add this exercise" path; also keeps the literal "add" button so
 * keyboard / no-DnD users (and mobile inside the bottom-sheet
 * drawer) can still attach without touch-and-drag.
 *
 * Two coexistence tricks:
 *
 *   1. The drag listeners are bound to a span wrapper, not the
 *      whole `<li>`. The "add" button has its OWN pointer handlers
 *      and `stopPropagation` on pointerdown so a tap doesn't start
 *      a drag.
 *
 *   2. The host's PointerSensor activation distance (typically 6px)
 *      means a click that doesn't move past that threshold is just
 *      a click. So the button keeps working even though its
 *      container is draggable.
 */
function DraggableExerciseRow({
  exercise,
  onAdd,
  pending,
}: {
  exercise: LibrarySidebarExercise;
  onAdd: () => void;
  pending?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `library-${exercise.id}`,
    data: { type: "library-exercise", exerciseId: exercise.id },
  });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 10 : undefined,
      }}
      className="flex items-center justify-between gap-2 rounded-xl px-2 py-1 hover:bg-[color:var(--color-parchment)]/60"
    >
      <span
        {...attributes}
        {...listeners}
        className="min-w-0 flex-1 cursor-grab truncate text-sm select-none active:cursor-grabbing"
      >
        {exercise.name}
      </span>
      <Button
        size="sm"
        variant="ghost"
        onClick={onAdd}
        onPointerDown={(e) => e.stopPropagation()}
        disabled={pending}
      >
        add
      </Button>
    </li>
  );
}

/**
 * One row under the Workouts tab. Mirrors `DraggableExerciseRow` —
 * span carries the drag listeners, button stays clickable for
 * tap-to-apply.
 *
 * Drag payload: `{ type: "library-workout", workoutId }`. A host
 * that wires this up can route a drop on the session zone to its
 * `applyTemplate` action; session-builder does exactly that.
 */
function DraggableWorkoutRow({
  workout,
  onApply,
  pending,
}: {
  workout: LibrarySidebarWorkout;
  onApply: () => void;
  pending?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `library-workout-${workout.id}`,
    data: { type: "library-workout", workoutId: workout.id },
  });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 10 : undefined,
      }}
      className="flex items-center justify-between gap-3 rounded-xl px-2 py-2 hover:bg-[color:var(--color-parchment)]/60"
    >
      <span
        {...attributes}
        {...listeners}
        className="min-w-0 flex-1 cursor-grab select-none active:cursor-grabbing"
      >
        <p className="truncate text-sm font-medium">{workout.name}</p>
        <p className="mt-0.5 truncate text-[11px] text-[color:var(--color-stone)]">
          {workout.exercise_count} exercise{workout.exercise_count === 1 ? "" : "s"}
          {workout.day_label ? ` · ${workout.day_label}` : null}
        </p>
      </span>
      <Button
        size="sm"
        variant="ghost"
        onClick={onApply}
        onPointerDown={(e) => e.stopPropagation()}
        disabled={pending}
      >
        apply
      </Button>
    </li>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden
      className={`transition-transform ${open ? "rotate-90" : ""} text-[color:var(--color-stone)]`}
    >
      <path d="M3 1.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
