"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, fail, ok, runAction } from "@/lib/actions";
import { sendEmail, subscriptionPaidEmail } from "@/lib/email";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { requireTrainer } from "@/lib/trainer";

const markPaidSchema = z.object({ subscriptionId: z.string().uuid() });

/**
 * Activates a pending subscription: marks it paid and unlocks its session
 * count so the client can schedule. Records a payment row with method=manual.
 */
export async function markSubscriptionPaid(raw: unknown): Promise<ActionResult<void>> {
  return runAction(markPaidSchema, raw, async ({ subscriptionId }) => {
    const trainer = await requireTrainer();
    const supabase = createSupabaseAdminClient();

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("id, tenant_id, package_id, payment_status, packages(session_count, price_usd)")
      .eq("id", subscriptionId)
      .maybeSingle();

    if (!sub || sub.tenant_id !== trainer.id) return fail("Subscription not found.");
    if (sub.payment_status === "paid") return ok();

    // @ts-expect-error — nested select typings
    const sessionCount: number = sub.packages?.session_count ?? 0;
    // @ts-expect-error — nested select typings
    const priceUsd: number = sub.packages?.price_usd ?? 0;

    const { error: updErr } = await supabase
      .from("subscriptions")
      .update({
        payment_status: "paid",
        sessions_remaining: sessionCount,
        paid_confirmed_at: new Date().toISOString(),
        paid_confirmed_by: trainer.id,
      })
      .eq("id", subscriptionId);
    if (updErr) return fail(updErr.message);

    await supabase.from("payments").insert({
      tenant_id: trainer.id,
      subscription_id: subscriptionId,
      amount_usd: priceUsd,
      method: "manual",
      status: "paid",
    });

    const { data: client } = await supabase
      .from("clients")
      .select("email, display_name")
      .eq("id", (await supabase.from("subscriptions").select("client_id").eq("id", subscriptionId).single()).data?.client_id ?? "")
      .maybeSingle();
    if (client?.email) {
      const email = subscriptionPaidEmail({ trainerName: trainer.displayName, sessionsCount: sessionCount });
      await sendEmail({ to: client.email, ...email });
    }

    revalidatePath("/studio/dashboard");
    revalidatePath("/studio/clients");
    return ok();
  });
}

const updateSubSchema = z.object({
  id: z.string().uuid(),
  sessions_remaining: z.number().int().nonnegative().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
});

/**
 * Trainer adjusts the live block: how many sessions remain, when it
 * starts, when it ends. Scoped to the trainer's tenant.
 */
export async function updateSubscription(raw: unknown): Promise<ActionResult<void>> {
  return runAction(updateSubSchema, raw, async ({ id, ...fields }) => {
    const trainer = await requireTrainer();
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from("subscriptions")
      .update(fields)
      .eq("id", id)
      .eq("tenant_id", trainer.id);
    if (error) return fail(error.message);
    revalidatePath("/studio/clients");
    return ok();
  });
}

const assignSchema = z.object({
  clientId: z.string().uuid(),
  packageId: z.string().uuid(),
  markPaid: z.boolean().default(false),
});

/**
 * Trainer assigns a package to a client in one action. Creates the
 * subscription row, dates start at today, end = today + duration.
 * When markPaid is true the sessions unlock immediately; otherwise it
 * sits in 'pending' like a normal checkout until trainer confirms.
 */
export async function assignPackage(raw: unknown): Promise<ActionResult<{ subscriptionId: string }>> {
  return runAction(assignSchema, raw, async ({ clientId, packageId, markPaid }) => {
    const trainer = await requireTrainer();
    const admin = createSupabaseAdminClient();

    const { data: pkg } = await admin
      .from("packages")
      .select("id, tenant_id, session_count, duration_days, price_usd")
      .eq("id", packageId)
      .eq("tenant_id", trainer.id)
      .maybeSingle();
    if (!pkg) return fail("Package not found.");

    const today = new Date();
    const end = new Date(today);
    end.setDate(end.getDate() + pkg.duration_days);

    const { data, error } = await admin
      .from("subscriptions")
      .insert({
        tenant_id: trainer.id,
        client_id: clientId,
        package_id: packageId,
        start_date: today.toISOString().slice(0, 10),
        end_date: end.toISOString().slice(0, 10),
        sessions_remaining: markPaid ? pkg.session_count : 0,
        payment_status: markPaid ? "paid" : "pending",
        payment_method: "manual",
        paid_confirmed_at: markPaid ? new Date().toISOString() : null,
        paid_confirmed_by: markPaid ? trainer.id : null,
      })
      .select("id")
      .single();
    if (error) return fail(error.message);

    if (markPaid) {
      await admin.from("payments").insert({
        tenant_id: trainer.id,
        subscription_id: data.id,
        amount_usd: pkg.price_usd,
        method: "manual",
        status: "paid",
      });
    }

    revalidatePath(`/studio/clients/${clientId}`);
    revalidatePath("/studio/clients");
    return ok({ subscriptionId: data.id });
  });
}
