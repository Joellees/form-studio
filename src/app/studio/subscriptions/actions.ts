"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, fail, ok, runAction } from "@/lib/actions";
import { friendlyError } from "@/lib/postgrest-errors";
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
      .select(
        "id, tenant_id, client_id, package_id, payment_status, packages!subscriptions_package_id_fkey(session_count, price_usd)",
      )
      .eq("id", subscriptionId)
      .maybeSingle();

    console.info("subscription.mark_paid.attempt", {
      subscriptionId,
      trainerId: trainer.id,
      ownerMatch: sub?.tenant_id === trainer.id,
      fromStatus: sub?.payment_status,
    });

    if (!sub || sub.tenant_id !== trainer.id) {
      console.warn("subscription.mark_paid.unauthorized", { subscriptionId, trainerId: trainer.id });
      return fail("Subscription not found.");
    }
    // Idempotent: already paid → return success silently. No
    // duplicate `payments` row, no overwriting `paid_confirmed_at`.
    if (sub.payment_status === "paid") {
      console.info("subscription.mark_paid.already_paid", { subscriptionId });
      return ok();
    }

    const fromStatus = sub.payment_status ?? "pending";
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
    if (updErr) return fail(friendlyError(updErr, "updating the subscription"));

    // Audit row — every status change is recorded. Lightweight log
    // matters even at Beta 2 scale because trainers and clients
    // sometimes dispute "I paid you / you marked me unpaid" later;
    // the history settles it.
    await supabase.from("subscription_status_log").insert({
      subscription_id: subscriptionId,
      tenant_id: trainer.id,
      from_status: fromStatus,
      to_status: "paid",
      changed_by: trainer.id,
      note: null,
    });

    await supabase.from("payments").insert({
      tenant_id: trainer.id,
      subscription_id: subscriptionId,
      amount_usd: priceUsd,
      method: "manual",
      status: "paid",
    });

    // Notify the client by email — `client_id` is on `sub` already so
    // there's no need for an extra round trip here.
    if (sub.client_id) {
      const { data: client } = await supabase
        .from("clients")
        .select("email, display_name")
        .eq("id", sub.client_id)
        .maybeSingle();
      if (client?.email) {
        const email = subscriptionPaidEmail({
          trainerName: trainer.displayName,
          sessionsCount: sessionCount,
        });
        await sendEmail({ to: client.email, ...email });
      }
    }

    console.info("subscription.mark_paid.success", {
      subscriptionId,
      trainerId: trainer.id,
      clientId: sub.client_id,
      sessionsRemaining: sessionCount,
    });

    revalidatePath("/studio/dashboard");
    revalidatePath("/studio/clients");
    if (sub.client_id) {
      // Refresh the specific client-detail page so the "awaiting
      // payment" card flips to "current block" without a manual
      // reload after the trainer hits "mark paid" from that page.
      revalidatePath(`/studio/clients/${sub.client_id}`);
    }
    return ok();
  });
}

const revertSchema = z.object({
  subscriptionId: z.string().uuid(),
  note: z.string().max(280).optional(),
});

/**
 * Reverts a paid subscription back to `pending`. Used for the 30-second
 * undo toast after marking paid, and for the "revert to pending" menu
 * option beyond that window. Resets `sessions_remaining` to 0,
 * clears `paid_confirmed_*`, deletes the manual `payments` row
 * created by `markSubscriptionPaid` (idempotent: deletes any row
 * matching this subscription + method='manual' + status='paid'),
 * and writes an audit row.
 *
 * Idempotent: if the subscription is already pending, returns ok.
 */
export async function revertSubscriptionToPending(
  raw: unknown,
): Promise<ActionResult<void>> {
  return runAction(revertSchema, raw, async ({ subscriptionId, note }) => {
    const trainer = await requireTrainer();
    const supabase = createSupabaseAdminClient();

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("id, tenant_id, client_id, payment_status")
      .eq("id", subscriptionId)
      .maybeSingle();

    console.info("subscription.revert.attempt", {
      subscriptionId,
      trainerId: trainer.id,
      ownerMatch: sub?.tenant_id === trainer.id,
      fromStatus: sub?.payment_status,
    });

    if (!sub || sub.tenant_id !== trainer.id) {
      console.warn("subscription.revert.unauthorized", {
        subscriptionId,
        trainerId: trainer.id,
      });
      return fail("Subscription not found.");
    }
    if (sub.payment_status !== "paid") {
      // Idempotent — already pending, nothing to do.
      console.info("subscription.revert.already_pending", { subscriptionId });
      return ok();
    }

    const { error: updErr } = await supabase
      .from("subscriptions")
      .update({
        payment_status: "pending",
        sessions_remaining: 0,
        paid_confirmed_at: null,
        paid_confirmed_by: null,
      })
      .eq("id", subscriptionId);
    if (updErr) return fail(friendlyError(updErr, "updating the subscription"));

    await supabase.from("subscription_status_log").insert({
      subscription_id: subscriptionId,
      tenant_id: trainer.id,
      from_status: "paid",
      to_status: "pending",
      changed_by: trainer.id,
      note: note ?? null,
    });

    // Delete the manual payment record so the client's payments row
    // doesn't claim "paid" while the subscription is back to pending.
    await supabase
      .from("payments")
      .delete()
      .eq("subscription_id", subscriptionId)
      .eq("method", "manual")
      .eq("status", "paid");

    console.info("subscription.revert.success", {
      subscriptionId,
      trainerId: trainer.id,
      clientId: sub.client_id,
    });

    revalidatePath("/studio/dashboard");
    revalidatePath("/studio/clients");
    if (sub.client_id) {
      revalidatePath(`/studio/clients/${sub.client_id}`);
    }
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
    if (error) return fail(friendlyError(error, "updating the subscription"));
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
    if (error) return fail(friendlyError(error, "updating the subscription"));

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

const switchSchema = z.object({
  subscriptionId: z.string().uuid(),
  packageId: z.string().uuid().nullable(),
});

/**
 * Client-side action: schedule a package switch for the next billing
 * cycle. Doesn't touch the current month — sets pending_package_id
 * which the renewal job consumes when it rolls the subscription.
 *
 * Authorize: caller must be the client whose subscription this is.
 */
export async function switchPackageNextCycle(raw: unknown): Promise<ActionResult<void>> {
  return runAction(switchSchema, raw, async ({ subscriptionId, packageId }) => {
    const { auth } = await import("@clerk/nextjs/server");
    const { userId } = await auth();
    if (!userId) return fail("Not signed in.");

    const admin = createSupabaseAdminClient();
    const { data: client } = await admin
      .from("clients")
      .select("id, tenant_id")
      .eq("clerk_id", userId)
      .maybeSingle();
    if (!client) return fail("No client profile.");

    const { data: sub } = await admin
      .from("subscriptions")
      .select("id, client_id, tenant_id")
      .eq("id", subscriptionId)
      .maybeSingle();
    if (!sub || sub.client_id !== client.id) return fail("Not your subscription.");

    // If a package is selected, validate it belongs to the same trainer.
    if (packageId) {
      const { data: pkg } = await admin
        .from("packages")
        .select("id")
        .eq("id", packageId)
        .eq("tenant_id", sub.tenant_id)
        .eq("active", true)
        .maybeSingle();
      if (!pkg) return fail("That package isn't available.");
    }

    const { error } = await admin
      .from("subscriptions")
      .update({ pending_package_id: packageId })
      .eq("id", subscriptionId);
    if (error) return fail(friendlyError(error, "updating the subscription"));

    revalidatePath("/client");
    return ok();
  });
}
