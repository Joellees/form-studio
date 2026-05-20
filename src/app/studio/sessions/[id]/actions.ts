"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, fail, ok, runAction } from "@/lib/actions";
import { friendlyError, isMissingColumnError } from "@/lib/postgrest-errors";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { requireTrainer } from "@/lib/trainer";

/**
 * Logs what actually happened on a single set group. Used by both the
 * trainer on /studio/sessions/[id] and the client on /client/sessions/[id].
 */
const performSchema = z.object({
  id: z.string().uuid(),
  performed_sets: z.number().int().nonnegative().optional(),
  performed_notes: z.string().nullable().optional(),
  performed_reps: z.unknown().optional(),
  performed_weight: z.unknown().optional(),
});

export async function logPerformedSet(raw: unknown): Promise<ActionResult<void>> {
  return runAction(performSchema, raw, async ({ id, ...fields }) => {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("session_set_groups").update(fields).eq("id", id);
    if (error) return fail(friendlyError(error, "updating the session"));
    return ok();
  });
}

/**
 * Appends an exercise from the library to a session. Creates a new
 * session_block (one exercise per block for v1) with a default set
 * group so the trainer has something to tune right away.
 */
const addExerciseSchema = z.object({
  sessionId: z.string().uuid(),
  exerciseId: z.string().uuid(),
});

export async function addExerciseToSession(raw: unknown): Promise<ActionResult<{ blockId: string }>> {
  return runAction(addExerciseSchema, raw, async ({ sessionId, exerciseId }) => {
    const trainer = await requireTrainer();
    const admin = createSupabaseAdminClient();

    // Authorize: session must belong to this trainer
    const { data: session } = await admin
      .from("sessions")
      .select("id, tenant_id")
      .eq("id", sessionId)
      .eq("tenant_id", trainer.id)
      .maybeSingle();
    if (!session) return fail("Session not found.");

    const { data: last } = await admin
      .from("session_blocks")
      .select("order_index")
      .eq("session_id", sessionId)
      .order("order_index", { ascending: false })
      .limit(1);
    const nextOrder = (last?.[0]?.order_index ?? -1) + 1;

    const { data: block, error: blockErr } = await admin
      .from("session_blocks")
      .insert({ session_id: sessionId, tenant_id: trainer.id, order_index: nextOrder, round_count: 1 })
      .select("id")
      .single();
    if (blockErr) return fail(friendlyError(blockErr, "updating the session"));

    // Pull exercise defaults to seed a friendlier starting set group.
    const { data: ex } = await admin
      .from("exercises")
      .select("default_rest_seconds, is_unilateral")
      .eq("id", exerciseId)
      .maybeSingle();

    const { data: be, error: beErr } = await admin
      .from("session_block_exercises")
      .insert({ block_id: block.id, exercise_id: exerciseId, tenant_id: trainer.id, order_index: 0 })
      .select("id")
      .single();
    if (beErr) return fail(friendlyError(beErr, "updating the session"));

    const { error: sgErr } = await admin.from("session_set_groups").insert({
      block_exercise_id: be.id,
      tenant_id: trainer.id,
      order_index: 0,
      label: "Working",
      sets: 3,
      rep_type: ex?.is_unilateral ? "unilateral" : "fixed",
      rep_value: ex?.is_unilateral ? { type: "unilateral", per_side: 8 } : { type: "fixed", reps: 10 },
      weight_type: "load",
      weight_value: { type: "load", kg: 0 },
      rest_seconds: ex?.default_rest_seconds ?? 90,
    });
    if (sgErr) return fail(friendlyError(sgErr, "updating the session"));

    revalidatePath(`/studio/sessions/${sessionId}`);
    revalidatePath(`/client/sessions/${sessionId}`);
    return ok({ blockId: block.id });
  });
}

export async function removeSessionBlock(blockId: string): Promise<ActionResult<void>> {
  return runAction(z.string().uuid(), blockId, async (id) => {
    const trainer = await requireTrainer();
    const admin = createSupabaseAdminClient();
    const { error } = await admin
      .from("session_blocks")
      .delete()
      .eq("id", id)
      .eq("tenant_id", trainer.id);
    if (error) return fail(friendlyError(error, "updating the session"));
    return ok();
  });
}

/**
 * Updates a prescribed set group (sets / reps / weight / rest), as the
 * trainer tunes the session inline. Different from logPerformedSet which
 * records what happened.
 */
const setGroupSchema = z.object({
  id: z.string().uuid(),
  sets: z.number().int().positive().optional(),
  rep_type: z.string().optional(),
  rep_value: z.unknown().optional(),
  weight_type: z.string().optional(),
  weight_value: z.unknown().optional(),
  rest_seconds: z.number().int().nullable().optional(),
  label: z.string().nullable().optional(),
});

export async function updateSessionSetGroup(raw: unknown): Promise<ActionResult<void>> {
  return runAction(setGroupSchema, raw, async ({ id, ...fields }) => {
    const trainer = await requireTrainer();
    const admin = createSupabaseAdminClient();
    const { error } = await admin
      .from("session_set_groups")
      .update(fields)
      .eq("id", id)
      .eq("tenant_id", trainer.id);
    if (error) return fail(friendlyError(error, "updating the session"));
    return ok();
  });
}

const reorderSessionBlocksSchema = z.object({
  sessionId: z.string().uuid(),
  blockIds: z.array(z.string().uuid()).max(200),
});

/**
 * Persists the new order of `session_blocks` after a drag-and-drop
 * reorder in the session builder. Mirrors `reorderTemplateBlocks` in
 * the templates action set — same authorisation pattern (verify
 * session ownership + verify every passed block belongs to it before
 * writing). Sequential UPDATEs because there's no single-shot bulk
 * primitive on the supabase client for "set order_index per id".
 */
export async function reorderSessionBlocks(
  raw: unknown,
): Promise<ActionResult<void>> {
  return runAction(reorderSessionBlocksSchema, raw, async ({ sessionId, blockIds }) => {
    const trainer = await requireTrainer();
    const admin = createSupabaseAdminClient();

    const { data: session } = await admin
      .from("sessions")
      .select("id")
      .eq("id", sessionId)
      .eq("tenant_id", trainer.id)
      .maybeSingle();
    if (!session) return fail("Session not found.");

    if (blockIds.length === 0) return ok();

    const { data: owned } = await admin
      .from("session_blocks")
      .select("id")
      .eq("session_id", sessionId)
      .eq("tenant_id", trainer.id)
      .in("id", blockIds);
    if ((owned ?? []).length !== blockIds.length) {
      return fail("Some blocks don't belong to this session.");
    }

    for (let i = 0; i < blockIds.length; i++) {
      const { error } = await admin
        .from("session_blocks")
        .update({ order_index: i })
        .eq("id", blockIds[i]!)
        .eq("tenant_id", trainer.id);
      if (error) return fail(friendlyError(error, "updating the session"));
    }

    revalidatePath(`/studio/sessions/${sessionId}`);
    revalidatePath(`/client/sessions/${sessionId}`);
    return ok();
  });
}

/**
 * Apply a workout template to a session — copies every block,
 * block-exercise, and set-group from the template into the session
 * as fresh `session_*` rows. Each new session_block_exercise records
 * `source_template_id` so the session log can render a small
 * "from <workout name>" breadcrumb on the card.
 *
 * Value hierarchy:
 *   prescribed values  ← copied 1:1 from template_set_groups
 *                       (sets, rep_type/value, weight_type/value, rest)
 *   performed values   ← null at copy-time; the trainer logs them
 *                       later via `logPerformedSet`
 *
 * Editing the prescribed values on a session_set_group afterwards
 * affects this session only — it doesn't propagate back to the
 * template (which has its own template_set_groups rows) or to the
 * canonical exercise.
 *
 * Idempotency: this APPENDS to the session. Running it twice with
 * the same template duplicates the exercises. That's intentional —
 * the trainer might genuinely want to apply the same workout twice
 * (e.g., A/B split, two rounds). De-dup is a UX concern, not a data
 * concern.
 *
 * Defensive against migration 0013 not being applied yet: the insert
 * payload includes `source_template_id`; if the column doesn't exist
 * (PostgREST 42703), we retry without it. The badge just doesn't
 * render in that case.
 */
const applyTemplateSchema = z.object({
  sessionId: z.string().uuid(),
  templateId: z.string().uuid(),
});

export async function applyTemplateToSession(
  raw: unknown,
): Promise<ActionResult<{ blocksAdded: number }>> {
  return runAction(applyTemplateSchema, raw, async ({ sessionId, templateId }) => {
    const trainer = await requireTrainer();
    const admin = createSupabaseAdminClient();

    /* Authorize both sides — the session AND the template must
     * belong to this trainer. */
    const { data: session } = await admin
      .from("sessions")
      .select("id, tenant_id")
      .eq("id", sessionId)
      .eq("tenant_id", trainer.id)
      .maybeSingle();
    if (!session) return fail("Session not found.");

    const { data: template } = await admin
      .from("session_templates")
      .select("id, name")
      .eq("id", templateId)
      .eq("tenant_id", trainer.id)
      .maybeSingle();
    if (!template) return fail("Workout not found.");

    /* Minimal SELECT — only columns we actually write into the
     * session. Earlier version pulled round_label / round_rest_seconds
     * / intent_tag which we never USED — they were just along for the
     * ride, and if any of them happened to be missing on prod the
     * whole select 42703'd and the entire apply silently aborted
     * (the original symptom of "applying a workout shows nothing in
     * the session"). Narrowing the select makes the apply tolerant
     * of those out-of-band column variations. */
    const { data: tBlocks, error: loadErr } = await admin
      .from("template_blocks")
      .select(
        `id, order_index, round_count,
         template_block_exercises(id, order_index, setup_override, exercise_id,
           template_set_groups(id, order_index, label, sets, rep_type, rep_value, weight_type, weight_value, rest_seconds)
         )`,
      )
      .eq("template_id", templateId)
      .order("order_index");
    if (loadErr) {
      console.error("applyTemplateToSession.load_template_failed", {
        templateId,
        code: loadErr.code,
        message: loadErr.message,
      });
      return fail(friendlyError(loadErr, "updating the session"));
    }
    if (!tBlocks || tBlocks.length === 0) {
      return fail(`"${(template as { name: string }).name}" has no exercises yet — add some, then apply.`);
    }

    /* Append after the session's existing blocks. */
    const { data: lastBlock } = await admin
      .from("session_blocks")
      .select("order_index")
      .eq("session_id", sessionId)
      .order("order_index", { ascending: false })
      .limit(1);
    let nextBlockOrder = (lastBlock?.[0]?.order_index ?? -1) + 1;

    let blocksAdded = 0;

    /* Per-insert defensive retry helper. The session_* tables may
     * be missing columns the template_* tables have (round_count,
     * setup_override, source_template_id) depending on which
     * out-of-band migrations have been applied. Pattern: try wide,
     * on 42703 / PGRST204 strip the named column and retry. */
    async function insertWithFallback<T extends Record<string, unknown>>(
      table: "session_blocks" | "session_block_exercises" | "session_set_groups",
      payload: T,
      optionalColumns: Array<keyof T>,
    ): Promise<{ data: { id: string } | null; error: { code?: string | null; message?: string | null } | null }> {
      let working: Record<string, unknown> = { ...payload };
      // Try with everything, then iteratively drop each optional column
      // that's reported missing until the insert succeeds OR a non-
      // missing-column error surfaces.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const res = await admin
          .from(table)
          .insert(working)
          .select("id")
          .single();
        if (!res.error) return res;
        if (!isMissingColumnError(res.error)) return res;
        // Find which optional column the error names; drop it and retry.
        const droppable = optionalColumns.find(
          (k) => res.error?.message && new RegExp(`\\b${String(k)}\\b`, "i").test(res.error.message),
        );
        if (!droppable || !(droppable in working)) return res;
        console.warn(`applyTemplateToSession.${table}.column_missing_dropping`, {
          column: droppable,
          code: res.error.code,
        });
        const { [droppable as string]: _drop, ...rest } = working;
        void _drop;
        working = rest;
      }
    }

    for (const tb of tBlocks) {
      const tbCast = tb as { id: string; round_count?: number | null };
      const sbRes = await insertWithFallback(
        "session_blocks",
        {
          session_id: sessionId,
          tenant_id: trainer.id,
          order_index: nextBlockOrder,
          round_count: tbCast.round_count ?? 1,
        },
        ["round_count"],
      );
      if (sbRes.error || !sbRes.data) {
        console.error("applyTemplateToSession.session_block_insert_failed", {
          templateId,
          sessionId,
          code: sbRes.error?.code,
          message: sbRes.error?.message,
        });
        return fail(friendlyError(sbRes.error, "updating the session"));
      }
      const sb = sbRes.data;
      nextBlockOrder += 1;

      const tbes =
        ((tb as { template_block_exercises?: Array<{
          id: string;
          order_index: number;
          setup_override: string | null;
          exercise_id: string;
          template_set_groups: Array<{
            order_index: number;
            label: string | null;
            sets: number;
            rep_type: string;
            rep_value: unknown;
            weight_type: string;
            weight_value: unknown;
            rest_seconds: number | null;
          }>;
        }> }).template_block_exercises) ?? [];

      for (const tbe of tbes) {
        const beRes = await insertWithFallback(
          "session_block_exercises",
          {
            block_id: sb.id,
            exercise_id: tbe.exercise_id,
            tenant_id: trainer.id,
            order_index: tbe.order_index,
            setup_override: tbe.setup_override,
            source_template_id: templateId,
          },
          ["setup_override", "source_template_id"],
        );
        if (beRes.error || !beRes.data) {
          console.error("applyTemplateToSession.session_block_exercise_insert_failed", {
            templateId,
            sessionId,
            exerciseId: tbe.exercise_id,
            code: beRes.error?.code,
            message: beRes.error?.message,
          });
          return fail(friendlyError(beRes.error, "updating the session"));
        }

        /* Copy each template_set_group → session_set_group. Planned
         * (prescribed) values come along; performed_* stays null
         * until the trainer logs the set. */
        const sgs = (tbe.template_set_groups ?? []).map((tsg) => ({
          block_exercise_id: beRes.data!.id,
          tenant_id: trainer.id,
          order_index: tsg.order_index,
          label: tsg.label,
          sets: tsg.sets,
          rep_type: tsg.rep_type,
          rep_value: tsg.rep_value,
          weight_type: tsg.weight_type,
          weight_value: tsg.weight_value,
          rest_seconds: tsg.rest_seconds,
        }));
        if (sgs.length > 0) {
          const { error: sgErr } = await admin.from("session_set_groups").insert(sgs);
          if (sgErr) {
            console.error("applyTemplateToSession.session_set_groups_insert_failed", {
              templateId,
              sessionId,
              code: sgErr.code,
              message: sgErr.message,
            });
            return fail(friendlyError(sgErr, "updating the session"));
          }
        }
      }

      blocksAdded += 1;
    }

    console.info("applyTemplateToSession.success", {
      templateId,
      sessionId,
      blocksAdded,
    });
    revalidatePath(`/studio/sessions/${sessionId}`);
    revalidatePath(`/client/sessions/${sessionId}`);
    return ok({ blocksAdded });
  });
}

/**
 * Saves trainer-facing session notes. Stored on sessions.notes and
 * visible to the client too.
 */
const notesSchema = z.object({
  sessionId: z.string().uuid(),
  notes: z.string().max(4000),
});

export async function updateSessionNotes(raw: unknown): Promise<ActionResult<void>> {
  return runAction(notesSchema, raw, async ({ sessionId, notes }) => {
    const trainer = await requireTrainer();
    const admin = createSupabaseAdminClient();
    const { error } = await admin
      .from("sessions")
      .update({ notes: notes || null })
      .eq("id", sessionId)
      .eq("tenant_id", trainer.id);
    if (error) return fail(friendlyError(error, "updating the session"));
    revalidatePath(`/studio/sessions/${sessionId}`);
    revalidatePath(`/client/sessions/${sessionId}`);
    return ok();
  });
}
