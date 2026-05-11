import { NextResponse, type NextRequest } from "next/server";

import { sendEmail, subscriptionReminderEmail } from "@/lib/email";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Daily subscription sync. Two responsibilities, both idempotent:
 *
 *   1. Expire past-grace: any active subscription whose
 *      `paid_until + 1 day < now()` flips to `expired`. Both the
 *      `trainer_subscriptions` row and the `trainers` cache are
 *      updated; an audit row is written.
 *
 *   2. Send the 3-day reminder: any active subscription whose
 *      `paid_until` falls within [now, now + 3 days] AND has not
 *      yet had `reminder_sent_at` stamped this cycle gets the
 *      reminder email and `reminder_sent_at = now()`.
 *
 * Protection: `CRON_SECRET` env var must match the
 * `Authorization: Bearer …` header. Vercel cron sets this when
 * invoking the endpoint per the project's `vercel.json` config.
 * External callers without the secret get 401.
 *
 * Idempotency is enforced through `reminder_sent_at` (one reminder
 * per active window) and the expiry-detection condition (already-
 * expired subscriptions are skipped).
 */
export async function GET(req: NextRequest): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("cron.daily.no_secret_configured");
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    console.warn("cron.daily.unauthorized", { got: auth.slice(0, 16) });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const startedAt = Date.now();
  const summary = { expired: 0, remindersSent: 0, errors: 0 };

  // 1. Expire past-grace (active subscriptions whose paid_until + 1 day is in the past)
  const graceCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: pastGrace } = await supabase
    .from("trainer_subscriptions")
    .select("id, studio_id, status, paid_until, cohort")
    .eq("status", "active")
    .lt("paid_until", graceCutoff);

  for (const sub of pastGrace ?? []) {
    try {
      await supabase
        .from("trainer_subscriptions")
        .update({ status: "expired" })
        .eq("id", sub.id);
      await supabase
        .from("trainers")
        .update({ subscription_status: "expired" })
        .eq("id", sub.studio_id);
      await supabase.from("trainer_subscription_events").insert({
        trainer_subscription_id: sub.id,
        studio_id: sub.studio_id,
        event_type: "expired",
        from_status: "active",
        to_status: "expired",
        paid_until_before: sub.paid_until,
        note: "daily cron: past-grace",
      });
      summary.expired++;
    } catch (err) {
      console.error("cron.daily.expire_failed", { studioId: sub.studio_id, err });
      summary.errors++;
    }
  }

  // 2. Send 3-day reminders (active, within 3-day window, not yet reminded this cycle)
  const inThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  const { data: dueForReminder } = await supabase
    .from("trainer_subscriptions")
    .select("id, studio_id, paid_until, cadence, currency, cohort")
    .eq("status", "active")
    .gte("paid_until", now)
    .lte("paid_until", inThreeDays)
    .is("reminder_sent_at", null);

  for (const sub of dueForReminder ?? []) {
    try {
      const { data: trainer } = await supabase
        .from("trainers")
        .select("display_name, email, timezone")
        .eq("id", sub.studio_id)
        .maybeSingle();
      if (!trainer?.email) {
        // No email on file — mark the reminder as "sent" so we don't
        // retry every day for the same row. Operator can DM them.
        await supabase
          .from("trainer_subscriptions")
          .update({ reminder_sent_at: new Date().toISOString() })
          .eq("id", sub.id);
        continue;
      }
      const expiry = sub.paid_until ? new Date(sub.paid_until as string) : null;
      const expiryStr = expiry
        ? expiry.toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          })
        : "soon";
      const firstName =
        trainer.display_name?.split(" ")[0] ?? trainer.display_name ?? "there";
      const planLine =
        sub.cadence && sub.currency
          ? `${sub.cadence === "annual" ? "Annual" : "Monthly"} ${(sub.currency as string).toUpperCase()}`
          : "Your current plan";

      const tpl = subscriptionReminderEmail({
        firstName,
        expiryFormatted: expiryStr,
        planLine,
      });
      await sendEmail({ to: trainer.email, ...tpl });

      await supabase
        .from("trainer_subscriptions")
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq("id", sub.id);
      await supabase.from("trainer_subscription_events").insert({
        trainer_subscription_id: sub.id,
        studio_id: sub.studio_id,
        event_type: "reminder_sent",
        paid_until_before: sub.paid_until,
        note: "daily cron: 3-day reminder",
      });
      summary.remindersSent++;
    } catch (err) {
      console.error("cron.daily.reminder_failed", { studioId: sub.studio_id, err });
      summary.errors++;
    }
  }

  console.info("cron.daily.complete", {
    durationMs: Date.now() - startedAt,
    ...summary,
  });

  return NextResponse.json({ ok: true, ...summary });
}
