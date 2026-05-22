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
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

import {
  addExerciseToTemplate,
  archiveTemplate,
  removeTemplateBlock,
  saveTemplateChanges,
} from "../actions";
import { saveExercise } from "@/app/studio/library/actions";
import { LibraryDock } from "@/app/studio/_components/library-dock";
import { ApplyToSessionButton } from "./apply-to-session-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/components/ui/toast";
import {
  FIELD_DESCRIPTIONS,
  FIELD_KEYS,
  FIELD_LABELS,
  INLINE_FIELD_KEYS,
  parseActiveFields,
  type FieldKey,
  type RepValue,
  type WeightValue,
} from "@/lib/set-group";

/* ─── Types ─────────────────────────────────────────────────────── */

type SetGroupRow = {
  id: string;
  order_index: number;
  label: string | null;
  sets: number;
  rep_type: string | null;
  rep_value: unknown;
  weight_type: string | null;
  weight_value: unknown;
  rest_seconds: number | null;
  intent_tag: string | null;
  active_fields?: unknown;
  tempo?: string | null;
  rpe?: string | null;
  time_seconds?: number | null;
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
  template: {
    id: string;
    name: string;
    day_label: string | null;
    description: string | null;
    archived: boolean;
  };
  blocks: BlockRow[];
  exercises: { id: string; name: string; group_id: string | null }[];
  groups: { id: string; name: string }[];
};

/**
 * Local draft shape per set group. Anything not in this map stays at
 * its server value. Only entries the trainer has actually touched
 * land here, so a page with no edits sends nothing on save.
 *
 * Field-typed columns are nullable post-migration 0015 — null means
 * "this field isn't active on this set group". `active_fields` carries
 * the trainer's opt-in selection.
 */
type SetGroupDraft = {
  sets: number;
  rep_type: string | null;
  rep_value: unknown;
  weight_type: string | null;
  weight_value: unknown;
  rest_seconds: number | null;
  label: string | null;
  active_fields: FieldKey[];
  tempo: string | null;
  rpe: string | null;
  time_seconds: number | null;
};

/* ─── Component ─────────────────────────────────────────────────── */

/**
 * Workout (session-template) editor — redesigned around opt-in fields.
 *
 * Each exercise row shows only Sets by default. The trainer adds Reps,
 * Weight, Tempo, RPE, Time, or Rest from a "+ add field" popover next
 * to the Sets cell; each added field becomes an inline editable cell
 * flowing left-to-right (or wraps on narrow viewports). Rest is the
 * one special case — when added, it renders as its own subordinate
 * sub-row directly below the main field row, since it's a single
 * whole-exercise value rather than a per-set parameter.
 *
 * Fields are per-exercise — adding Weight to one exercise doesn't add
 * it to others. The per-exercise ⋮ menu surfaces "Edit fields" to
 * re-open the popover for removal, plus "Remove exercise".
 *
 * Persistence shape:
 *   - The set-group autosave-on-blur path is gone. All field edits
 *     live in local `drafts` state until the trainer clicks Save.
 *   - Save bulk-writes via `saveTemplateChanges`. Adding or removing
 *     a field is an edit (changes `active_fields`), so opt-in
 *     selections also wait for Save. That keeps the mental model
 *     consistent: numbers AND field choices both commit together.
 *   - Drag-reorder and add/remove-exercise are still
 *     autosave-on-click since they're structural, not field-level.
 *
 * Calendar session logging lives in `session-builder.tsx` and keeps
 * autosave-on-blur — log entries are historical, not a draft to be
 * revised together.
 */
export function TemplateBuilder({
  template,
  blocks: initialBlocks,
  exercises,
  groups,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const [saving, startSaving] = useTransition();

  const [blocks, setBlocks] = useState<BlockRow[]>(initialBlocks);
  useEffect(() => setBlocks(initialBlocks), [initialBlocks]);

  const [drafts, setDrafts] = useState<Record<string, Partial<SetGroupDraft>>>({});

  const [order, setOrder] = useState<string[]>(() => blocks.map((b) => b.id));
  useEffect(() => {
    setOrder(blocks.map((b) => b.id));
  }, [blocks]);

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

  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
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

  /**
   * Bulk-update one set group with several fields at once — used when
   * adding or removing a field, which often pairs an `active_fields`
   * change with a value reset (e.g. removing Weight clears the kg).
   */
  function setDraftMany(setGroupId: string, patch: Partial<SetGroupDraft>) {
    setDrafts((prev) => ({
      ...prev,
      [setGroupId]: { ...prev[setGroupId], ...patch },
    }));
  }

  const addExercise = useCallback(
    (exerciseId: string) => {
      startTransition(async () => {
        try {
          const result = await addExerciseToTemplate({
            templateId: template.id,
            exerciseId,
          });
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
      toast.success("exercise added.");
      router.refresh();
      return result.data.id;
    } catch {
      toast.error("Something went wrong. Try again.");
      return null;
    }
  }

  async function removeBlock(blockId: string) {
    const ok = await confirm({
      title: "remove this exercise from the workout?",
      body: "your library exercise stays — only this row is removed.",
      confirmLabel: "remove",
      tone: "danger",
    });
    if (!ok) return;
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

  async function archive() {
    const ok = await confirm({
      title: "archive this workout?",
      body: "you'll still see it in archived workouts and can restore it anytime.",
      confirmLabel: "archive",
      tone: "danger",
    });
    if (!ok) return;
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
        toast.success("workout saved.");
        setDrafts({});
        serverOrderRef.current = order;
        router.refresh();
      } catch {
        toast.error("Something went wrong saving the workout.");
      }
    });
  }

  /* ─── DnD setup ─────────────────────────────────────────────── */

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current as
      | { type?: string; exerciseId?: string }
      | undefined;
    if (activeData?.type === "library-exercise" && activeData.exerciseId) {
      const dropTargetId = String(over.id);
      if (dropTargetId === "workout-zone" || order.includes(dropTargetId)) {
        addExercise(activeData.exerciseId);
      }
      return;
    }

    if (active.id === over.id) return;
    setOrder((prev) => {
      const oldIndex = prev.indexOf(String(active.id));
      const newIndex = prev.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

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
    <div className="space-y-8">
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
      <PageHeader
        eyebrow="workout"
        title={template.name}
        subtitle={template.description ?? undefined}
        actions={
          <>
            <ApplyToSessionButton
              templateId={template.id}
              templateName={template.name}
            />
            <Button variant="outline" onClick={archive} disabled={pending || saving}>
              archive
            </Button>
            <Button onClick={save} disabled={!dirty || saving}>
              {saving ? "saving…" : "save workout"}
            </Button>
          </>
        }
      />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
          <WorkoutDropZone>
            {orderedBlocks.length === 0 ? (
              <EmptyState
                bordered
                title="Add the first exercise"
                body="Drag one from the library, or tap the library button to pick one. Each exercise starts with just Sets — add reps, weight, tempo, rpe, time, or rest as you need them."
              />
            ) : (
              <SortableContext items={order} strategy={verticalListSortingStrategy}>
                <div className="space-y-6">
                  {orderedBlocks.map((block, i) => (
                    <SortableBlockCard
                      key={block.id}
                      index={i + 1}
                      block={block}
                      drafts={drafts}
                      onChange={setDraftField}
                      onChangeMany={setDraftMany}
                      onRemove={() => {
                        void removeBlock(block.id);
                      }}
                      disabled={pending || saving}
                    />
                  ))}
                </div>
              </SortableContext>
            )}
          </WorkoutDropZone>

          <LibraryDock
            exercises={exercises}
            groups={groups}
            onAdd={addExercise}
            onCreate={createAndAddExercise}
            pending={pending}
          />
        </div>
      </DndContext>
    </div>
  );
}

/* ─── Workout Drop Zone ─────────────────────────────────────────── */

function WorkoutDropZone({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: "workout-zone" });
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

/* ─── Sortable Block Card ───────────────────────────────────────── */

function SortableBlockCard({
  index,
  block,
  drafts,
  onChange,
  onChangeMany,
  onRemove,
  disabled,
}: {
  index: number;
  block: BlockRow;
  drafts: Record<string, Partial<SetGroupDraft>>;
  onChange: <K extends keyof SetGroupDraft>(
    setGroupId: string,
    key: K,
    value: SetGroupDraft[K],
  ) => void;
  onChangeMany: (setGroupId: string, patch: Partial<SetGroupDraft>) => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: block.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [menuOpen, setMenuOpen] = useState(false);
  /* The ⋮ menu surfaces "Edit fields" — which we route into the
   * per-row popover by setting `forceFieldMenuOpen` on the editor. The
   * editor exposes a ref-like state via this lifted boolean so the
   * popover can be opened from outside its own button (the ⋮ menu
   * lives on the card header, the popover anchor lives in the row).
   * On flip back to false, the editor closes its popover normally. */
  const [editFieldsForSgId, setEditFieldsForSgId] = useState<string | null>(null);

  const be = block.template_block_exercises[0];
  if (!be) return null;
  const setGroups = [...be.template_set_groups].sort(
    (a, b) => a.order_index - b.order_index,
  );

  return (
    <div ref={setNodeRef} style={style}>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="drag to reorder"
                {...attributes}
                {...listeners}
                className="cursor-grab touch-none rounded-md p-1 text-[color:var(--color-stone)] hover:bg-[color:var(--color-parchment)] active:cursor-grabbing"
              >
                <svg
                  width="12"
                  height="16"
                  viewBox="0 0 12 16"
                  fill="currentColor"
                  aria-hidden
                >
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
                <CardTitle className="mt-1">
                  {be.exercises?.name ?? "Exercise"}
                </CardTitle>
              </div>
            </div>
            {/* ⋮ menu — single source of truth for per-exercise actions.
              * Edit fields → opens the field popover on the first (or
              * only) set group of this exercise. Remove exercise →
              * confirms then deletes. */}
            <div className="relative">
              <button
                type="button"
                aria-label="exercise options"
                onClick={() => setMenuOpen((v) => !v)}
                disabled={disabled}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--color-stone)] hover:bg-[color:var(--color-parchment)] hover:text-[color:var(--color-ink)] disabled:opacity-50"
              >
                <svg width="4" height="16" viewBox="0 0 4 16" fill="currentColor" aria-hidden>
                  <circle cx="2" cy="2" r="1.6" />
                  <circle cx="2" cy="8" r="1.6" />
                  <circle cx="2" cy="14" r="1.6" />
                </svg>
              </button>
              {menuOpen ? (
                <>
                  {/* Click-outside scrim — invisible full-viewport
                    * div that swallows the next click and closes the
                    * menu. */}
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setMenuOpen(false)}
                    aria-hidden
                  />
                  <div className="absolute right-0 top-10 z-20 w-44 overflow-hidden rounded-2xl border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] shadow-lg shadow-black/5">
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        const firstSg = setGroups[0];
                        if (firstSg) setEditFieldsForSgId(firstSg.id);
                      }}
                      className="block w-full px-4 py-2.5 text-left text-sm text-[color:var(--color-ink)] hover:bg-[color:var(--color-parchment)]"
                    >
                      edit fields
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onRemove();
                      }}
                      className="block w-full px-4 py-2.5 text-left text-sm text-[color:var(--color-sienna)] hover:bg-[color:var(--color-parchment)]"
                    >
                      remove exercise
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {setGroups.map((sg) => (
            <SetGroupEditor
              key={sg.id}
              setGroup={sg}
              draft={drafts[sg.id] ?? {}}
              onChange={(k, v) => onChange(sg.id, k, v)}
              onChangeMany={(patch) => onChangeMany(sg.id, patch)}
              forcePopoverOpen={editFieldsForSgId === sg.id}
              onPopoverOpenChange={(open) =>
                setEditFieldsForSgId(open ? sg.id : null)
              }
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Set Group Editor — opt-in field row ───────────────────────── */

function SetGroupEditor({
  setGroup,
  draft,
  onChange,
  onChangeMany,
  forcePopoverOpen,
  onPopoverOpenChange,
}: {
  setGroup: SetGroupRow;
  draft: Partial<SetGroupDraft>;
  onChange: <K extends keyof SetGroupDraft>(key: K, value: SetGroupDraft[K]) => void;
  onChangeMany: (patch: Partial<SetGroupDraft>) => void;
  /* External hint to open the popover (e.g. from the card's ⋮ →
   * Edit fields). The editor mirrors this into its own state so
   * subsequent close behaviour is local. */
  forcePopoverOpen?: boolean;
  onPopoverOpenChange?: (open: boolean) => void;
}) {
  /* Effective values: draft wins, else server. */
  const sets = draft.sets ?? setGroup.sets ?? 1;
  const activeFields: FieldKey[] = useMemo(() => {
    if (draft.active_fields) return draft.active_fields;
    return parseActiveFields(setGroup.active_fields);
  }, [draft.active_fields, setGroup.active_fields]);

  const activeSet = useMemo(() => new Set<FieldKey>(activeFields), [activeFields]);

  /* Per-field readers. Each reads draft-then-server, normalising legacy
   * non-fixed rep_value shapes to a number for display (first edit
   * silently coerces to the new `{type:"fixed",reps:N}` shape on
   * write). */
  const reps = readReps(draft, setGroup);
  const weightKg = readWeightKg(draft, setGroup);
  const tempo = draft.tempo !== undefined ? draft.tempo : (setGroup.tempo ?? null);
  const rpe = draft.rpe !== undefined ? draft.rpe : (setGroup.rpe ?? null);
  const timeSeconds =
    draft.time_seconds !== undefined ? draft.time_seconds : (setGroup.time_seconds ?? null);
  const restSeconds =
    draft.rest_seconds !== undefined ? draft.rest_seconds : (setGroup.rest_seconds ?? null);

  function toggleField(key: FieldKey, on: boolean) {
    const next = on
      ? Array.from(new Set<FieldKey>([...activeFields, key]))
      : activeFields.filter((k) => k !== key);

    // Order by canonical FIELD_KEYS sequence so display is stable.
    const ordered = FIELD_KEYS.filter((k) => next.includes(k));

    const patch: Partial<SetGroupDraft> = { active_fields: ordered };

    if (!on) {
      // Removing a field clears its value so a re-add starts clean.
      switch (key) {
        case "reps":
          patch.rep_type = null;
          patch.rep_value = {};
          break;
        case "weight":
          patch.weight_type = null;
          patch.weight_value = {};
          break;
        case "tempo":
          patch.tempo = null;
          break;
        case "rpe":
          patch.rpe = null;
          break;
        case "time":
          patch.time_seconds = null;
          break;
        case "rest":
          patch.rest_seconds = null;
          break;
      }
    } else {
      // Adding a field seeds a sensible starter so the cell isn't blank.
      switch (key) {
        case "reps":
          patch.rep_type = "fixed";
          patch.rep_value = { type: "fixed", reps: 10 } satisfies RepValue;
          break;
        case "weight":
          patch.weight_type = "load";
          patch.weight_value = { type: "load", kg: 0 } satisfies WeightValue;
          break;
        case "tempo":
          patch.tempo = "";
          break;
        case "rpe":
          patch.rpe = "";
          break;
        case "time":
          patch.time_seconds = 30;
          break;
        case "rest":
          patch.rest_seconds = 60;
          break;
      }
    }

    onChangeMany(patch);
  }

  return (
    <div className="space-y-2">
      {/* Main row: Sets + the inline opt-in cells (everything except rest) */}
      <div className="flex flex-wrap items-end gap-2.5">
        <FieldCell
          label="sets"
          value={String(sets)}
          inputMode="numeric"
          width="w-16"
          onChange={(v) => {
            const n = Number(v);
            onChange("sets", Number.isFinite(n) && n > 0 ? Math.floor(n) : 1);
          }}
        />

        {INLINE_FIELD_KEYS.map((key) =>
          activeSet.has(key) ? (
            <InlineFieldCell
              key={key}
              fieldKey={key}
              reps={reps}
              weightKg={weightKg}
              tempo={tempo}
              rpe={rpe}
              timeSeconds={timeSeconds}
              onChange={onChange}
            />
          ) : null,
        )}

        <AddFieldButton
          activeFields={activeFields}
          onToggle={toggleField}
          forceOpen={forcePopoverOpen}
          onOpenChange={onPopoverOpenChange}
        />
      </div>

      {/* Rest sub-row: subordinate, lighter, smaller. Renders only if
        * rest is in active_fields. */}
      {activeSet.has("rest") ? (
        <div className="ml-1 flex items-center gap-2 pl-4 pt-0.5 border-l-2 border-[color:var(--color-stone-soft)]/60">
          <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-[color:var(--color-stone)]">
            rest
          </span>
          <input
            type="text"
            inputMode="numeric"
            value={restSeconds ?? ""}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^\d]/g, "");
              onChange("rest_seconds", raw === "" ? null : Number(raw));
            }}
            className="w-14 bg-transparent text-sm text-[color:var(--color-ink)]/80 outline-none placeholder:text-[color:var(--color-stone)] focus:text-[color:var(--color-ink)]"
            placeholder="60"
            aria-label="rest seconds"
          />
          <span className="text-xs text-[color:var(--color-stone)]">s between sets</span>
        </div>
      ) : null}
    </div>
  );
}

/* ─── Field readers — tolerate legacy non-fixed shapes ──────────── */

function readReps(draft: Partial<SetGroupDraft>, sg: SetGroupRow): number {
  const v = draft.rep_value !== undefined ? draft.rep_value : sg.rep_value;
  if (v && typeof v === "object") {
    const obj = v as { type?: string; reps?: number; min?: number };
    if (obj.type === "fixed" && typeof obj.reps === "number") return obj.reps;
    // Legacy: range / unilateral / etc surface as the lower bound or a
    // sane default — first edit normalises to `{type:"fixed",reps:N}`.
    if (typeof obj.reps === "number") return obj.reps;
    if (typeof obj.min === "number") return obj.min;
  }
  return 10;
}

function readWeightKg(draft: Partial<SetGroupDraft>, sg: SetGroupRow): number {
  const v = draft.weight_value !== undefined ? draft.weight_value : sg.weight_value;
  if (v && typeof v === "object") {
    const obj = v as { type?: string; kg?: number };
    if (obj.type === "load" && typeof obj.kg === "number") return obj.kg;
    if (typeof obj.kg === "number") return obj.kg;
  }
  return 0;
}

/* ─── Field cell primitives ─────────────────────────────────────── */

/**
 * The Sets cell — and the base look every other inline cell inherits.
 * A bordered pill with a tiny stone label above and a tappable text
 * input below. The whole thing reads as one editable surface; tapping
 * anywhere on the cell focuses the input via the surrounding `<label>`.
 */
function FieldCell({
  label,
  value,
  onChange,
  suffix,
  width = "w-20",
  inputMode = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  suffix?: string;
  width?: string;
  inputMode?: "text" | "numeric" | "decimal";
  placeholder?: string;
}) {
  return (
    <label className="inline-flex flex-col gap-1">
      <span className="px-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
        {label}
      </span>
      <div
        className={`flex h-11 ${width} items-center rounded-2xl border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] px-3 transition-colors focus-within:border-[color:var(--color-ink)] focus-within:ring-2 focus-within:ring-[color:var(--color-ink)]/15`}
      >
        <input
          type="text"
          inputMode={inputMode}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-sm font-medium text-[color:var(--color-ink)] outline-none placeholder:font-normal placeholder:text-[color:var(--color-stone)]"
        />
        {suffix ? (
          <span className="ml-1 text-xs text-[color:var(--color-stone)]">{suffix}</span>
        ) : null}
      </div>
    </label>
  );
}

/**
 * The single switchboard for an inline opt-in cell. Each field maps
 * to one writer that translates the user's text input into the
 * canonical draft shape (e.g. Reps becomes `{type:"fixed",reps:N}`,
 * Weight becomes `{type:"load",kg:N}`). Keeping the mapping in one
 * place keeps the schema knowledge close to the UI.
 */
function InlineFieldCell({
  fieldKey,
  reps,
  weightKg,
  tempo,
  rpe,
  timeSeconds,
  onChange,
}: {
  fieldKey: FieldKey;
  reps: number;
  weightKg: number;
  tempo: string | null;
  rpe: string | null;
  timeSeconds: number | null;
  onChange: <K extends keyof SetGroupDraft>(key: K, value: SetGroupDraft[K]) => void;
}) {
  switch (fieldKey) {
    case "reps":
      return (
        <FieldCell
          label="reps"
          value={String(reps)}
          inputMode="numeric"
          width="w-16"
          onChange={(raw) => {
            const cleaned = raw.replace(/[^\d]/g, "");
            const n = cleaned === "" ? 1 : Number(cleaned);
            onChange("rep_type", "fixed");
            onChange("rep_value", {
              type: "fixed",
              reps: Number.isFinite(n) && n > 0 ? n : 1,
            } satisfies RepValue);
          }}
        />
      );
    case "weight":
      return (
        <FieldCell
          label="weight"
          value={String(weightKg)}
          inputMode="decimal"
          width="w-20"
          suffix="kg"
          onChange={(raw) => {
            const cleaned = raw.replace(/[^\d.]/g, "");
            const n = cleaned === "" ? 0 : Number(cleaned);
            onChange("weight_type", "load");
            onChange("weight_value", {
              type: "load",
              kg: Number.isFinite(n) && n >= 0 ? n : 0,
            } satisfies WeightValue);
          }}
        />
      );
    case "tempo":
      return (
        <FieldCell
          label="tempo"
          value={tempo ?? ""}
          width="w-24"
          placeholder="3-1-2"
          onChange={(raw) => onChange("tempo", raw.slice(0, 40))}
        />
      );
    case "rpe":
      return (
        <FieldCell
          label="rpe"
          value={rpe ?? ""}
          width="w-16"
          placeholder="8"
          onChange={(raw) => onChange("rpe", raw.slice(0, 20))}
        />
      );
    case "time":
      return (
        <FieldCell
          label="time"
          value={timeSeconds == null ? "" : String(timeSeconds)}
          inputMode="numeric"
          width="w-20"
          suffix="s"
          onChange={(raw) => {
            const cleaned = raw.replace(/[^\d]/g, "");
            onChange("time_seconds", cleaned === "" ? null : Number(cleaned));
          }}
        />
      );
    case "rest":
      // Rest renders as a sub-row, not inline — InlineFieldCell never
      // receives it. Returning null keeps the type exhaustive without
      // a runtime branch.
      return null;
  }
}

/* ─── + Add field button + popover ──────────────────────────────── */

function AddFieldButton({
  activeFields,
  onToggle,
  forceOpen,
  onOpenChange,
}: {
  activeFields: FieldKey[];
  onToggle: (key: FieldKey, on: boolean) => void;
  forceOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  /* When the card-level ⋮ menu fires "Edit fields", `forceOpen` flips
   * to true; we sync local `open` so the popover renders. Subsequent
   * close (click-outside, escape, tap a row) clears both. */
  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  function close() {
    setOpen(false);
    onOpenChange?.(false);
  }

  return (
    <div className="relative">
      <div className="flex flex-col gap-1">
        {/* Invisible spacer matches the FieldCell label height so the
          * button bottom-aligns with the input cells next to it. */}
        <span aria-hidden className="h-[14px]" />
        <button
          type="button"
          onClick={() => {
            const next = !open;
            setOpen(next);
            onOpenChange?.(next);
          }}
          className={`inline-flex h-11 items-center gap-1.5 rounded-2xl border border-dashed px-3 text-sm font-medium transition-colors ${
            open
              ? "border-[color:var(--color-ink)] bg-[color:var(--color-parchment)] text-[color:var(--color-ink)]"
              : "border-[color:var(--color-stone-soft)] text-[color:var(--color-stone)] hover:border-[color:var(--color-ink)]/40 hover:text-[color:var(--color-moss-deep)]"
          }`}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path
              d="M6 1.5v9M1.5 6h9"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
          add field
        </button>
      </div>

      {open ? (
        <>
          <div className="fixed inset-0 z-10" onClick={close} aria-hidden />
          <div
            role="menu"
            className="absolute left-0 top-[58px] z-20 w-64 overflow-hidden rounded-2xl border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] shadow-xl shadow-black/5"
          >
            <div className="px-4 pt-3 pb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
              fields
            </div>
            {FIELD_KEYS.map((key) => {
              const active = activeFields.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={active}
                  onClick={() => onToggle(key, !active)}
                  className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors ${
                    active
                      ? "bg-[color:var(--color-parchment)]/60"
                      : "hover:bg-[color:var(--color-parchment)]/60"
                  }`}
                >
                  <span>
                    <span className="block text-sm font-medium text-[color:var(--color-ink)]">
                      {FIELD_LABELS[key]}
                    </span>
                    <span className="block text-xs text-[color:var(--color-stone)]">
                      {FIELD_DESCRIPTIONS[key]}
                    </span>
                  </span>
                  {active ? (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      aria-hidden
                      className="shrink-0 text-[color:var(--color-moss-deep)]"
                    >
                      <path
                        d="M2.5 7.5l3 3 6-6.5"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <span
                      aria-hidden
                      className="h-[14px] w-[14px] shrink-0 rounded-full border border-[color:var(--color-stone-soft)]"
                    />
                  )}
                </button>
              );
            })}
            <div className="border-t border-[color:var(--color-stone-soft)]/60 px-4 py-2 text-[11px] italic text-[color:var(--color-ink)]/55">
              fields apply to this exercise only
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
