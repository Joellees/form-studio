"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { addExerciseToTemplate, archiveTemplate, removeTemplateBlock, updateSetGroup } from "../actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatReps, formatWeight, type RepValue, type WeightValue } from "@/lib/set-group";

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
  exercises: { id: string; name: string; group_tag: string | null }[];
};

export function TemplateBuilder({ template, blocks, exercises }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function addExercise(exerciseId: string) {
    startTransition(async () => {
      await addExerciseToTemplate({ templateId: template.id, exerciseId });
      router.refresh();
    });
  }

  function removeBlock(blockId: string) {
    if (!confirm("Remove this exercise from the template?")) return;
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

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">template</p>
          <h1 className="mt-2 font-display text-4xl">{template.name}</h1>
          {template.description ? (
            <p className="mt-2 max-w-2xl text-[color:var(--color-ink)]/75">{template.description}</p>
          ) : null}
        </div>
        <Button variant="outline" onClick={archive} disabled={pending}>
          archive
        </Button>
      </header>

      <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
        <section className="space-y-6">
          {blocks.length === 0 ? (
            <EmptyState
              title="Add the first exercise"
              body="Pick from your library on the right. You&rsquo;ll configure sets and reps per exercise."
            />
          ) : (
            blocks.map((block, i) => (
              <BlockCard
                key={block.id}
                index={i + 1}
                block={block}
                onRemove={() => removeBlock(block.id)}
                pending={pending}
              />
            ))
          )}
        </section>

        <aside className="sticky top-24 h-fit">
          <Card>
            <CardHeader>
              <CardTitle>library</CardTitle>
            </CardHeader>
            <CardContent>
              {exercises.length === 0 ? (
                <p className="text-sm text-[color:var(--color-ink)]/70">Add exercises to your library first.</p>
              ) : (
                <ul className="max-h-[60vh] space-y-1 overflow-y-auto">
                  {exercises.map((ex) => (
                    <li key={ex.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm">{ex.name}</p>
                        {ex.group_tag ? <p className="text-xs text-[color:var(--color-stone)]">{ex.group_tag}</p> : null}
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => addExercise(ex.id)} disabled={pending}>
                        add
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function BlockCard({
  index,
  block,
  onRemove,
  pending,
}: {
  index: number;
  block: BlockRow;
  onRemove: () => void;
  pending: boolean;
}) {
  const be = block.template_block_exercises[0];
  if (!be) return null;
  const setGroups = [...be.template_set_groups].sort((a, b) => a.order_index - b.order_index);
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-[color:var(--color-stone)]">exercise {String(index).padStart(2, "0")}</p>
            <CardTitle className="mt-1">{be.exercises?.name ?? "Exercise"}</CardTitle>
          </div>
          <Button variant="ghost" size="sm" onClick={onRemove} disabled={pending}>
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
          <SetGroupEditor key={sg.id} setGroup={sg} />
        ))}
      </CardContent>
    </Card>
  );
}

function SetGroupEditor({ setGroup }: { setGroup: SetGroupRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const repVal = setGroup.rep_value as RepValue;
  const weightVal = setGroup.weight_value as WeightValue;

  function save(partial: {
    sets?: number;
    rep_type?: string;
    rep_value?: unknown;
    weight_type?: string;
    weight_value?: unknown;
    rest_seconds?: number | null;
    label?: string | null;
  }) {
    startTransition(async () => {
      await updateSetGroup({ id: setGroup.id, ...partial });
      router.refresh();
    });
  }

  return (
    <div className="rounded-md border border-[color:var(--color-stone-soft)]/60 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label>sets</Label>
          <Input
            type="number"
            min={1}
            defaultValue={setGroup.sets}
            onBlur={(e) => save({ sets: Number(e.target.value) || 1 })}
            className="w-20"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label>reps</Label>
          <select
            defaultValue={setGroup.rep_type}
            onChange={(e) => {
              const next = e.target.value;
              const defaults: Record<string, RepValue> = {
                fixed: { type: "fixed", reps: 10 },
                range: { type: "range", min: 8, max: 12 },
                time: { type: "time", seconds: 45 },
                unilateral: { type: "unilateral", per_side: 8 },
                amrap: { type: "amrap" },
                single: { type: "single" },
              };
              save({ rep_type: next, rep_value: defaults[next] ?? { type: next } });
            }}
            className="h-9 rounded-md border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] px-3 text-sm"
          >
            <option value="fixed">fixed</option>
            <option value="range">range</option>
            <option value="time">time</option>
            <option value="unilateral">per side</option>
            <option value="amrap">amrap</option>
            <option value="single">single</option>
          </select>
        </div>

        {setGroup.rep_type === "fixed" && repVal?.type === "fixed" ? (
          <div className="flex flex-col gap-1">
            <Label>reps</Label>
            <Input
              type="number"
              min={1}
              defaultValue={repVal.reps}
              onBlur={(e) => save({ rep_value: { type: "fixed", reps: Number(e.target.value) || 1 } })}
              className="w-20"
            />
          </div>
        ) : null}

        {setGroup.rep_type === "range" && repVal?.type === "range" ? (
          <div className="flex items-end gap-2">
            <div className="flex flex-col gap-1">
              <Label>min</Label>
              <Input
                type="number"
                min={1}
                defaultValue={repVal.min}
                onBlur={(e) =>
                  save({ rep_value: { type: "range", min: Number(e.target.value) || 1, max: repVal.max } })
                }
                className="w-20"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label>max</Label>
              <Input
                type="number"
                min={1}
                defaultValue={repVal.max}
                onBlur={(e) =>
                  save({ rep_value: { type: "range", min: repVal.min, max: Number(e.target.value) || 1 } })
                }
                className="w-20"
              />
            </div>
          </div>
        ) : null}

        {setGroup.rep_type === "time" && repVal?.type === "time" ? (
          <div className="flex flex-col gap-1">
            <Label>seconds</Label>
            <Input
              type="number"
              min={1}
              defaultValue={repVal.seconds}
              onBlur={(e) => save({ rep_value: { type: "time", seconds: Number(e.target.value) || 30 } })}
              className="w-24"
            />
          </div>
        ) : null}

        <div className="flex flex-col gap-1">
          <Label>weight</Label>
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
              save({ weight_type: next, weight_value: defaults[next] ?? { type: next } });
            }}
            className="h-9 rounded-md border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] px-3 text-sm"
          >
            <option value="load">kg</option>
            <option value="bw">bw</option>
            <option value="percentage">% of</option>
            <option value="intensity">intensity</option>
            <option value="blank">blank</option>
          </select>
        </div>

        {setGroup.weight_type === "load" && weightVal?.type === "load" ? (
          <div className="flex flex-col gap-1">
            <Label>kg</Label>
            <Input
              type="number"
              step="0.5"
              min={0}
              defaultValue={weightVal.kg}
              onBlur={(e) =>
                save({ weight_value: { type: "load", kg: Number(e.target.value) || 0, paired: weightVal.paired } })
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
            defaultValue={setGroup.rest_seconds ?? 0}
            onBlur={(e) => save({ rest_seconds: Number(e.target.value) || null })}
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
