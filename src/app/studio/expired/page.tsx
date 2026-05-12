import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { cohortLabel } from "@/lib/cohorts";
import { formatPrice, getPrice, isPricedCohort } from "@/lib/pricing";
import { expiredVariant, hasStudioAccess } from "@/lib/subscription";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "96170000000";

/**
 * The blocked-trainer landing screen. Three variants:
 *
 *   first_time  — fresh signup, awaiting initial payment
 *   expired     — was active, paid_until passed by > 1 day
 *   canceled    — admin cancelled, trainer must message to reactivate
 *
 * Reachable only via redirect from the studio layout. If the
 * trainer regains access while sitting on this page (admin marks
 * paid, cron flips status, etc.) and refreshes, they go straight
 * back to /studio.
 */
export default async function ExpiredPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const admin = createSupabaseAdminClient();
  const { data: trainer } = await admin
    .from("trainers")
    .select(
      "id, display_name, subdomain_slug, subscription_status, paid_until, soft_deleted_at, cohort",
    )
    .eq("clerk_id", userId)
    .maybeSingle();

  if (!trainer) redirect("/onboarding");

  // If they actually have access, kick them back into /studio.
  const allowed = hasStudioAccess({
    status: trainer.subscription_status,
    paidUntil: trainer.paid_until ?? null,
    softDeletedAt: trainer.soft_deleted_at ?? null,
  });
  if (allowed) redirect("/studio");

  const { data: sub } = await admin
    .from("trainer_subscriptions")
    .select("cohort, status, cadence, currency, paid_until, last_marked_paid_at")
    .eq("studio_id", trainer.id)
    .maybeSingle();

  const variant = expiredVariant({
    status: sub?.status ?? trainer.subscription_status,
    lastMarkedPaidAt: sub?.last_marked_paid_at ?? null,
  });

  const cohort = sub?.cohort ?? trainer.cohort ?? "beta_2";
  const cadence = (sub?.cadence ?? "monthly") as "monthly" | "annual";
  const currency = (sub?.currency ?? "usd") as "usd" | "aed" | "sar";
  const price = isPricedCohort(cohort) ? getPrice(cohort, cadence, currency) : null;
  const planLine = price
    ? `${cohortLabel(cohort)} · ${cadence === "annual" ? "Annual" : "Monthly"} · ${formatPrice(price, currency)}`
    : cohortLabel(cohort);

  const firstName = trainer.display_name.split(" ")[0] ?? trainer.display_name;

  const COPY = {
    first_time: {
      headline: "Welcome to Form Studio.",
      subhead: "To activate your studio, message the Form Studio team to set up payment.",
      message: `Hi Form Studio, I'd like to activate my subscription. (${firstName})`,
    },
    expired: {
      headline: "Your subscription has expired.",
      subhead: "To continue using Form Studio, message the Form Studio team to renew.",
      message: `Hi Form Studio, I'd like to renew my subscription. (${firstName})`,
    },
    canceled: {
      headline: "Your subscription is paused.",
      subhead: "Message the Form Studio team to reactivate when you're ready.",
      message: `Hi Form Studio, I'd like to reactivate my subscription. (${firstName})`,
    },
  } as const;

  const copy = COPY[variant];
  const waUrl = `https://wa.me/${WHATSAPP_NUMBER.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(copy.message)}`;

  const lastActive =
    sub?.paid_until && variant === "expired"
      ? new Date(sub.paid_until).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : null;

  return (
    <main
      className="mx-auto flex min-h-screen max-w-lg flex-col px-5 py-10 rise-in md:px-6 md:py-16"
      style={{ background: "#F2EDE3" }}
    >
      <p className="font-display text-[20px] leading-none text-[color:var(--color-moss)] md:text-[26px]">
        Form Studio
      </p>

      <section className="mt-12 md:mt-20">
        <h1 className="font-display text-3xl font-semibold leading-tight md:text-4xl">
          {copy.headline}
        </h1>
        <p className="mt-3 text-[color:var(--color-ink)]/70">{copy.subhead}</p>
      </section>

      {cohort === "beta_2" ? (
        // Beta 2 plan comparison — two cards, equal weight, no toggle.
        // Stacks on mobile (grid-cols-1), side-by-side from md upward
        // (md:grid-cols-2). Pricing is read from the canonical PRICING
        // map via `getPrice` so values stay in sync with the admin
        // "Mark paid" modal and Excel exports.
        <section className="mt-8 w-full">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
            Beta 2 plans
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-3xl bg-[color:var(--color-canvas)] p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
                Monthly
              </p>
              <p className="mt-2 text-base font-semibold tracking-tight tabular-nums">
                {formatPrice(getPrice("beta_2", "monthly", "usd") ?? 0, "usd")}/month
              </p>
              <p className="mt-0.5 text-sm text-[color:var(--color-ink)]/65 tabular-nums">
                {formatPrice(getPrice("beta_2", "monthly", "aed") ?? 0, "aed")}/month
              </p>
            </div>
            <div className="rounded-3xl bg-[color:var(--color-canvas)] p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
                Yearly
              </p>
              <p className="mt-2 text-base font-semibold tracking-tight tabular-nums">
                {formatPrice(getPrice("beta_2", "annual", "usd") ?? 0, "usd")}/year
              </p>
              <p className="mt-0.5 text-sm text-[color:var(--color-ink)]/65 tabular-nums">
                {formatPrice(getPrice("beta_2", "annual", "aed") ?? 0, "aed")}/year
              </p>
              <p className="mt-3 text-xs italic text-[color:var(--color-ink)]/55">
                Pay 10 months instead of 12.
              </p>
            </div>
          </div>
        </section>
      ) : (
        // Non-Beta-2 cohorts (rare on this page — founders bypass
        // hasStudioAccess; mostly defensive). Keep the original single
        // card so they still see a sensible state.
        <section className="mt-8 w-full rounded-3xl bg-[color:var(--color-canvas)] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
            your plan
          </p>
          <p className="mt-2 text-base font-semibold tracking-tight">{planLine}</p>
          {lastActive ? (
            <p className="mt-1 text-xs text-[color:var(--color-ink)]/55 tabular-nums">
              Last active through {lastActive}
            </p>
          ) : null}
        </section>
      )}

      <div className="mt-8 flex flex-col gap-3">
        <a
          href={waUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-12 items-center justify-center rounded-full bg-[color:var(--color-ink)] px-7 text-[15px] font-medium text-[color:var(--color-canvas)] shadow-[0_1px_0_rgba(31,30,27,0.15),0_6px_18px_-8px_rgba(31,30,27,0.35)] hover:bg-[color:var(--color-moss-deep)]"
        >
          Message us on WhatsApp
        </a>
        {cohort === "beta_2" ? (
          <p className="text-center text-xs italic text-[color:var(--color-stone)]">
            Mention monthly or yearly when you message us.
          </p>
        ) : null}
        <p className="text-center text-xs text-[color:var(--color-stone)]">
          Once renewed, your account will be reactivated within a few hours.
        </p>
      </div>
    </main>
  );
}
