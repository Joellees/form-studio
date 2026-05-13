"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, fail, ok, runAction } from "@/lib/actions";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { requireTrainer } from "@/lib/trainer";

const packageSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, "Required").max(80),
  session_count: z.number().int().positive("Must be greater than 0"),
  duration_days: z.number().int().positive("Must be greater than 0"),
  price_usd: z.number().nonnegative("Price must be 0 or greater"),
  /**
   * Currency the `price_usd` numeric is denominated in. Legacy column
   * name kept on the DB side; the in-app `formatPrice` helper picks
   * the right symbol per currency. Defaults to `usd` if the column
   * is missing on prod (pre-migration 0011) — see the defensive
   * fallback in the insert/update branches below.
   */
  currency: z.enum(["usd", "aed", "sar"]).default("usd"),
  session_type_mix: z.enum(["strength", "strength_mobility"]),
  /**
   * Default delivery mode for sessions on this package: in person or
   * online (zoom). In-app is NOT a package-level delivery option —
   * those are either trainer-pushed (deducts a session) or
   * client-requested ($3, no deduction).
   */
  delivery_method: z.enum(["in_person", "online"]),
  payment_mode: z.enum(["manual", "online"]),
  cancellation_policy: z.enum(["credited", "lost"]),
});

/**
 * Detect "column does not exist" errors so the action can retry
 * without writing the column. Lets the deploy run safely ahead of
 * migration 0011 being applied to prod.
 */
function isMissingColumn(
  error: { code?: string | null; message?: string | null } | null,
  column: string,
): boolean {
  if (!error) return false;
  if (error.code === "42703") return true;
  if (error.message && new RegExp(column, "i").test(error.message) && /does not exist|undefined/i.test(error.message)) {
    return true;
  }
  return false;
}

export async function savePackage(raw: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(packageSchema, raw, async (values) => {
    const trainer = await requireTrainer();
    const supabase = createSupabaseAdminClient();

    /* Full payload includes `currency`. If the column doesn't exist
     * on this DB yet (migration 0011 pending), the first write
     * fails with PostgREST 42703 and we retry without `currency`. */
    const basePayload: Record<string, unknown> = {
      tenant_id: trainer.id,
      name: values.name,
      session_count: values.session_count,
      duration_days: values.duration_days,
      price_usd: values.price_usd,
      session_type_mix: values.session_type_mix,
      delivery_method: values.delivery_method,
      payment_mode: values.payment_mode,
      cancellation_policy: values.cancellation_policy,
    };
    const withCurrency = { ...basePayload, currency: values.currency };

    if (values.id) {
      /* Update path: try with currency first, retry without on
       * missing-column. The tenant_id eq on update is defence-in-
       * depth — the row is also keyed by id. */
      let { data, error } = await supabase
        .from("packages")
        .update(withCurrency)
        .eq("id", values.id)
        .eq("tenant_id", trainer.id)
        .select("id")
        .single();
      if (error && isMissingColumn(error, "currency")) {
        console.warn("packages.update.currency_column_missing_fallback", {
          packageId: values.id,
        });
        ({ data, error } = await supabase
          .from("packages")
          .update(basePayload)
          .eq("id", values.id)
          .eq("tenant_id", trainer.id)
          .select("id")
          .single());
      }
      if (error) return fail(error.message);
      revalidatePath("/studio/packages");
      return ok({ id: data!.id });
    }

    /* Insert path: same retry pattern. Insert is what was broken
     * before today's fix to the form's field-name mismatch (the
     * form was sending `delivery_method_mix` while Zod expected
     * `session_type_mix`), so any new package created now is the
     * first one going through the rewritten flow. */
    let { data, error } = await supabase
      .from("packages")
      .insert(withCurrency)
      .select("id")
      .single();
    if (error && isMissingColumn(error, "currency")) {
      console.warn("packages.insert.currency_column_missing_fallback");
      ({ data, error } = await supabase
        .from("packages")
        .insert(basePayload)
        .select("id")
        .single());
    }
    if (error) return fail(error.message);
    revalidatePath("/studio/packages");
    return ok({ id: data!.id });
  });
}

export async function archivePackage(id: string): Promise<ActionResult<void>> {
  return runAction(z.object({ id: z.string().uuid() }), { id }, async ({ id }) => {
    const trainer = await requireTrainer();
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from("packages")
      .update({ active: false })
      .eq("id", id)
      .eq("tenant_id", trainer.id);
    if (error) return fail(error.message);
    revalidatePath("/studio/packages");
    return ok();
  });
}
