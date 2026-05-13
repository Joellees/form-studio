"use client";

import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
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
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import {
  addExerciseToTemplate,
  archiveTemplate,
  removeTemplateBlock,
  saveTemplateChanges,
} from "../actions";
import { saveExercise } from "@/app/studio/library/actions";
import { LibraryDock } from "@/app/studio/_components/library-dock";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { formatReps, formatWeight, type RepValue, type WeightValue } from "@/lib/set-group";

/* ─── Types ─────────────────────────────────────────────────────── */

type SetGroupRow = {
  id: string;
  order_index: number;
  label: string | null;
  sets: number;
  rep_type: string;
  rep_value: unknown;
  weight_type: string;
  weight_value: unknown;
  rest_seconds: number | null;
  intent_tag: string | null;
};

type BlockExerciseRow = {
  id: string;
  order_index: number;
  setup_override: string | null;
  exercise_id: string;
  exercises: { id: string; name: string; default_descriptor: string | null } | null;
  template_set_groups: SetGroupRow[];
};

type BlockRow = {
  id: string;
  order_index: number;
  round_label: string | null;
  round_count: number;
  round_rest_seconds: number | null;
  template_block_exercises: BlockExerciseRow[];
};

type Props = {
  template: { id: string; name: string; day_label: string | null; description: string | null; archived: boolean };
  blocks: BlockRow[];
  exercises: { id: string; name: string; group_id: string | null }[];
  groups: { id: string; name: string }[];
};

/**
 * Edit-only fields per set group. Anything not in this draft shape
 * stays read-only / immutable from the builder UI.
 */
type SetGroupDraft = {
  sets: number;
  rep_type: string;
  rep_value: RepValue;
  weight_type: string;
  weight_value: WeightValue;
  rest_seconds: number | null;
  label: string | null;
};

/* ─── Component ─────────────────────────────────────────────────── */

/**
 * Workout (session-template) editor.
 *
 * Two recent UX shifts versus the autosave-on-blur era:
 *
 *  1. Drag-and-drop reorder via dnd-kit. Touch + pointer sensors mean
 *     the same drag handles work on trainers' phones and desktops.
 *     Reorder is applied to local state immediately for snappy feel;
 *     persistence happens on the explicit "Save workout" click below.
 *
 *  2. Explicit save. Every set-group field is a controlled input
 *     backed by `drafts` here. The set-group autosave-on-blur path is
 *     gone — edits live in local state until the trainer clicks Save,
 *     at which point we bulk-write via the `saveTemplateChanges`
 *     server action.
 *
 * `addExerciseToTemplate` and `removeTemplateBlock` are still
 * autosave-style on click — those are structural changes, not field
 * edits, and the trainer's mental model is "add/remove is immediate,
 * edits to numbers wait for save".
 *
 * Calendar session logging lives in `session-builder.tsx` and keeps
 * autosave-on-blur (per the product spec — log entries are
 * historical, not a draft to be revised together).
 */
export function TemplateBuilder({ template, blocks: initialBlocks, exercises, groups }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [saving, startSaving] = useTransition();

  /* Server-source-of-truth, refreshed by `router.refresh()` after
   * structural changes (add / remove). Drafts diff against this. */
  const [blocks, setBlocks] = useState<BlockRow[]>(initialBlocks);
  useEffect(() => setBlocks(initialBlocks), [initialBlocks]);

  /* Local draft state for set-group fields, keyed by set_group.id.
   * Only entries the trainer has actually touched land here, so a
   * page with no edits sends nothing on save. */
  const [drafts, setDrafts] = useState<Record<string, Partial<SetGroupDraft>>>({});

  /* Local block ordering, lifted out of `blocks` so the drag preview
   * can mutate it instantly without round-tripping to the server.
   * Synced down from `blocks` whenever the server data changes. */
  const [order, setOrder] = useState<string[]>(() => blocks.map((b) => b.id));
  useEffect(() => {
    setOrder(blocks.map((b) => b.id));
  }, [blocks]);

  /* The persisted server order, captured at the last reload — what
   * "dirty" diffs against. */
  const serverOrderRef = useRef<string[]>(blocks.map((b) => b.id));
  useEffect(() => {
    serverOrderRef.current = blocks.map((b) => b.id);
  }, [blocks]);

  const orderDirty = useMemo(() => {
    const a = order;
    const b = serverOrderRef.current;
    if (a.length !== b.length) return true;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return true;
    }
    return false;
  }, [order]);

  const editsDirty = useMemo(() => {
    for (const key of Object.keys(drafts)) {
      const draft = drafts[key];
      if (draft && Object.keys(draft).length > 0) return true;
    }
    return false;
  }, [drafts]);

  const dirty = orderDirty || editsDirty;

  /* beforeunload prompt — only attaches when there's unsaved work so
   * an admin who's just looking around can navigate away freely. The
   * exact prompt text is browser-controlled (modern Chrome / Safari
   * ignore the message string), but the dialog still fires. */
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      // Some browsers still surface the returnValue string.
      e.returnValue = "You have unsaved changes — leave anyway?";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  /* ─── Mutations ─────────────────────────────────────────────── */

  function setDraftField<K extends keyof SetGroupDraft>(
    setGroupId: string,
    key: K,
    value: SetGroupDraft[K],
  ) {
    setDrafts((prev) => ({
      ...prev,
      [setGroupId]: { ...prev[setGroupId], [key]: value },
    }));
  }

  const addExercise = useCallback(
    (exerciseId: string) => {
      startTransition(async () => {
        try {
          const result = await addExerciseToTemplate({ templateId: template.id, exerciseId });
          if (!result.ok) {
            toast.error(result.error || "Couldn't add the exercise. Try again.");
            return;
          }
          toast.success("Exercise added.");
          router.refresh();
        } catch {
          toast.error("Something went wrong. Try again.");
        }
      });
    },
    [template.id, toast, router],
  );

  async function createAndAddExercise(input: {
    name: string;
    groupId: string | null;
  }): Promise<string | null> {
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
      const attach = await addExerciseToTemplate({
        templateId: template.id,
        exerciseId: result.data.id,
      });
      if (!attach.ok) {
        toast.error(
          attach.error ||
            "Exercise saved to your library, but we couldn't attach it to this workout. Try again.",
        );
        router.refresh();
        return result.data.id;
      }
      toast.success("Exercise added.");
      router.refresh();
      return result.data.id;
    } catch {
      toast.error("Something went wrong. Try again.");
      return null;
    }
  }

  function removeBlock(blockId: string) {
    if (!confirm("Remove this exercise from the template?")) return;
    /* Drop any drafts that belonged to this block so they don't get
     * resurrected on next save. */
    const block = blocks.find((b) => b.id === blockId);
    if (block) {
      const setGroupIds = new Set(
        block.template_block_exercises.flatMap((be) =>
          be.template_set_groups.map((sg) => sg.id),
        ),
      );
      setDrafts((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(next)) {
          if (setGroupIds.has(k)) delete next[k];
        }
        return next;
      });
    }
    startTransition(async () => {
      await removeTemplateBlock(blockId);
      router.refresh();
    });
  }

  function archive() {
    if (!confirm("Archive this template?")) return;
    startTransition(async () => {
      await archiveTemplate(template.id);
      router.push("/studio/templates");
      router.refresh();
    });
  }

  function save() {
    if (!dirty) return;
    const setGroupPayload = Object.entries(drafts)
      .filter(([, draft]) => draft && Object.keys(draft).length > 0)
      .map(([id, draft]) => ({ id, ...draft }));

    startSaving(async () => {
      try {
        const res = await saveTemplateChanges({
          templateId: template.id,
          setGroups: setGroupPayload,
          blockOrder: orderDirty ? order : undefined,
        });
        if (!res.ok) {
          toast.error(res.error || "Couldn't save your changes. Try again.");
          return;
        }
        toast.success("Workout saved.");
        setDrafts({});
        serverOrderRef.current = order;
        router.refresh();
      } catch {
        toast.error("Something went wrong saving the workout.");
      }
    });
  }

  /* ─── DnD setup ─────────────────────────────────────────────── */

  /* Pointer + touch sensors with a small activation distance so a
   * tap-on-an-input doesn't trigger a phantom drag. dnd-kit
   * recommends 5–8px / 250ms for finger-friendly thresholds. */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrder((prev) => {
      const oldIndex = prev.indexOf(String(active.id));
      const newIndex = prev.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  /* Render blocks in the local `order`, mapping each id back to its
   * server row. If `order` falls out of sync with `blocks` (e.g.
   * server refresh inserted a new block), the new one is appended.
   */
  const orderedBlocks = useMemo(() => {
    const byId = new Map(blocks.map((b) => [b.id, b]));
    const used = new Set<string>();
    const out: BlockRow[] = [];
    for (const id of order) {
      const row = byId.get(id);
      if (row) {
        out.push(row);
        used.add(id);
      }
    }
    for (const b of blocks) {
      if (!used.has(b.id)) out.push(b);
    }
    return out;
  }, [order, blocks]);

  return (
    <div className="space-y-8 pb-28">
      <Link
        href="/studio/library?tab=workouts"
        className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)] hover:text-[color:var(--color-moss-deep)]"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
          <path
            d="M6.5 1.5L3 5l3.5 3.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        back to workouts
      </Link>
      <header className="flex items-start justify-between gap-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">template</p>
          <h1 className="mt-2 text-3xl md:text-4xl">{template.name}</h1>
          {template.description ? (
            <p className="mt-2 max-w-2xl text-[color:var(--color-ink)]/75">{template.description}</p>
          ) : null}
        </div>
        <Button variant="outline" onClick={archive} disabled={pending || saving}>
          archive
        </Button>
      </header>

      <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
        <section className="space-y-6">
          {orderedBlocks.length === 0 ? (
            <EmptyState
              bordered
              title="Add the first exercise"
              body="Tap the library button to pick one. You&rsquo;ll configure sets and reps per exercise."
            />
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={order} strategy={verticalListSortingStrategy}>
                <div className="space-y-6">
                  {orderedBlocks.map((block, i) => (
                    <SortableBlockCard
                      key={block.id}
                      index={i + 1}
                      block={block}
                      drafts={drafts}
                      onChange={setDraftField}
                      onRemove={() => removeBlock(block.id)}
                      disabled={pending || saving}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </section>

        <LibraryDock
          exercises={exercises}
          groups={groups}
          onAdd={addExercise}
          onCreate={createAndAddExercise}
          pending={pending}
        />
      </div>

      {/* Sticky save bar — only visible while there are unsaved
       * changes, so a trainer reading the workout isn't distracted
       * by an empty action bar. */}
      {dirty ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[color:var(--color-stone-soft)]/60 bg-[color:var(--color-canvas)]/95 backdrop-blur supports-[backdrop-filter]:bg-[color:var(--color-canvas)]/85">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-3 md:px-6">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
              unsaved changes
            </p>
            <Button onClick={save} disabled={saving} size="sm">
              {saving ? "saving…" : "save workout"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ─── Sortable Block Card ───────────────────────────────────────── */

function SortableBlockCard({
  index,
  block,
  drafts,
  onChange,
  onRemove,
  disabled,
}: {
  index: number;
  block: BlockRow;
  drafts: Record<string, Partial<SetGroupDraft>>;
  onChange: <K extends keyof SetGroupDraft>(setGroupId: string, key: K, value: SetGroupDraft[K]) => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const be = block.template_block_exercises[0];
  if (!be) return null;
  const setGroups = [...be.template_set_groups].sort((a, b) => a.order_index - b.order_index);

  return (
    <div ref={setNodeRef} style={style}>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {/* Drag handle — own element so input clicks inside the
               * card don't accidentally start a drag. */}
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
              <div>
                <p className="text-xs text-[color:var(--color-stone)]">
                  exercise {String(index).padStart(2, "0")}
                </p>
                <CardTitle className="mt-1">{be.exercises?.name ?? "Exercise"}</CardTitle>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={onRemove} disabled={disabled}>
              remove
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {setGroups.length === 0 ? (
            <p className="text-sm text-[color:var(--color-ink)]/70">
              A default set group was created. Edit the values below.
            </p>
          ) : null}
          {setGroups.map((sg) => (
            <SetGroupEditor
              key={sg.id}
              setGroup={sg}
              draft={drafts[sg.id] ?? {}}
              onChange={(k, v) => onChange(sg.id, k, v)}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Set Group Editor (now controlled) ──────────────────────────── */

function SetGroupEditor({
  setGroup,
  draft,
  onChange,
}: {
  setGroup: SetGroupRow;
  draft: Partial<SetGroupDraft>;
  onChange: <K extends keyof SetGroupDraft>(key: K, value: SetGroupDraft[K]) => void;
}) {
  /* Effective values for display: draft wins, else server. */
  const sets = draft.sets ?? setGroup.sets;
  const repType = draft.rep_type ?? setGroup.rep_type;
  const repVal = (draft.rep_value ?? (setGroup.rep_value as RepValue)) as RepValue;
  const weightType = draft.weight_type ?? setGroup.weight_type;
  const weightVal = (draft.weight_value ?? (setGroup.weight_value as WeightValue)) as WeightValue;
  const rest = draft.rest_seconds !== undefined ? draft.rest_seconds : setGroup.rest_seconds;

  return (
    <div className="rounded-xl border border-[color:var(--color-stone-soft)]/60 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label>sets</Label>
          <Input
            type="number"
            min={1}
            value={sets}
            onChange={(e) => onChange("sets", Number(e.target.value) || 1)}
            className="w-20"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label>reps</Label>
          <select
            value={repType}
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
              onChange("rep_type", next);
              onChange("rep_value", defaults[next] ?? ({ type: next } as RepValue));
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
        </div>

        {repType === "fixed" && repVal?.type === "fixed" ? (
          <div className="flex flex-col gap-1">
            <Label>reps</Label>
            <Input
              type="number"
              min={1}
              value={repVal.reps}
              onChange={(e) =>
                onChange("rep_value", { type: "fixed", reps: Number(e.target.value) || 1 } as RepValue)
              }
              className="w-20"
            />
          </div>
        ) : null}

        {repType === "range" && repVal?.type === "range" ? (
          <div className="flex items-end gap-2">
            <div className="flex flex-col gap-1">
              <Label>min</Label>
              <Input
                type="number"
                min={1}
                value={repVal.min}
                onChange={(e) =>
                  onChange("rep_value", {
                    type: "range",
                    min: Number(e.target.value) || 1,
                    max: repVal.max,
                  } as RepValue)
                }
                className="w-20"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label>max</Label>
              <Input
                type="number"
                min={1}
                value={repVal.max}
                onChange={(e) =>
                  onChange("rep_value", {
                    type: "range",
                    min: repVal.min,
                    max: Number(e.target.value) || 1,
                  } as RepValue)
                }
                className="w-20"
              />
            </div>
          </div>
        ) : null}

        {repType === "time" && repVal?.type === "time" ? (
          <div className="flex flex-col gap-1">
            <Label>seconds</Label>
            <Input
              type="number"
              min={1}
              value={repVal.seconds}
              onChange={(e) =>
                onChange("rep_value", { type: "time", seconds: Number(e.target.value) || 30 } as RepValue)
              }
              className="w-24"
            />
          </div>
        ) : null}

        {repType === "hold" && repVal?.type === "hold" ? (
          <div className="flex flex-col gap-1">
            <Label>hold (s)</Label>
            <Input
              type="number"
              min={1}
              value={repVal.seconds}
              onChange={(e) =>
                onChange("rep_value", { type: "hold", seconds: Number(e.target.value) || 10 } as RepValue)
              }
              className="w-24"
            />
          </div>
        ) : null}

        <div className="flex flex-col gap-1">
          <Label>weight</Label>
          <select
            value={weightType}
            onChange={(e) => {
              const next = e.target.value;
              const defaults: Record<string, WeightValue> = {
                load: { type: "load", kg: 0 },
                bw: { type: "bw" },
                percentage: { type: "percentage", of: "1RM", percent: 70 },
                intensity: { type: "intensity", descriptor: "moderate" },
                blank: { type: "blank" },
              };
              onChange("weight_type", next);
              onChange("weight_value", defaults[next] ?? ({ type: next } as WeightValue));
            }}
            className="h-9 rounded-xl border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] px-3 text-sm"
          >
            <option value="load">kg</option>
            <option value="bw">bw</option>
            <option value="percentage">% of</option>
            <option value="intensity">intensity</option>
            <option value="blank">blank</option>
          </select>
        </div>

        {weightType === "load" && weightVal?.type === "load" ? (
          <div className="flex flex-col gap-1">
            <Label>kg</Label>
            <Input
              type="number"
              step="0.5"
              min={0}
              value={weightVal.kg}
              onChange={(e) =>
                onChange("weight_value", {
                  type: "load",
                  kg: Number(e.target.value) || 0,
                  paired: weightVal.paired,
                } as WeightValue)
              }
              className="w-24"
            />
          </div>
        ) : null}

        <div className="flex flex-col gap-1">
          <Label>rest (s)</Label>
          <Input
            type="number"
            min={0}
            value={rest ?? 0}
            onChange={(e) => onChange("rest_seconds", Number(e.target.value) || null)}
            className="w-24"
          />
        </div>

        <div className="ml-auto flex items-center gap-2 pb-1">
          <Badge tone="stone">{formatReps(repVal)}</Badge>
          <Badge tone="stone">{formatWeight(weightVal)}</Badge>
        </div>
      </div>
    </div>
  );
}
