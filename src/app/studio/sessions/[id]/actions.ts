"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, fail, ok, runAction } from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({
  id: z.string().uuid(),
  performed_sets: z.number().int().nonnegative().optional(),
  performed_notes: z.string().nullable().optional(),
  performed_reps: z.unknown().optional(),
  performed_weight: z.unknown().optional(),
});

/**
 * Logs what actually happened on a single set group. Both trainers (for
 * in-person/zoom) and clients (for in-app) can hit this path; RLS on
 * session_set_groups gates access per role.
 */
export async function logPerformedSet(raw: unknown): Promise<ActionResult<void>> {
  return runAction(schema, raw, async ({ id, ...fields }) => {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("session_set_groups").update(fields).eq("id", id);
    if (error) return fail(error.message);
    revalidatePath("/studio/calendar");
    revalidatePath("/client/calendar");
    return ok();
  });
}
