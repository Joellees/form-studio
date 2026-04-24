"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { archiveExercise, saveExercise, saveGroup } from "../actions";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/ui/file-upload";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";

type Group = { id: string; name: string };

type Initial = {
  id?: string;
  name?: string | null;
  group_id?: string | null;
  equipment?: string | null;
  is_timed?: boolean | null;
  default_rep_value?: unknown;
  default_rest_seconds?: number | null;
  trainer_notes?: string | null;
  video_url?: string | null;
  archived?: boolean;
};

type RepMode = "reps" | "per_side" | "amrap";
type SetRow = { reps: number; mode: RepMode };

const REP_MODES: { value: RepMode; label: string }[] = [
  { value: "reps", label: "reps" },
  { value: "per_side", label: "/ side" },
  { value: "amrap", label: "to failure" },
];

type ParsedSets = { sets: SetRow[]; kg: number };

function parseSets(rv: unknown): ParsedSets {
  const obj = (rv ?? {}) as {
    kg?: number;
    sets?: Array<{ reps?: number; seconds?: number; kg?: number; mode?: RepMode; rep_type?: RepMode }>;
  };
  const kg = obj.kg ?? obj.sets?.[0]?.kg ?? 0;
  if (Array.isArray(obj.sets) && obj.sets.length > 0) {
    return {
      kg,
      sets: obj.sets.map((s) => ({
        reps: s.reps ?? s.seconds ?? 10,
        mode: (s.mode ?? s.rep_type ?? "reps") as RepMode,
      })),
    };
  }
  return { kg, sets: [{ reps: 10, mode: "reps" }] };
}

export function ExerciseForm({
  mode,
  groups,
  initial,
}: {
  mode: "create" | "edit";
  groups: Group[];
  initial?: Initial;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState(initial?.name ?? "");
  const [groupId, setGroupId] = useState(initial?.group_id ?? "");
  const [equipment, setEquipment] = useState(initial?.equipment ?? "");
  const [isTimed, setIsTimed] = useState(!!initial?.is_timed);
  const parsed = parseSets(initial?.default_rep_value);
  const [sets, setSets] = useState<SetRow[]>(parsed.sets);
  const [kg, setKg] = useState<number>(parsed.kg);
  const [rest, setRest] = useState<number>(initial?.default_rest_seconds ?? 60);
  const [notes, setNotes] = useState(initial?.trainer_notes ?? "");
  const [videoUrl, setVideoUrl] = useState(initial?.video_url ?? "");

  const [availableGroups, setAvailableGroups] = useState<Group[]>(groups);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [groupError, setGroupError] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedName, setUploadedName] = useState<string | null>(null);

  const [nameError, setNameError] = useState<string | null>(null);

  function updateSet(i: number, patch: Partial<SetRow>) {
    setSets((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function addSet() {
    setSets((prev) => [...prev, { ...(prev[prev.length - 1] ?? { reps: 10, mode: "reps" as RepMode }) }]);
  }
  function removeSet(i: number) {
    setSets((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));
  }

  async function onFile(file: File) {
    setUploadError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload/exercise-video", { method: "POST", body: fd });
      const body = (await res.json()) as { ok: boolean; url?: string; error?: string };
      if (!body.ok || !body.url) throw new Error(body.error ?? "Upload failed");
      setVideoUrl(body.url);
      setUploadedName(file.name);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleCreateGroup() {
    const trimmed = newGroupName.trim();
    if (!trimmed) return;
    setGroupError(null);
    const result = await saveGroup({ name: trimmed });
    if (!result.ok) {
      setGroupError(result.error);
      return;
    }
    const g = { id: result.data.id, name: trimmed };
    setAvailableGroups((prev) => [...prev, g].sort((a, b) => a.name.localeCompare(b.name)));
    setGroupId(g.id);
    setCreatingGroup(false);
    setNewGroupName("");
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setNameError(null);
    if (!name.trim()) {
      setNameError("Required");
      return;
    }
    // Exercise-level default kg + rest; each set just owns reps and mode.
    // When is_timed is on, every set is seconds.
    const rep_value = {
      type: isTimed ? "timed_sets" : "sets",
      kg,
      sets: sets.map((s) =>
        isTimed
          ? { seconds: s.reps }
          : { reps: s.mode === "amrap" ? 0 : s.reps, mode: s.mode },
      ),
    };
    startTransition(async () => {
      const result = await saveExercise({
        id: initial?.id,
        name: name.trim(),
        group_id: groupId || null,
        equipment: equipment.trim() || null,
        is_timed: isTimed,
        default_rep_type: isTimed ? "time" : "fixed",
        default_rep_value: rep_value,
        default_rest_seconds: Number.isFinite(rest) ? rest : null,
        notes: notes.trim() || null,
        video_url: videoUrl || null,
      });
      if (!result.ok) {
        setNameError(result.error);
        return;
      }
      router.push("/studio/library");
      router.refresh();
    });
  }

  function onArchive() {
    if (!initial?.id) return;
    if (!confirm("Archive this exercise? Past sessions keep it; new templates can&rsquo;t use it.")) return;
    startTransition(async () => {
      await archiveExercise(initial.id!);
      router.push("/studio/library");
      router.refresh();
    });
  }

  const repLabel = isTimed ? "seconds" : "reps";

  return (
    <form onSubmit={onSubmit} className="mt-10 flex flex-col gap-7">
      <Field label="name" error={nameError}>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Romanian deadlift"
        />
      </Field>

      <div className="grid gap-6 md:grid-cols-2">
        <Field label="group">
          {creatingGroup ? (
            <div className="flex items-center gap-2">
              <Input
                autoFocus
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="e.g. lower push"
                maxLength={40}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleCreateGroup();
                  }
                  if (e.key === "Escape") {
                    setCreatingGroup(false);
                    setNewGroupName("");
                    setGroupError(null);
                  }
                }}
              />
              <Button
                type="button"
                size="sm"
                onClick={() => void handleCreateGroup()}
                disabled={!newGroupName.trim()}
              >
                add
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setCreatingGroup(false);
                  setNewGroupName("");
                  setGroupError(null);
                }}
              >
                cancel
              </Button>
            </div>
          ) : (
            <Select
              value={groupId}
              onChange={(e) => {
                if (e.target.value === "__new__") {
                  setCreatingGroup(true);
                } else {
                  setGroupId(e.target.value);
                }
              }}
            >
              <option value="">no group</option>
              {availableGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
              <option value="__new__">+ create new group…</option>
            </Select>
          )}
          {groupError ? <p className="mt-1 text-xs text-[color:var(--color-sienna)]">{groupError}</p> : null}
        </Field>
        <Field label="equipment (optional)">
          <Input
            value={equipment}
            onChange={(e) => setEquipment(e.target.value)}
            placeholder="barbell, kb, bw…"
            maxLength={40}
          />
        </Field>
      </div>

      <div className="rounded-3xl bg-[color:var(--color-parchment)]/50 p-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <Label>sets</Label>
          <Toggle checked={isTimed} onChange={setIsTimed} label="timed" />
        </div>

        <ul className="space-y-2.5">
          {sets.map((s, i) => {
            const isAmrap = !isTimed && s.mode === "amrap";
            return (
              <li key={i} className="flex items-center gap-3">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-canvas)] text-[13px] font-semibold tabular-nums text-[color:var(--color-ink)]">
                  {i + 1}
                </span>

                <Input
                  type="number"
                  min={isAmrap ? 0 : 1}
                  value={isAmrap ? "" : s.reps}
                  placeholder={isAmrap ? "—" : undefined}
                  disabled={isAmrap}
                  onChange={(e) => updateSet(i, { reps: Number(e.target.value) || 0 })}
                  className="w-24 text-center"
                />

                {isTimed ? (
                  <span className="text-xs font-medium uppercase tracking-[0.14em] text-[color:var(--color-stone)]">
                    seconds
                  </span>
                ) : (
                  <Select
                    value={s.mode}
                    onChange={(e) => updateSet(i, { mode: e.target.value as RepMode })}
                    className="h-9 w-[128px] pl-4 pr-9 text-xs"
                  >
                    {REP_MODES.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </Select>
                )}

                <button
                  type="button"
                  onClick={() => removeSet(i)}
                  disabled={sets.length <= 1}
                  className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--color-stone)] transition-colors hover:bg-[color:var(--color-ink)]/5 hover:text-[color:var(--color-ink)] disabled:opacity-30"
                  aria-label={`remove set ${i + 1}`}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>

        {/* Exercise-level defaults: weight + rest. Same line, two pills. */}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Pill label="weight">
            <input
              type="number"
              min={0}
              step="0.5"
              value={kg}
              onChange={(e) => setKg(Number(e.target.value) || 0)}
              className="w-14 bg-transparent text-sm tabular-nums focus:outline-none"
            />
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-[color:var(--color-stone)]">
              kg
            </span>
          </Pill>
          <Pill label="rest">
            <input
              type="number"
              min={0}
              value={rest}
              onChange={(e) => setRest(Number(e.target.value) || 0)}
              className="w-14 bg-transparent text-sm tabular-nums focus:outline-none"
            />
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-[color:var(--color-stone)]">
              sec
            </span>
          </Pill>
        </div>

        <div className="mt-4">
          <Button type="button" variant="ghost" size="sm" onClick={addSet}>
            + add set
          </Button>
        </div>
      </div>

      <Field label="video">
        <Input
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          placeholder="paste a URL"
        />
        <FileUpload
          accept="video/*"
          disabled={uploading}
          onFile={onFile}
          label={uploading ? "uploading…" : videoUrl ? "replace with upload" : "upload video"}
          hint="mp4, mov, or webm"
          fileName={uploadedName}
        />
        {uploadError ? <p className="text-xs text-[color:var(--color-sienna)]">{uploadError}</p> : null}
        {videoUrl && !uploadedName ? (
          <p className="truncate text-xs text-[color:var(--color-moss-deep)]">video linked</p>
        ) : null}
      </Field>

      <Field label="notes">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </Field>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={pending || uploading} size="lg">
          {pending ? "saving…" : mode === "create" ? "add" : "save"}
        </Button>
        {mode === "edit" && !initial?.archived ? (
          <Button type="button" variant="outline" onClick={onArchive} disabled={pending}>
            archive
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-xs text-[color:var(--color-sienna)]">{error}</p> : null}
    </div>
  );
}

function Pill({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] px-4 py-2">
      <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
        {label}
      </span>
      {children}
    </label>
  );
}
