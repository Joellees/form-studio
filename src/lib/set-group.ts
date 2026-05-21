import { z } from "zod";

/**
 * Rep + weight type shapes. JSONB in Postgres so we can evolve without
 * migrations — all reads should use these Zod schemas as the ground truth.
 */
export const repValueSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("fixed"), reps: z.number().int().positive() }),
  z.object({ type: z.literal("range"), min: z.number().int().positive(), max: z.number().int().positive() }),
  z.object({ type: z.literal("unilateral"), per_side: z.number().int().positive(), plus_reserves: z.boolean().optional() }),
  z.object({ type: z.literal("total"), total: z.number().int().positive() }),
  // "time" = work for X seconds (cadence-style sets, e.g. 30s row).
  z.object({ type: z.literal("time"), seconds: z.number().int().positive() }),
  // "hold" = isometric hold for X seconds (planks, wall sits). Distinct
  // from "time" so the prescription reads correctly to the client.
  z.object({ type: z.literal("hold"), seconds: z.number().int().positive() }),
  z.object({ type: z.literal("distance"), meters: z.number().int().positive(), intent: z.string().optional() }),
  z.object({ type: z.literal("amrap") }),
  z.object({ type: z.literal("emom"), on_seconds: z.number().int().positive(), off_seconds: z.number().int().nonnegative() }),
  z.object({ type: z.literal("single") }),
]);

export type RepValue = z.infer<typeof repValueSchema>;

export const weightValueSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("load"), kg: z.number().nonnegative(), paired: z.boolean().optional() }),
  z.object({ type: z.literal("bw") }),
  z.object({ type: z.literal("percentage"), of: z.string(), percent: z.number() }),
  z.object({ type: z.literal("intensity"), descriptor: z.string() }),
  z.object({ type: z.literal("blank") }),
]);

export type WeightValue = z.infer<typeof weightValueSchema>;

export function formatReps(value: RepValue): string {
  switch (value.type) {
    case "fixed":
      return `${value.reps}`;
    case "range":
      return `${value.min}–${value.max}`;
    case "unilateral":
      return `${value.per_side}/side${value.plus_reserves ? "+" : ""}`;
    case "total":
      return `${value.total} total`;
    case "time":
      return `${value.seconds}s`;
    case "hold":
      return `hold ${value.seconds}s`;
    case "distance":
      return `${value.meters}m${value.intent ? ` · ${value.intent}` : ""}`;
    case "amrap":
      return "amrap";
    case "emom":
      return `emom ${value.on_seconds}/${value.off_seconds}s`;
    case "single":
      return "1";
  }
}

export function formatWeight(value: WeightValue): string {
  switch (value.type) {
    case "load":
      return value.paired ? `2× ${value.kg} kg` : `${value.kg} kg`;
    case "bw":
      return "bw";
    case "percentage":
      return `${value.percent}% ${value.of}`;
    case "intensity":
      return value.descriptor;
    case "blank":
      return "—";
  }
}

/* ─── Opt-in fields model ──────────────────────────────────────── */

/**
 * The optional field keys a trainer can opt into per exercise row.
 * Sets is implicit (always present) and is NOT in this list.
 *
 * Display order is the array order — left-to-right on the row, with
 * `rest` rendered as its own subordinate sub-row below the main row.
 * Keep this canonical so cells are predictable across exercises.
 */
export const FIELD_KEYS = ["reps", "weight", "tempo", "rpe", "time", "rest"] as const;

export type FieldKey = (typeof FIELD_KEYS)[number];

export const FIELD_KEY_SET = new Set<string>(FIELD_KEYS);

/**
 * Normalize whatever shape we got from `template_set_groups.active_fields`
 * (jsonb — usually an array, but defensively handle stale string entries
 * or unknown keys). Returns a clean `FieldKey[]` in canonical order.
 *
 * Why canonical order: trainers shouldn't see fields reorder when they
 * add Tempo *after* RPE. We always render in the FIELD_KEYS sequence so
 * the row reads the same on every exercise.
 */
export function parseActiveFields(raw: unknown): FieldKey[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<FieldKey>();
  for (const item of raw) {
    if (typeof item === "string" && FIELD_KEY_SET.has(item)) {
      seen.add(item as FieldKey);
    }
  }
  return FIELD_KEYS.filter((k) => seen.has(k));
}

/**
 * The non-`rest` fields rendered inline on the exercise row's main
 * line, in canonical left-to-right order. Rest is special — it
 * renders below as a quiet sub-row. See template-builder.tsx.
 */
export const INLINE_FIELD_KEYS: FieldKey[] = FIELD_KEYS.filter((k) => k !== "rest");

/**
 * Human-facing labels for the popover + cell headings. Lowercase to
 * match the brand voice in CLAUDE.md.
 */
export const FIELD_LABELS: Record<FieldKey, string> = {
  reps: "reps",
  weight: "weight",
  tempo: "tempo",
  rpe: "rpe",
  time: "time",
  rest: "rest",
};

/**
 * Short description for the popover row — the sub-line under each
 * field name, so a trainer who hasn't used the field before sees
 * what it does without leaving the popover.
 */
export const FIELD_DESCRIPTIONS: Record<FieldKey, string> = {
  reps: "a target rep count",
  weight: "kg per set",
  tempo: "e.g. 3-1-2",
  rpe: "0–10, optional range",
  time: "duration in seconds",
  rest: "rest between sets",
};
