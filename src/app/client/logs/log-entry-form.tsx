"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createLog } from "./actions";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Enabled = {
  weight: boolean;
  cycle: boolean;
  measurements: boolean;
  mood: boolean;
  sleep: boolean;
  prs: boolean;
  progress_photos: boolean;
};

type FieldType = "weight" | "cycle" | "measurements" | "mood" | "sleep" | "pr";

export function LogEntryForm({ enabled }: { enabled: Enabled }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fieldType, setFieldType] = useState<FieldType>(() => firstEnabled(enabled));
  const [value, setValue] = useState<Record<string, string | number>>({});
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = buildValue(fieldType, value);
    if (!payload) {
      setError("Fill in at least one field.");
      return;
    }
    startTransition(async () => {
      const result = await createLog({ field_type: fieldType, value: payload, notes: notes || null });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setValue({});
      setNotes("");
      router.refresh();
    });
  }

  const fieldOptions = (
    [
      { key: "weight", label: "weight", show: enabled.weight },
      { key: "measurements", label: "measurements", show: enabled.measurements },
      { key: "cycle", label: "cycle", show: enabled.cycle },
      { key: "mood", label: "mood", show: enabled.mood },
      { key: "sleep", label: "sleep", show: enabled.sleep },
      { key: "pr", label: "personal record", show: enabled.prs },
    ] as const
  ).filter((f) => f.show);

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label>what are you logging</Label>
        <select
          value={fieldType}
          onChange={(e) => {
            setFieldType(e.target.value as FieldType);
            setValue({});
          }}
          className="h-10 rounded-md border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] px-3 text-sm"
        >
          {fieldOptions.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      {fieldType === "weight" ? (
        <div className="flex flex-col gap-2">
          <Label>kg</Label>
          <Input
            type="number"
            step="0.1"
            value={value.kg ?? ""}
            onChange={(e) => setValue({ kg: Number(e.target.value) })}
          />
        </div>
      ) : null}

      {fieldType === "measurements" ? (
        <div className="grid gap-4 md:grid-cols-3">
          {["chest_cm", "waist_cm", "hips_cm", "arms_cm", "thighs_cm", "neck_cm"].map((k) => (
            <div key={k} className="flex flex-col gap-2">
              <Label>{k.replace("_cm", "").replace("_", " ")} (cm)</Label>
              <Input
                type="number"
                step="0.5"
                value={value[k] ?? ""}
                onChange={(e) => setValue((v) => ({ ...v, [k]: Number(e.target.value) }))}
              />
            </div>
          ))}
        </div>
      ) : null}

      {fieldType === "cycle" ? (
        <div className="flex flex-col gap-2">
          <Label>phase</Label>
          <select
            value={(value.phase as string) ?? "follicular"}
            onChange={(e) => setValue({ phase: e.target.value })}
            className="h-10 rounded-md border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] px-3 text-sm"
          >
            <option value="menstrual">menstrual</option>
            <option value="follicular">follicular</option>
            <option value="ovulation">ovulation</option>
            <option value="luteal">luteal</option>
          </select>
        </div>
      ) : null}

      {fieldType === "mood" || fieldType === "sleep" ? (
        <div className="flex flex-col gap-2">
          <Label>{fieldType === "mood" ? "mood (1-5)" : "sleep quality (1-5)"}</Label>
          <Input
            type="number"
            min={1}
            max={5}
            value={value.score ?? ""}
            onChange={(e) => setValue({ score: Number(e.target.value) })}
          />
        </div>
      ) : null}

      {fieldType === "pr" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label>exercise</Label>
            <Input
              value={(value.exercise as string) ?? ""}
              onChange={(e) => setValue((v) => ({ ...v, exercise: e.target.value }))}
              placeholder="back squat"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>kg</Label>
            <Input
              type="number"
              step="0.5"
              value={value.kg ?? ""}
              onChange={(e) => setValue((v) => ({ ...v, kg: Number(e.target.value) }))}
            />
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label>notes</Label>
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {error ? <p className="text-xs text-[color:var(--color-sienna)]">{error}</p> : null}

      <Button type="submit" disabled={pending} size="lg">
        {pending ? "saving…" : "save entry"}
      </Button>
    </form>
  );
}

function firstEnabled(enabled: Enabled): FieldType {
  if (enabled.weight) return "weight";
  if (enabled.measurements) return "measurements";
  if (enabled.cycle) return "cycle";
  if (enabled.mood) return "mood";
  if (enabled.sleep) return "sleep";
  if (enabled.prs) return "pr";
  return "weight";
}

function buildValue(field: FieldType, v: Record<string, string | number>): Record<string, unknown> | null {
  const entries = Object.entries(v).filter(([, val]) => val !== "" && val !== undefined && !Number.isNaN(val));
  if (entries.length === 0 && field !== "cycle") return null;
  return Object.fromEntries(entries);
}
