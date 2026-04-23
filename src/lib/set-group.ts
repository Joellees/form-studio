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
  z.object({ type: z.literal("time"), seconds: z.number().int().positive() }),
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
