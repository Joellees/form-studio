"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, fail, ok, runAction } from "@/lib/actions";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { requireTrainer } from "@/lib/trainer";
import { toRepValue, UNIVERSAL_EXERCISES, UNIVERSAL_GROUPS } from "@/lib/universal-library";

// ─── Groups ──────────────────────────────────────────────────────────────

const groupCreateSchema = z.object({ name: z.string().min(1).max(40) });

export async function saveGroup(raw: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(groupCreateSchema, raw, async ({ name }) => {
    const trainer = await requireTrainer();
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("exercise_groups")
      .insert({ tenant_id: trainer.id, name })
      .select("id")
      .single();
    if (error) return fail(error.message);
    revalidatePath("/studio/library");
    return ok({ id: data.id });
  });
}

const groupRenameSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(40),
});

export async function renameGroup(raw: unknown): Promise<ActionResult<void>> {
  return runAction(groupRenameSchema, raw, async ({ id, name }) => {
    const trainer = await requireTrainer();
    const admin = createSupabaseAdminClient();
    const { error } = await admin
      .from("exercise_groups")
      .update({ name })
      .eq("id", id)
      .eq("tenant_id", trainer.id);
    if (error) return fail(error.message);
    revalidatePath("/studio/library");
    return ok();
  });
}

export async function deleteGroup(id: string): Promise<ActionResult<void>> {
  return runAction(z.string().uuid(), id, async (id) => {
    const trainer = await requireTrainer();
    const admin = createSupabaseAdminClient();
    // Exercises referencing this group have group_id set null by FK.
    const { error } = await admin
      .from("exercise_groups")
      .delete()
      .eq("id", id)
      .eq("tenant_id", trainer.id);
    if (error) return fail(error.message);
    revalidatePath("/studio/library");
    return ok();
  });
}

// ─── Exercises ───────────────────────────────────────────────────────────

const exerciseSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, "Required").max(120),
  group_id: z.string().uuid().nullable(),
  equipment: z.string().max(40).nullable(),
  is_timed: z.boolean(),
  default_rep_type: z.enum(["fixed", "range", "unilateral", "amrap", "time"]).nullable(),
  default_rep_value: z.record(z.unknown()).nullable(),
  default_rest_seconds: z.number().int().nonnegative().nullable(),
  notes: z.string().max(2000).nullable(),
  video_url: z.string().url().nullable().or(z.literal("").transform(() => null)),
});

export async function saveExercise(raw: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(exerciseSchema, raw, async (values) => {
    const trainer = await requireTrainer();
    const admin = createSupabaseAdminClient();

    const payload = {
      tenant_id: trainer.id,
      name: values.name,
      group_id: values.group_id,
      equipment: values.equipment,
      is_timed: values.is_timed,
      default_rep_type: values.default_rep_type,
      default_rep_value: values.default_rep_value,
      default_rest_seconds: values.default_rest_seconds,
      trainer_notes: values.notes,
      video_url: values.video_url,
      // Keep is_unilateral in sync with rep type for legacy callers
      is_unilateral: values.default_rep_type === "unilateral",
    };

    let exerciseId: string;
    if (values.id) {
      const { data, error } = await admin
        .from("exercises")
        .update(payload)
        .eq("id", values.id)
        .eq("tenant_id", trainer.id)
        .select("id")
        .single();
      if (error) return fail(error.message);
      exerciseId = data.id as string;
    } else {
      const { data, error } = await admin.from("exercises").insert(payload).select("id").single();
      if (error) return fail(error.message);
      exerciseId = data.id as string;
    }

    // Mirror the primary group_id into the junction so the multi-group
    // reads see it. Existing memberships from prior bulk-links are
    // preserved — we only add or remove the row matching THIS group.
    if (values.group_id) {
      await admin
        .from("exercise_group_memberships")
        .upsert(
          { exercise_id: exerciseId, group_id: values.group_id, tenant_id: trainer.id },
          { onConflict: "exercise_id,group_id", ignoreDuplicates: true },
        );
    }

    revalidatePath("/studio/library");
    return ok({ id: exerciseId });
  });
}

// ─── Multi-group memberships ─────────────────────────────────────────────

const linkSchema = z.object({
  exerciseIds: z.array(z.string().uuid()).min(1).max(200),
  groupIds: z.array(z.string().uuid()).min(1).max(20),
});

/**
 * Link a batch of exercises to a batch of groups. Idempotent — every
 * (exercise_id, group_id) pair is upserted, existing memberships are
 * preserved. Doesn't replace; if the trainer wants to remove a group
 * they do it via the exercise edit page or the group "remove" UI.
 */
export async function linkExercisesToGroups(raw: unknown): Promise<ActionResult<{ linked: number }>> {
  return runAction(linkSchema, raw, async ({ exerciseIds, groupIds }) => {
    const trainer = await requireTrainer();
    const admin = createSupabaseAdminClient();

    // Sanity: ensure every exercise + group belongs to this trainer.
    const [{ data: ownExercises }, { data: ownGroups }] = await Promise.all([
      admin.from("exercises").select("id").eq("tenant_id", trainer.id).in("id", exerciseIds),
      admin.from("exercise_groups").select("id").eq("tenant_id", trainer.id).in("id", groupIds),
    ]);
    const exOk = new Set((ownExercises ?? []).map((e) => e.id as string));
    const gOk = new Set((ownGroups ?? []).map((g) => g.id as string));
    if (exOk.size !== exerciseIds.length || gOk.size !== groupIds.length) {
      return fail("Some of those exercises or groups don&rsquo;t belong to your studio.");
    }

    const rows: { exercise_id: string; group_id: string; tenant_id: string }[] = [];
    for (const eid of exerciseIds) {
      for (const gid of groupIds) {
        rows.push({ exercise_id: eid, group_id: gid, tenant_id: trainer.id });
      }
    }
    // upsert with ignoreDuplicates so re-clicking doesn't error.
    const { error } = await admin
      .from("exercise_group_memberships")
      .upsert(rows, { onConflict: "exercise_id,group_id", ignoreDuplicates: true });
    if (error) return fail(error.message);
    revalidatePath("/studio/library");
    return ok({ linked: rows.length });
  });
}

const unlinkSchema = z.object({
  exerciseId: z.string().uuid(),
  groupId: z.string().uuid(),
});

/**
 * Remove an exercise from a single group (delete one junction row).
 * The exercise itself stays in the library; only the membership is
 * dropped.
 */
export async function unlinkExerciseFromGroup(raw: unknown): Promise<ActionResult<void>> {
  return runAction(unlinkSchema, raw, async ({ exerciseId, groupId }) => {
    const trainer = await requireTrainer();
    const admin = createSupabaseAdminClient();
    const { error } = await admin
      .from("exercise_group_memberships")
      .delete()
      .eq("exercise_id", exerciseId)
      .eq("group_id", groupId)
      .eq("tenant_id", trainer.id);
    if (error) return fail(error.message);
    revalidatePath("/studio/library");
    return ok();
  });
}

// ─── Universal library seed ──────────────────────────────────────────────

/**
 * Seed the calling trainer's library with the universal exercise list.
 * Idempotent: skips groups + exercises whose names already exist for
 * this tenant. Returns counts so the UI can show a useful summary.
 *
 * Trainers can edit, archive, or override any of these freely after —
 * they're regular `exercises` rows with the trainer's tenant_id, so
 * changes don't bleed across studios.
 */
export async function seedUniversalLibrary(_raw?: unknown): Promise<
  ActionResult<{ groupsCreated: number; exercisesCreated: number; exercisesSkipped: number }>
> {
  return runAction(z.unknown(), undefined, async () => {
    const trainer = await requireTrainer();
    const admin = createSupabaseAdminClient();

    // 1. Ensure each universal group exists for this tenant.
    const { data: existingGroups } = await admin
      .from("exercise_groups")
      .select("id, name")
      .eq("tenant_id", trainer.id);
    const groupByName = new Map<string, string>();
    for (const g of existingGroups ?? []) {
      groupByName.set(((g.name as string) ?? "").toLowerCase(), g.id as string);
    }

    let groupsCreated = 0;
    for (const groupName of UNIVERSAL_GROUPS) {
      if (groupByName.has(groupName.toLowerCase())) continue;
      const { data, error } = await admin
        .from("exercise_groups")
        .insert({ tenant_id: trainer.id, name: groupName })
        .select("id")
        .single();
      if (error) return fail(error.message);
      groupByName.set(groupName.toLowerCase(), data.id as string);
      groupsCreated += 1;
    }

    // 2. Ensure each universal exercise exists. Match by name (case
    //    insensitive) within the tenant — that's what the trainer would
    //    use to identify dupes anyway.
    const { data: existingExercises } = await admin
      .from("exercises")
      .select("name")
      .eq("tenant_id", trainer.id);
    const existingNames = new Set(
      (existingExercises ?? []).map((e) => ((e.name as string) ?? "").toLowerCase()),
    );

    let exercisesCreated = 0;
    let exercisesSkipped = 0;

    const rows = UNIVERSAL_EXERCISES
      .filter((ex) => {
        if (existingNames.has(ex.name.toLowerCase())) {
          exercisesSkipped += 1;
          return false;
        }
        return true;
      })
      .map((ex) => ({
        tenant_id: trainer.id,
        name: ex.name,
        group_id: groupByName.get(ex.group.toLowerCase()) ?? null,
        equipment: ex.equipment,
        is_timed: ex.is_timed,
        is_unilateral: ex.default_rep_type === "unilateral",
        default_rep_type: ex.default_rep_type,
        default_rep_value: toRepValue(ex),
        default_rest_seconds: ex.default_rest_seconds,
        video_url: `https://www.youtube.com/results?search_query=${encodeURIComponent(ex.name + " form tutorial")}`,
      }));

    if (rows.length > 0) {
      const { error } = await admin.from("exercises").insert(rows);
      if (error) return fail(error.message);
      exercisesCreated = rows.length;
    }

    revalidatePath("/studio/library");
    return ok({ groupsCreated, exercisesCreated, exercisesSkipped });
  });
}

export async function archiveExercise(id: string): Promise<ActionResult<void>> {
  return runAction(z.string().uuid(), id, async (id) => {
    const trainer = await requireTrainer();
    const admin = createSupabaseAdminClient();
    const { error } = await admin
      .from("exercises")
      .update({ archived: true })
      .eq("id", id)
      .eq("tenant_id", trainer.id);
    if (error) return fail(error.message);
    revalidatePath("/studio/library");
    return ok();
  });
}
