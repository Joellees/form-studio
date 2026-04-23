"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  addExerciseToSession,
  logPerformedSet,
  removeSessionBlock,
  updateSessionNotes,
  updateSessionSetGroup,
} from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
};

type Block = {
  id: string;
  order_index: number;
  session_block_exercises: BlockExercise[];
};

type LibraryExercise = { id: string; name: string; group_tag: string | null };

type SessionBuilderProps = {
  sessionId: string;
  sessionNotes: string | null;
  canEdit: boolean; // trainer = true, client viewing = false
  blocks: Block[];
  library: LibraryExercise[];
};

export function SessionBuilder({ sessionId, sessionNotes, canEdit, blocks, library }: SessionBuilderProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");

  const filtered = library.filter((e) =>
    query ? e.name.toLowerCase().includes(query.toLowerCase()) : true,
  );

  function addExercise(exerciseId: string) {
    startTransition(async () => {
      await addExerciseToSession({ sessionId, exerciseId });
      router.refresh();
    });
  }
  function removeBlock(id: string) {
    if (!confirm("Remove this exercise from the session?")) return;
    startTransition(async () => {
      await removeSessionBlock(id);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
      <div className="space-y-6">
        {/* Trainer notes */}
        <NotesBlock sessionId={sessionId} initial={sessionNotes} canEdit={canEdit} />

        {/* Blocks */}
        {blocks.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-[color:var(--color-stone-soft)] px-6 py-10 text-center">
            <p className="text-sm font-semibold">No exercises yet</p>
            <p className="mt-1 text-sm text-[color:var(--color-ink)]/70">
              {canEdit ? "Pick from your library on the right." : "Your trainer hasn&rsquo;t prescribed a workout yet."}
            </p>
          </div>
        ) : (
          blocks.map((block, i) => {
            const be = block.session_block_exercises[0];
            if (!be) return null;
            return (
              <Card key={block.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
                        exercise {String(i + 1).padStart(2, "0")}
                      </p>
                      <CardTitle className="mt-1">{be.exercises?.name ?? "Exercise"}</CardTitle>
                      {be.exercises?.default_descriptor ? (
                        <p className="mt-1 text-xs text-[color:var(--color-ink)]/70">
                          {be.exercises.default_descriptor}
                        </p>
                      ) : null}
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
                        <Button variant="ghost" size="sm" onClick={() => removeBlock(block.id)} disabled={pending}>
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
          })
        )}
      </div>

      {/* Library picker — trainer only */}
      {canEdit ? (
        <aside className="sticky top-24 h-fit">
          <Card>
            <CardHeader>
              <CardTitle>library</CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                placeholder="search exercises"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="mb-3"
              />
              {filtered.length === 0 ? (
                <p className="text-sm text-[color:var(--color-ink)]/70">
                  {library.length === 0
                    ? "Add exercises to your library first."
                    : "No matches — try a different search."}
                </p>
              ) : (
                <ul className="max-h-[55vh] space-y-1 overflow-y-auto">
                  {filtered.map((ex) => (
                    <li key={ex.id} className="flex items-center justify-between gap-2 rounded-xl px-2 py-1 hover:bg-[color:var(--color-parchment)]/60">
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
      ) : null}
    </div>
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
