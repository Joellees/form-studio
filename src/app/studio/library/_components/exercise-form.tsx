"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { archiveExercise, saveExercise, saveGroup } from "../actions";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Group = { id: string; name: string };

type RepType = "fixed" | "range" | "unilateral" | "amrap";

type FormValues = {
  name: string;
  group_id: string;
  equipment: string;
  is_timed: boolean;
  default_rep_type: RepType;
  default_reps: number | "";
  default_reps_min: number | "";
  default_reps_max: number | "";
  default_per_side: number | "";
  default_seconds: number | "";
  default_rest_seconds: number | "";
  notes: string;
  video_url: string;
};

type Initial = {
  id?: string;
  name?: string | null;
  group_id?: string | null;
  equipment?: string | null;
  is_timed?: boolean | null;
  default_rep_type?: string | null;
  default_rep_value?: unknown;
  default_rest_seconds?: number | null;
  trainer_notes?: string | null;
  video_url?: string | null;
  archived?: boolean;
};

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
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const initialRV = (initial?.default_rep_value as Record<string, number | string> | null) ?? {};
  const initialRepType = (initial?.default_rep_type as RepType | null) ?? "fixed";

  const [availableGroups, setAvailableGroups] = useState<Group[]>(groups);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [groupError, setGroupError] = useState<string | null>(null);

  const { register, handleSubmit, setValue, watch, formState: { errors }, setError } = useForm<FormValues>({
    defaultValues: {
      name: initial?.name ?? "",
      group_id: initial?.group_id ?? "",
      equipment: initial?.equipment ?? "",
      is_timed: initial?.is_timed ?? false,
      default_rep_type: initialRepType,
      default_reps: (initialRV.reps as number | undefined) ?? 10,
      default_reps_min: (initialRV.min as number | undefined) ?? 8,
      default_reps_max: (initialRV.max as number | undefined) ?? 12,
      default_per_side: (initialRV.per_side as number | undefined) ?? 8,
      default_seconds: (initialRV.seconds as number | undefined) ?? 45,
      default_rest_seconds: initial?.default_rest_seconds ?? 60,
      notes: initial?.trainer_notes ?? "",
      video_url: initial?.video_url ?? "",
    },
  });

  const isTimed = watch("is_timed");
  const repType = watch("default_rep_type");
  const videoUrl = watch("video_url");

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload/exercise-video", { method: "POST", body: fd });
      const body = (await res.json()) as { ok: boolean; url?: string; error?: string };
      if (!body.ok || !body.url) throw new Error(body.error ?? "Upload failed");
      setValue("video_url", body.url, { shouldDirty: true });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function onSubmit(values: FormValues) {
    // Build default_rep_value from the adaptive inputs
    let rep_type: string | null;
    let rep_value: Record<string, unknown> | null;
    if (values.is_timed) {
      rep_type = "time";
      rep_value = { type: "time", seconds: Number(values.default_seconds) || 30 };
    } else {
      rep_type = values.default_rep_type;
      switch (values.default_rep_type) {
        case "fixed":
          rep_value = { type: "fixed", reps: Number(values.default_reps) || 10 };
          break;
        case "range":
          rep_value = {
            type: "range",
            min: Number(values.default_reps_min) || 8,
            max: Number(values.default_reps_max) || 12,
          };
          break;
        case "unilateral":
          rep_value = { type: "unilateral", per_side: Number(values.default_per_side) || 8 };
          break;
        case "amrap":
          rep_value = { type: "amrap" };
          break;
        default:
          rep_value = null;
      }
    }

    startTransition(async () => {
      const result = await saveExercise({
        id: initial?.id,
        name: values.name,
        group_id: values.group_id || null,
        equipment: values.equipment || null,
        is_timed: values.is_timed,
        default_rep_type: rep_type,
        default_rep_value: rep_value,
        default_rest_seconds: values.default_rest_seconds === "" ? null : Number(values.default_rest_seconds),
        notes: values.notes || null,
        video_url: values.video_url || null,
      });
      if (!result.ok) {
        if (result.fieldErrors) {
          for (const [k, v] of Object.entries(result.fieldErrors)) {
            setError(k as keyof FormValues, { message: v[0] });
          }
        } else {
          setError("name", { message: result.error });
        }
        return;
      }
      router.push("/studio/library");
      router.refresh();
    });
  }

  async function handleCreateGroup() {
    const name = newGroupName.trim();
    if (!name) return;
    setGroupError(null);
    const result = await saveGroup({ name });
    if (!result.ok) {
      setGroupError(result.error);
      return;
    }
    const newGroup = { id: result.data.id, name };
    setAvailableGroups((prev) => [...prev, newGroup].sort((a, b) => a.name.localeCompare(b.name)));
    setValue("group_id", result.data.id, { shouldDirty: true });
    setCreatingGroup(false);
    setNewGroupName("");
  }

  function onArchive() {
    if (!initial?.id) return;
    if (!confirm("Archive this exercise? It stays in past sessions; new templates can&rsquo;t use it.")) return;
    startTransition(async () => {
      await archiveExercise(initial.id!);
      router.push("/studio/library");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-10 flex flex-col gap-6">
      <Field label="name" error={errors.name?.message}>
        <Input {...register("name", { required: "Required" })} placeholder="Romanian deadlift" />
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
                    handleCreateGroup();
                  }
                  if (e.key === "Escape") {
                    setCreatingGroup(false);
                    setNewGroupName("");
                    setGroupError(null);
                  }
                }}
              />
              <Button type="button" size="sm" onClick={handleCreateGroup} disabled={!newGroupName.trim()}>
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
            <select
              {...register("group_id")}
              onChange={(e) => {
                if (e.target.value === "__new__") {
                  setValue("group_id", "");
                  setCreatingGroup(true);
                } else {
                  setValue("group_id", e.target.value);
                }
              }}
              className="h-10 rounded-xl border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] px-3 text-sm"
            >
              <option value="">no group</option>
              {availableGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
              <option value="__new__">+ create new group…</option>
            </select>
          )}
          {groupError ? <p className="mt-1 text-xs text-[color:var(--color-sienna)]">{groupError}</p> : null}
        </Field>
        <Field label="equipment (optional)">
          <Input {...register("equipment")} placeholder="barbell, kb, bw…" maxLength={40} />
        </Field>
      </div>

      <div className="rounded-2xl border border-[color:var(--color-stone-soft)]/60 bg-[color:var(--color-parchment)]/40 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
              default prescription
            </p>
            <p className="mt-1 text-xs text-[color:var(--color-ink)]/60">
              Pre-fills when you add this exercise to a session. You can override per session.
            </p>
          </div>
          <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              {...register("is_timed")}
              className="size-4 accent-[color:var(--color-ink)]"
            />
            timed
          </label>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {!isTimed ? (
            <Field label="reps">
              <select
                {...register("default_rep_type")}
                className="h-10 rounded-xl border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] px-3 text-sm"
              >
                <option value="fixed">fixed reps</option>
                <option value="range">rep range</option>
                <option value="unilateral">per side</option>
                <option value="amrap">amrap</option>
              </select>
            </Field>
          ) : null}

          {!isTimed && repType === "fixed" ? (
            <Field label="count">
              <Input type="number" min={1} {...register("default_reps")} />
            </Field>
          ) : null}

          {!isTimed && repType === "range" ? (
            <Field label="range">
              <div className="flex items-center gap-2">
                <Input type="number" min={1} {...register("default_reps_min")} className="w-24" />
                <span className="text-sm text-[color:var(--color-stone)]">to</span>
                <Input type="number" min={1} {...register("default_reps_max")} className="w-24" />
              </div>
            </Field>
          ) : null}

          {!isTimed && repType === "unilateral" ? (
            <Field label="per side">
              <Input type="number" min={1} {...register("default_per_side")} />
            </Field>
          ) : null}

          {isTimed ? (
            <Field label="seconds">
              <Input type="number" min={1} {...register("default_seconds")} />
            </Field>
          ) : null}

          <Field label="rest (seconds)">
            <Input type="number" min={0} {...register("default_rest_seconds")} />
          </Field>
        </div>
      </div>

      <Field label="video">
        <div className="flex flex-col gap-2">
          <input type="file" accept="video/*" onChange={onFile} disabled={uploading} className="text-sm" />
          {uploading ? <p className="text-xs text-[color:var(--color-stone)]">uploading…</p> : null}
          {uploadError ? <p className="text-xs text-[color:var(--color-sienna)]">{uploadError}</p> : null}
          <Input {...register("video_url")} placeholder="or paste a URL (Vimeo, YouTube, any mp4)" />
          {videoUrl ? (
            <p className="truncate text-xs text-[color:var(--color-moss-deep)]">linked · {videoUrl}</p>
          ) : null}
        </div>
      </Field>

      <Field label="notes">
        <Textarea {...register("notes")} rows={2} placeholder="Anything you want to remember." />
      </Field>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={pending || uploading} size="lg">
          {pending ? "saving…" : mode === "create" ? "add exercise" : "save changes"}
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
  className,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-xs text-[color:var(--color-sienna)]">{error}</p> : null}
    </div>
  );
}
