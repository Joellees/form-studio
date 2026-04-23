"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { archiveExercise, saveExercise } from "../actions";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FormValues = {
  name: string;
  default_descriptor: string;
  group_tag: string;
  equipment: string;
  is_unilateral: boolean;
  default_rest_seconds: number | "";
  trainer_notes: string;
  video_url: string;
};

type Initial = Partial<FormValues> & { id?: string; archived?: boolean };

export function ExerciseForm({ mode, initial }: { mode: "create" | "edit"; initial?: Initial }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { register, handleSubmit, setValue, watch, formState: { errors }, setError } = useForm<FormValues>({
    defaultValues: {
      name: initial?.name ?? "",
      default_descriptor: initial?.default_descriptor ?? "",
      group_tag: initial?.group_tag ?? "",
      equipment: initial?.equipment ?? "",
      is_unilateral: initial?.is_unilateral ?? false,
      default_rest_seconds: initial?.default_rest_seconds ?? "",
      trainer_notes: initial?.trainer_notes ?? "",
      video_url: initial?.video_url ?? "",
    },
  });

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
    startTransition(async () => {
      const result = await saveExercise({
        id: initial?.id,
        name: values.name,
        default_descriptor: values.default_descriptor || null,
        group_tag: values.group_tag || null,
        equipment: values.equipment || null,
        is_unilateral: values.is_unilateral,
        default_rest_seconds: values.default_rest_seconds === "" ? null : Number(values.default_rest_seconds),
        trainer_notes: values.trainer_notes || null,
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

      <Field label="how you cue it">
        <Textarea {...register("default_descriptor")} placeholder="Soft knees. Hips back. Bar against the legs." rows={3} />
      </Field>

      <div className="grid gap-6 md:grid-cols-2">
        <Field label="group">
          <Input {...register("group_tag")} placeholder="hinge, squat, pull…" />
        </Field>
        <Field label="equipment">
          <Input {...register("equipment")} placeholder="barbell, kb, bw…" />
        </Field>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Field label="default rest (seconds)">
          <Input type="number" min={0} {...register("default_rest_seconds")} />
        </Field>
        <label className="mt-6 flex items-center gap-3 text-sm">
          <input type="checkbox" {...register("is_unilateral")} className="size-4 accent-[color:var(--color-moss)]" />
          unilateral (tracked per side)
        </label>
      </div>

      <Field label="video">
        <div className="flex flex-col gap-3">
          <input type="file" accept="video/*" onChange={onFile} disabled={uploading} className="text-sm" />
          {uploading ? <p className="text-xs text-[color:var(--color-stone)]">uploading…</p> : null}
          {uploadError ? <p className="text-xs text-[color:var(--color-sienna)]">{uploadError}</p> : null}
          <Input {...register("video_url")} placeholder="or paste a URL (Vimeo, Youtube, any mp4)" />
          {videoUrl ? (
            <p className="truncate text-xs text-[color:var(--color-moss-deep)]">linked · {videoUrl}</p>
          ) : null}
        </div>
      </Field>

      <Field label="private notes">
        <Textarea {...register("trainer_notes")} placeholder="Things to remember about this movement." rows={3} />
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

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-xs text-[color:var(--color-sienna)]">{error}</p> : null}
    </div>
  );
}
