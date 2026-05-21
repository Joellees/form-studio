"use client";

import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import {
  addExerciseToSession,
  applyTemplateToSession,
  logPerformedSet,
  removeSessionBlock,
  reorderSessionBlocks,
  updateSessionNotes,
  updateSessionSetGroup,
} from "./actions";
import { saveExercise } from "@/app/studio/library/actions";
import { LibraryDock } from "@/app/studio/_components/library-dock";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { formatReps, formatWeight, type RepValue, type WeightValue } from "@/lib/set-group";

type SetGroup = {
  id: string;
  order_index: number;
  label: string | null;
  sets: number;
  rep_type: string;
  rep_value: unknown;
  weight_type: string;
  weight_value: unknown;
  rest_seconds: number | null;
  performed_sets: number | null;
  performed_notes: string | null;
};

type BlockExercise = {
  id: string;
  order_index: number;
  exercises: { id: string; name: string; default_descriptor: string | null; video_url: string | null } | null;
  session_set_groups: SetGroup[];
  /** Workout template this row was seeded from, if any. Powers the
   * "from <workout name>" breadcrumb on the card. Optional in the
   * type because the column was added in migration 0013 — pre-
   * migration rows simply don't have it. */
  source_template_id?: string | null;
};

type Block = {
  id: string;
  order_index: number;
  session_block_exercises: BlockExercise[];
};

type LibraryExercise = { id: string; name: string; group_id: string | null };
type LibraryGroup = { id: string; name: string };
type LibraryWorkout = {
  id: string;
  name: string;
  day_label: string | null;
  exercise_count: number;
};

type SessionBuilderProps = {
  sessionId: string;
  sessionNotes: string | null;
  canEdit: boolean; // trainer = true, client viewing = false
  blocks: Block[];
  library: LibraryExercise[];
  libraryGroups?: LibraryGroup[];
  /** Workout templates owned by this trainer; rendered under the
   * Workouts tab in the library sidebar. Apply = expand template
   * into session_block_exercises + session_set_groups. */
  workouts?: LibraryWorkout[];
};

/**
 * Calendar session builder.
 *
 * Mirrors `template-builder.tsx` for drag-and-drop reorder via
 * dnd-kit, but keeps autosave-on-blur for set-group field edits and
 * the performed-set log row. The trainer's mental model in the
 * calendar surface is different: they're recording what happened in
 * a live session, so each input should commit the moment focus
 * leaves it — no risk of losing a logged rep count if the trainer
 * forgets to hit save before navigating away. Workout templates, by
 * contrast, are draft documents that benefit from an explicit save.
 *
 * Reorder is applied to local state immediately on drag-end and
 * persisted via `reorderSessionBlocks`. If the server write fails,
 * the next `router.refresh()` (issued by autosave or a subsequent
 * mutation) snaps local state back to truth.
 */
export function SessionBuilder({
  sessionId,
  sessionNotes,
  canEdit,
  blocks: initialBlocks,
  library,
  libraryGroups = [],
  workouts = [],
}: SessionBuilderProps) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();

  /* Local block order, lifted out of props so a drag preview mutates
   * instantly. Synced down whenever the server data changes. */
  const [order, setOrder] = useState<string[]>(() => initialBlocks.map((b) => b.id));
  useEffect(() => setOrder(initialBlocks.map((b) => b.id)), [initialBlocks]);

  /* Pointer + touch sensors with the same activation thresholds as
   * the template builder for consistent feel across surfaces. */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    /* Cross-area drag #1: a library exercise was dragged onto the
     * session zone (or one of its block cards). The payload from
     * `library-sidebar.tsx`'s DraggableExerciseRow names itself
     * "library-exercise" + carries the exerciseId. */
    const activeData = active.data.current as
      | { type?: string; exerciseId?: string; workoutId?: string }
      | undefined;
    if (activeData?.type === "library-exercise" && activeData.exerciseId) {
      const dropTargetId = String(over.id);
      if (dropTargetId === "session-zone" || order.includes(dropTargetId)) {
        addExercise(activeData.exerciseId);
      }
      return;
    }

    /* Cross-area drag #2: a workout template dragged in from the
     * Workouts tab. Same destinations as #1. */
    if (activeData?.type === "library-workout" && activeData.workoutId) {
      const dropTargetId = String(over.id);
      if (dropTargetId === "session-zone" || order.includes(dropTargetId)) {
        applyWorkout(activeData.workoutId);
      }
      return;
    }

    /* Reorder: same path as before. */
    if (active.id === over.id) return;
    const newOrder = (() => {
      const oldIndex = order.indexOf(String(active.id));
      const newIndex = order.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return order;
      return arrayMove(order, oldIndex, newIndex);
    })();
    setOrder(newOrder);
    startTransition(async () => {
      const res = await reorderSessionBlocks({ sessionId, blockIds: newOrder });
      if (!res.ok) {
        toast.error(res.error || "Couldn't save the new order.");
        router.refresh();
      }
    });
  }

  function applyWorkout(workoutId: string) {
    startTransition(async () => {
      try {
        const res = await applyTemplateToSession({ sessionId, templateId: workoutId });
        if (!res.ok) {
          toast.error(res.error || "Couldn't apply the workout.");
          return;
        }
        const n = res.data.blocksAdded;
        toast.success(`workout applied — ${n} exercise${n === 1 ? "" : "s"} added.`);
        router.refresh();
      } catch {
        toast.error("Something went wrong. Try again.");
      }
    });
  }

  const orderedBlocks = useMemo(() => {
    const byId = new Map(initialBlocks.map((b) => [b.id, b]));
    const used = new Set<string>();
    const out: Block[] = [];
    for (const id of order) {
      const row = byId.get(id);
      if (row) {
        out.push(row);
        used.add(id);
      }
    }
    for (const b of initialBlocks) {
      if (!used.has(b.id)) out.push(b);
    }
    return out;
  }, [order, initialBlocks]);

  /* Lookup table: source_template_id → workout name. Used to render
   * the "from <workout>" breadcrumb on each session block card. The
   * map is over the same `workouts` array the sidebar's Workouts tab
   * renders, so this costs nothing extra — same data. */
  const workoutNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of workouts) m.set(w.id, w.name);
    return m;
  }, [workouts]);

  function workoutNameForBlock(block: Block): string | null {
    const be = block.session_block_exercises[0];
    const id = be?.source_template_id ?? null;
    if (!id) return null;
    return workoutNameById.get(id) ?? null;
  }

  async function createAndAddExercise(input: { name: string; groupId: string | null }): Promise<string | null> {
    try {
      const result = await saveExercise({
        name: input.name,
        group_id: input.groupId,
        equipment: null,
        is_timed: false,
        default_rep_type: "fixed",
        default_rep_value: {
          type: "sets",
          sets: [{ reps: 10, mode: "reps", kg: 0, rest: 60 }],
        },
        default_rest_seconds: 60,
        notes: null,
        video_url: null,
      });
      if (!result.ok) {
        toast.error(result.error || "Couldn't save the exercise.");
        return null;
      }
      const attach = await addExerciseToSession({ sessionId, exerciseId: result.data.id });
      if (!attach.ok) {
        toast.error(
          attach.error ||
            "Exercise saved to your library, but we couldn't attach it to this session. Try again.",
        );
        router.refresh();
        return result.data.id;
      }
      toast.success("exercise added.");
      router.refresh();
      return result.data.id;
    } catch {
      toast.error("Something went wrong. Try again.");
      return null;
    }
  }

  function addExercise(exerciseId: string) {
    startTransition(async () => {
      try {
        const result = await addExerciseToSession({ sessionId, exerciseId });
        if (!result.ok) {
          toast.error(result.error || "Couldn't add the exercise. Try again.");
          return;
        }
        toast.success("exercise added.");
        router.refresh();
      } catch {
        toast.error("Something went wrong. Try again.");
      }
    });
  }

  async function removeBlock(id: string) {
    const ok = await confirm({
      title: "remove this exercise from the session?",
      body: "any logged sets on this exercise will be discarded.",
      confirmLabel: "remove",
      tone: "danger",
    });
    if (!ok) return;
    startTransition(async () => {
      await removeSessionBlock(id);
      router.refresh();
    });
  }

  /* Read-only path for clients — same structure but no DndContext or
   * library on the side. Lives in its own return for clarity. */
  if (!canEdit) {
    return (
      <div className="space-y-6">
        <NotesBlock sessionId={sessionId} initial={sessionNotes} canEdit={false} />
        {orderedBlocks.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-[color:var(--color-stone-soft)] px-6 py-10 text-center">
            <p className="text-sm font-semibold">No exercises yet</p>
            <p className="mt-1 text-sm text-[color:var(--color-ink)]/70">
              Your trainer hasn&rsquo;t prescribed a workout yet.
            </p>
          </div>
        ) : (
          orderedBlocks.map((block, i) => (
            <BlockCardInner
              key={block.id}
              block={block}
              index={i}
              canEdit={false}
              pending={false}
              onRemove={() => {}}
              dragHandle={null}
              sourceWorkoutName={workoutNameForBlock(block)}
            />
          ))
        )}
      </div>
    );
  }

  /* Trainer path — DndContext wraps BOTH the session column and the
   * library dock so a drag started in the library can land on the
   * session zone. handleDragEnd inspects active.data.current.type to
   * distinguish library-exercise/library-workout cross-area drops
   * from block-to-block reorders within the SortableContext. */
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
        <SessionDropZone>
          <NotesBlock sessionId={sessionId} initial={sessionNotes} canEdit={true} />
          {orderedBlocks.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[color:var(--color-stone-soft)] px-6 py-10 text-center">
              <p className="text-sm font-semibold">No exercises yet</p>
              <p className="mt-1 text-sm text-[color:var(--color-ink)]/70">
                Pick an exercise or apply a workout from the library on the right —
                tap or drag.
              </p>
            </div>
          ) : (
            <SortableContext items={order} strategy={verticalListSortingStrategy}>
              <div className="space-y-6">
                {orderedBlocks.map((block, i) => (
                  <SortableSessionBlock
                    key={block.id}
                    block={block}
                    index={i}
                    canEdit={true}
                    pending={pending}
                    onRemove={() => void removeBlock(block.id)}
                    sourceWorkoutName={workoutNameForBlock(block)}
                  />
                ))}
              </div>
            </SortableContext>
          )}
        </SessionDropZone>

        <LibraryDock
          exercises={library}
          groups={libraryGroups}
          workouts={workouts}
          onAdd={addExercise}
          onApplyWorkout={applyWorkout}
          onCreate={createAndAddExercise}
          pending={pending}
        />
      </div>
    </DndContext>
  );
}

/**
 * Drop zone wrapping the session column. Lights up with a dashed
 * moss outline + parchment tint while a library item is over it,
 * so the trainer can see the target before releasing. The droppable
 * id is the constant "session-zone" that handleDragEnd checks
 * against (block ids inside the SortableContext use UUIDs, so the
 * two namespaces don't collide).
 */
function SessionDropZone({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: "session-zone" });
  return (
    <section
      ref={setNodeRef}
      className={`space-y-6 rounded-3xl transition-colors ${
        isOver
          ? "bg-[color:var(--color-parchment)]/40 ring-2 ring-dashed ring-[color:var(--color-moss)]/50"
          : ""
      }`}
    >
      {children}
    </section>
  );
}

/* ─── Sortable wrapper around an editable block card ─────────────── */

function SortableSessionBlock({
  block,
  index,
  canEdit,
  pending,
  onRemove,
  sourceWorkoutName,
}: {
  block: Block;
  index: number;
  canEdit: boolean;
  pending: boolean;
  onRemove: () => void;
  sourceWorkoutName?: string | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <BlockCardInner
        block={block}
        index={index}
        canEdit={canEdit}
        pending={pending}
        onRemove={onRemove}
        sourceWorkoutName={sourceWorkoutName}
        dragHandle={
          <button
            type="button"
            aria-label="drag to reorder"
            {...attributes}
            {...listeners}
            className="cursor-grab touch-none rounded-md p-1 text-[color:var(--color-stone)] hover:bg-[color:var(--color-parchment)] active:cursor-grabbing"
          >
            <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor" aria-hidden>
              <circle cx="3" cy="3" r="1.4" />
              <circle cx="9" cy="3" r="1.4" />
              <circle cx="3" cy="8" r="1.4" />
              <circle cx="9" cy="8" r="1.4" />
              <circle cx="3" cy="13" r="1.4" />
              <circle cx="9" cy="13" r="1.4" />
            </svg>
          </button>
        }
      />
    </div>
  );
}

function BlockCardInner({
  block,
  index,
  canEdit,
  pending,
  onRemove,
  dragHandle,
  sourceWorkoutName,
}: {
  block: Block;
  index: number;
  canEdit: boolean;
  pending: boolean;
  onRemove: () => void;
  dragHandle: React.ReactNode;
  /** Resolved name of the workout this row was seeded from, if any.
   * The session page builds a `workoutsById` map from the workouts
   * list and threads each block's name through here. */
  sourceWorkoutName?: string | null;
}) {
  const be = block.session_block_exercises[0];
  if (!be) return null;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {dragHandle}
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
                exercise {String(index + 1).padStart(2, "0")}
              </p>
              <CardTitle className="mt-1">{be.exercises?.name ?? "Exercise"}</CardTitle>
              {/* Breadcrumb: which workout template seeded this row.
                * Only renders when `source_template_id` is set AND we
                * have a name for it (i.e., the template still exists
                * — deleted ones SET NULL the FK and the breadcrumb
                * silently disappears). */}
              {sourceWorkoutName ? (
                <p className="mt-1 text-[11px] text-[color:var(--color-moss-deep)]">
                  from <span className="font-medium">{sourceWorkoutName}</span>
                </p>
              ) : null}
              {be.exercises?.default_descriptor ? (
                <p className="mt-1 text-xs text-[color:var(--color-ink)]/70">
                  {be.exercises.default_descriptor}
                </p>
              ) : null}
              {/* Reassurance line — same scoping pattern as the
                * template builder. Both the prescribed-set edits
                * (sets/reps/weight/rest) and the performed-set log
                * (done/notes) write to this session's
                * `session_set_groups` row only. The library
                * exercise + any workout templates that include it
                * stay untouched. Hidden in read-only client view. */}
              {canEdit ? (
                <p className="mt-1 text-[11px] italic text-[color:var(--color-ink)]/60">
                  Edits below apply to this session only — your library exercise
                  and workout templates stay the same.
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {be.exercises?.video_url ? (
              <a
                href={be.exercises.video_url}
                target="_blank"
                rel="noreferrer"
                className="text-xs underline underline-offset-4 text-[color:var(--color-moss-deep)] hover:text-[color:var(--color-ink)]"
              >
                watch video
              </a>
            ) : null}
            {canEdit ? (
              <Button variant="ghost" size="sm" onClick={onRemove} disabled={pending}>
                remove
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {[...be.session_set_groups]
          .sort((a, b) => a.order_index - b.order_index)
          .map((sg) => (
            <SetGroupRow key={sg.id} setGroup={sg} canEdit={canEdit} />
          ))}
      </CardContent>
    </Card>
  );
}

function NotesBlock({
  sessionId,
  initial,
  canEdit,
}: {
  sessionId: string;
  initial: string | null;
  canEdit: boolean;
}) {
  const [, startTransition] = useTransition();
  const [value, setValue] = useState(initial ?? "");

  function save(next: string) {
    startTransition(async () => {
      await updateSessionNotes({ sessionId, notes: next });
    });
  }

  if (!canEdit && !value) return null;

  return (
    <div>
      <Label htmlFor="session-notes">notes</Label>
      {canEdit ? (
        <Textarea
          id="session-notes"
          rows={3}
          className="mt-2"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => save(value)}
          placeholder="Free text for the trainer. Visible to the client."
        />
      ) : (
        <p className="mt-2 whitespace-pre-wrap rounded-2xl bg-[color:var(--color-parchment)]/60 px-5 py-4 text-sm text-[color:var(--color-ink)]/85">
          {value}
        </p>
      )}
    </div>
  );
}

function SetGroupRow({ setGroup, canEdit }: { setGroup: SetGroup; canEdit: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const repVal = setGroup.rep_value as RepValue;
  const weightVal = setGroup.weight_value as WeightValue;

  function saveGroup(partial: {
    sets?: number;
    rep_type?: string;
    rep_value?: unknown;
    weight_type?: string;
    weight_value?: unknown;
    rest_seconds?: number | null;
    label?: string | null;
  }) {
    startTransition(async () => {
      await updateSessionSetGroup({ id: setGroup.id, ...partial });
      router.refresh();
    });
  }
  function savePerformed(partial: { performed_sets?: number; performed_notes?: string | null }) {
    startTransition(async () => {
      await logPerformedSet({ id: setGroup.id, ...partial });
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-[color:var(--color-stone-soft)]/60 p-4">
      {canEdit ? (
        <div className="flex flex-wrap items-end gap-3">
          <Field label="sets">
            <Input
              type="number"
              min={1}
              defaultValue={setGroup.sets}
              onBlur={(e) => saveGroup({ sets: Number(e.target.value) || 1 })}
              className="h-9 w-20"
            />
          </Field>
          <Field label="reps">
            <select
              defaultValue={setGroup.rep_type}
              onChange={(e) => {
                const next = e.target.value;
                const defaults: Record<string, RepValue> = {
                  fixed: { type: "fixed", reps: 10 },
                  range: { type: "range", min: 8, max: 12 },
                  time: { type: "time", seconds: 45 },
                  hold: { type: "hold", seconds: 10 },
                  unilateral: { type: "unilateral", per_side: 8 },
                  amrap: { type: "amrap" },
                  single: { type: "single" },
                };
                saveGroup({ rep_type: next, rep_value: defaults[next] ?? { type: next } });
              }}
              className="h-9 rounded-xl border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] px-3 text-sm"
            >
              <option value="fixed">fixed</option>
              <option value="range">range</option>
              <option value="time">time</option>
              <option value="hold">hold</option>
              <option value="unilateral">per side</option>
              <option value="amrap">amrap</option>
              <option value="single">single</option>
            </select>
          </Field>
          {setGroup.rep_type === "fixed" && repVal?.type === "fixed" ? (
            <Field label="reps">
              <Input
                type="number"
                min={1}
                defaultValue={repVal.reps}
                onBlur={(e) => saveGroup({ rep_value: { type: "fixed", reps: Number(e.target.value) || 1 } })}
                className="h-9 w-20"
              />
            </Field>
          ) : null}
          {setGroup.rep_type === "range" && repVal?.type === "range" ? (
            <div className="flex items-end gap-2">
              <Field label="min">
                <Input
                  type="number"
                  min={1}
                  defaultValue={repVal.min}
                  onBlur={(e) =>
                    saveGroup({ rep_value: { type: "range", min: Number(e.target.value) || 1, max: repVal.max } })
                  }
                  className="h-9 w-20"
                />
              </Field>
              <Field label="max">
                <Input
                  type="number"
                  min={1}
                  defaultValue={repVal.max}
                  onBlur={(e) =>
                    saveGroup({ rep_value: { type: "range", min: repVal.min, max: Number(e.target.value) || 1 } })
                  }
                  className="h-9 w-20"
                />
              </Field>
            </div>
          ) : null}
          {setGroup.rep_type === "time" && repVal?.type === "time" ? (
            <Field label="seconds">
              <Input
                type="number"
                min={1}
                defaultValue={repVal.seconds}
                onBlur={(e) => saveGroup({ rep_value: { type: "time", seconds: Number(e.target.value) || 30 } })}
                className="h-9 w-24"
              />
            </Field>
          ) : null}
          {setGroup.rep_type === "hold" && repVal?.type === "hold" ? (
            <Field label="hold (s)">
              <Input
                type="number"
                min={1}
                defaultValue={repVal.seconds}
                onBlur={(e) => saveGroup({ rep_value: { type: "hold", seconds: Number(e.target.value) || 10 } })}
                className="h-9 w-24"
              />
            </Field>
          ) : null}
          <Field label="weight">
            <select
              defaultValue={setGroup.weight_type}
              onChange={(e) => {
                const next = e.target.value;
                const defaults: Record<string, WeightValue> = {
                  load: { type: "load", kg: 0 },
                  bw: { type: "bw" },
                  percentage: { type: "percentage", of: "1RM", percent: 70 },
                  intensity: { type: "intensity", descriptor: "moderate" },
                  blank: { type: "blank" },
                };
                saveGroup({ weight_type: next, weight_value: defaults[next] ?? { type: next } });
              }}
              className="h-9 rounded-xl border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] px-3 text-sm"
            >
              <option value="load">kg</option>
              <option value="bw">bw</option>
              <option value="percentage">% of</option>
              <option value="intensity">intensity</option>
              <option value="blank">blank</option>
            </select>
          </Field>
          {setGroup.weight_type === "load" && weightVal?.type === "load" ? (
            <Field label="kg">
              <Input
                type="number"
                step="0.5"
                min={0}
                defaultValue={weightVal.kg}
                onBlur={(e) =>
                  saveGroup({ weight_value: { type: "load", kg: Number(e.target.value) || 0, paired: weightVal.paired } })
                }
                className="h-9 w-24"
              />
            </Field>
          ) : null}
          <Field label="rest (s)">
            <Input
              type="number"
              min={0}
              defaultValue={setGroup.rest_seconds ?? 0}
              onBlur={(e) => saveGroup({ rest_seconds: Number(e.target.value) || null })}
              className="h-9 w-24"
            />
          </Field>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Badge tone="stone">{setGroup.sets} × {formatReps(repVal)}</Badge>
          <Badge tone="stone">{formatWeight(weightVal)}</Badge>
          {setGroup.rest_seconds ? <Badge tone="stone">rest {setGroup.rest_seconds}s</Badge> : null}
        </div>
      )}

      {/* Performed row */}
      <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-[color:var(--color-stone-soft)]/50 pt-3">
        <Field label="done">
          <Input
            type="number"
            min={0}
            defaultValue={setGroup.performed_sets ?? ""}
            onBlur={(e) => savePerformed({ performed_sets: Number(e.target.value) || 0 })}
            className="h-9 w-20"
            placeholder="0"
          />
        </Field>
        <Field label="notes">
          <Input
            defaultValue={setGroup.performed_notes ?? ""}
            onBlur={(e) => savePerformed({ performed_notes: e.target.value || null })}
            className="h-9 min-w-[14rem]"
            placeholder="felt strong / missed last rep / …"
          />
        </Field>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
