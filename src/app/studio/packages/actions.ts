"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, fail, ok, runAction } from "@/lib/actions";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { requireTrainer } from "@/lib/trainer";

const packageSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, "Required").max(80),
  /**
   * Optional client-facing description shown on the public
   * storefront. Replaces the old `session_type_mix` badge after
   * trainer feedback. Defensively written — if the column doesn't
   * exist on prod yet (pre-migration 0012), the retry strips it and
   * the package still saves.
   */
  description: z.string().max(600, "Keep it under 600 characters.").optional().default(""),
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

    /* Core payload sent on every write. `session_type_mix` is no
     * longer in the form (the column survives in the DB with its
     * default value — dropping it can be a later migration). New
     * column-conditional fields (`currency`, `description`) get
     * layered on below with retries to handle the case where their
     * migrations (0011, 0012) haven't been applied yet on prod. */
    const basePayload: Record<string, unknown> = {
      tenant_id: trainer.id,
      name: values.name,
      session_count: values.session_count,
      duration_days: values.duration_days,
      price_usd: values.price_usd,
      delivery_method: values.delivery_method,
      payment_mode: values.payment_mode,
      cancellation_policy: values.cancellation_policy,
    };
    const withDescription = { ...basePayload, description: values.description };
    const fullPayload = { ...withDescription, currency: values.currency };

    /* Two retries cover the four states (both columns present, just
     * currency, just description, neither). Postgres reports 42703
     * one column at a time, so we strip whichever the error names
     * and try again. */
    async function attempt(
      payload: Record<string, unknown>,
    ): Promise<{ data: { id: string } | null; error: { code?: string | null; message?: string | null } | null }> {
      if (values.id) {
        const res = await supabase
          .from("packages")
          .update(payload)
          .eq("id", values.id)
          .eq("tenant_id", trainer.id)
          .select("id")
          .single();
        return { data: res.data, error: res.error };
      }
      const res = await supabase.from("packages").insert(payload).select("id").single();
      return { data: res.data, error: res.error };
    }

    let { data, error } = await attempt(fullPayload);
    if (error && isMissingColumn(error, "description")) {
      console.warn("packages.save.description_column_missing_fallback", { packageId: values.id });
      ({ data, error } = await attempt({ ...basePayload, currency: values.currency }));
    }
    if (error && isMissingColumn(error, "currency")) {
      console.warn("packages.save.currency_column_missing_fallback", { packageId: values.id });
      ({ data, error } = await attempt({ ...basePayload, description: values.description }));
    }
    if (error && (isMissingColumn(error, "description") || isMissingColumn(error, "currency"))) {
      console.warn("packages.save.both_optional_columns_missing_fallback", { packageId: values.id });
      ({ data, error } = await attempt(basePayload));
    }
    if (error) return fail(error.message ?? "Couldn't save the package.");

    revalidatePath("/studio/packages");
    return ok({ id: data!.id });
  });
}

/**
 * Server action used by the "Assign to clients" modal on the
 * packages list + detail pages. Lists the trainer's active clients
 * with a flag per row indicating whether that client already has an
 * ACTIVE subscription for the given package (paid + not yet ended +
 * sessions remaining > 0). The flag drives the inline "(already
 * assigned)" hint in the picker — the modal still allows
 * re-assignment to match the existing single-client flow's
 * behaviour (which doesn't block duplicates either).
 *
 * Returns a plain list sorted by display_name. The bulk-assign
 * itself loops the EXISTING `assignPackage` server action from
 * `src/app/studio/subscriptions/actions.ts` client-side, so this
 * action stays focused on reads.
 */
const listClientsSchema = z.object({ packageId: z.string().uuid() });

export async function listClientsForAssign(
  raw: unknown,
): Promise<
  ActionResult<{
    clients: Array<{
      id: string;
      display_name: string;
      email: string | null;
      already_assigned: boolean;
    }>;
  }>
> {
  return runAction(listClientsSchema, raw, async ({ packageId }) => {
    const trainer = await requireTrainer();
    const supabase = createSupabaseAdminClient();

    /* Authorize the package — we don't want a stray packageId from
     * one tenant being used to list clients of another, even though
     * the clients query below is already tenant-scoped. */
    const { data: pkg } = await supabase
      .from("packages")
      .select("id")
      .eq("id", packageId)
      .eq("tenant_id", trainer.id)
      .maybeSingle();
    if (!pkg) return fail("Package not found.");

    /* All active (non-archived) clients for this trainer. We pull
     * the bare minimum for the picker; the modal renders display_name
     * + email as a disambiguator. */
    const { data: clients, error: clientsErr } = await supabase
      .from("clients")
      .select("id, display_name, email")
      .eq("tenant_id", trainer.id)
      .eq("active", true)
      .order("display_name");
    if (clientsErr) return fail(clientsErr.message);

    /* Existing active subscriptions for this package, scoped to
     * trainer + package. "Active" = paid + end_date in the future
     * (or null) + at least one session left. A client can have an
     * old expired subscription for the same package and still NOT
     * be flagged here — that's a normal re-purchase scenario. */
    const today = new Date().toISOString().slice(0, 10);
    const { data: activeSubs, error: subsErr } = await supabase
      .from("subscriptions")
      .select("client_id, end_date, sessions_remaining, payment_status")
      .eq("tenant_id", trainer.id)
      .eq("package_id", packageId);
    if (subsErr) return fail(subsErr.message);

    const flaggedClientIds = new Set<string>();
    for (const s of activeSubs ?? []) {
      const endsLater = !s.end_date || (s.end_date as string) >= today;
      const stillHasSessions = (s.sessions_remaining as number) > 0;
      const paid = s.payment_status === "paid";
      if (paid && endsLater && stillHasSessions) {
        flaggedClientIds.add(s.client_id as string);
      }
    }

    return ok({
      clients: (clients ?? []).map((c) => ({
        id: c.id as string,
        display_name: c.display_name as string,
        email: (c.email as string | null) ?? null,
        already_assigned: flaggedClientIds.has(c.id as string),
      })),
    });
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
