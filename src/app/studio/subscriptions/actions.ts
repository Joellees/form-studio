"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, fail, ok, runAction } from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireTrainer } from "@/lib/trainer";

const markPaidSchema = z.object({ subscriptionId: z.string().uuid() });

/**
 * Activates a pending subscription: marks it paid and unlocks its session
 * count so the client can schedule. Records a payment row with method=manual.
 */
export async function markSubscriptionPaid(raw: unknown): Promise<ActionResult<void>> {
  return runAction(markPaidSchema, raw, async ({ subscriptionId }) => {
    const trainer = await requireTrainer();
    const supabase = await createSupabaseServerClient();

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

    revalidatePath("/studio/dashboard");
    revalidatePath("/studio/clients");
    return ok();
  });
}
