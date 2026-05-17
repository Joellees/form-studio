import { auth } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { StudioShell } from "./_components/studio-shell";
import { TrialBanner } from "./_components/trial-banner";
import { getOnboardingWarning } from "@/lib/onboarding-warning";
import { isPreviewActive, PREVIEW_TRAINER_SLUG } from "@/lib/preview";
import { hasStudioAccess, trialState } from "@/lib/subscription";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getTenantKind, getTenantSlug } from "@/lib/tenancy";

/**
 * The `/studio` surface is private — trainer-only. Redirects to:
 *  - /sign-in if unauthenticated
 *  - /onboarding if the Clerk user has no trainer row yet
 *  - the correct subdomain if they land on the wrong one
 *
 * Uses the admin client to look up the trainer row: the Clerk user is
 * already authenticated at this point, and we're filtering strictly by
 * the trusted Clerk ID. Trying to read via RLS here would deadlock the
 * user if the JWT template or signing secret drift — they'd bounce back
 * to /onboarding even though they already have a studio.
 */
export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  // Preview mode (stateless tooling): resolve the seed trainer
  // directly. Middleware has already validated `BETA_PREVIEW_TOKEN`
  // and refused any non-GET methods, so the studio surface is safe
  // to render against Joelle's data.
  const h = await headers();
  if (isPreviewActive(h)) {
    const admin = createSupabaseAdminClient();
    const { data: trainer } = await admin
      .from("trainers")
      .select("id, display_name, subdomain_slug")
      .eq("subdomain_slug", PREVIEW_TRAINER_SLUG)
      .maybeSingle();
    if (!trainer) redirect("/");
    return <StudioShell trainer={trainer}>{children}</StudioShell>;
  }

  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const admin = createSupabaseAdminClient();
  /* The wide select adds `trial_started_at` (added in migration
   * 0014). On a pre-migration DB the column doesn't exist and
   * PostgREST returns 42703 / PGRST204 — fall back to the legacy
   * column list, leaving trial_started_at as undefined so the gate
   * + banner both no-op gracefully. */
  const trainerQuery = await admin
    .from("trainers")
    .select(
      "id, display_name, subdomain_slug, subscription_status, paid_until, soft_deleted_at, cohort, trial_started_at",
    )
    .eq("clerk_id", userId)
    .maybeSingle();
  const trainer =
    trainerQuery.error &&
    (trainerQuery.error.code === "42703" || trainerQuery.error.code === "PGRST204")
      ? (
          await admin
            .from("trainers")
            .select(
              "id, display_name, subdomain_slug, subscription_status, paid_until, soft_deleted_at, cohort",
            )
            .eq("clerk_id", userId)
            .maybeSingle()
        ).data
      : trainerQuery.data;

  if (!trainer) {
    // This user is signed in but isn't a trainer. If they're a client
    // of any trainer, bounce them to the portal — /client picks the
    // active membership (subdomain → cookie → only-one → picker).
    const { data: clients } = await admin
      .from("clients")
      .select("id")
      .eq("clerk_id", userId)
      .limit(1);
    if (clients && clients.length > 0) redirect("/client");
    redirect("/onboarding");
  }

  const kind = await getTenantKind();
  const slug = await getTenantSlug();
  if (kind === "trainer" && slug && slug !== trainer.subdomain_slug) {
    // Trainer landed on another studio's subdomain — kick back to root.
    // Using a relative path keeps this safe when NEXT_PUBLIC_APP_URL is
    // unset; the middleware handles the host rewrite afterwards.
    redirect("/");
  }

  // Subscription gate (Beta 2). Reads the denormalized cache on
  // `trainers` rather than joining `trainer_subscriptions` — keeps
  // this fast and side-steps the edge-runtime limitation that the
  // spec's middleware-level gate would have hit. `/studio/expired`
  // itself is exempt so trainers can read the welcome / renew copy,
  // and renders WITHOUT the StudioShell chrome (its own full-screen
  // editorial layout).
  const pathname = h.get("x-pathname") ?? "";
  const isExpiredPage = pathname.startsWith("/studio/expired");
  const isOnboardingIssuePage = pathname.startsWith(
    "/studio/onboarding-issue",
  );

  // Onboarding warning surface (priority over the subscription gate).
  // When the access-code bind step failed recoverably, we set
  // `trainers.onboarding_warning` to a short human-readable message
  // (see `src/app/beta/actions.ts` and `src/lib/onboarding-warning.ts`)
  // and route the trainer to a dedicated page with a "message us"
  // CTA — strictly better than dumping them on /studio/expired with
  // the wrong cohort defaults. The page itself renders bare (no
  // StudioShell) so we don't surround an error message with empty
  // studio chrome. Reading is column-missing-tolerant so this is a
  // no-op before migration 0008 is applied.
  const onboardingWarning = await getOnboardingWarning(
    admin,
    (trainer as { id: string }).id,
  );
  if (isOnboardingIssuePage) {
    return <>{children}</>;
  }
  if (onboardingWarning) {
    redirect("/studio/onboarding-issue");
  }

  const trainerTrialStartedAt =
    (trainer as { trial_started_at?: string | null }).trial_started_at ?? null;
  const allowed = hasStudioAccess({
    status: trainer.subscription_status,
    paidUntil: trainer.paid_until ?? null,
    softDeletedAt: trainer.soft_deleted_at ?? null,
    trialStartedAt: trainerTrialStartedAt,
  });
  if (isExpiredPage) {
    // Always render the expired page bare (no StudioShell). If the
    // trainer is paid + active and somehow hits /studio/expired, the
    // page itself redirects back to /studio — keeps both paths sane.
    return <>{children}</>;
  }
  if (!allowed) {
    redirect("/studio/expired");
  }

  /* Trial countdown banner — surfaces only in the last 24h of an
   * active trial. `trialState` returns null when the trainer never
   * had a trial (most trainers) so the conditional below is a cheap
   * no-op for everyone else. The banner sits inside StudioShell so
   * the studio chrome wraps it like any other page content. */
  const trial = trialState(trainerTrialStartedAt);
  const showTrialBanner = !!(trial && trial.active && trial.hoursRemaining <= 24);
  const firstName = (trainer.display_name ?? "").split(" ")[0] ?? trainer.display_name ?? "";

  return (
    <StudioShell trainer={trainer}>
      {showTrialBanner && trial ? (
        <TrialBanner hoursRemaining={trial.hoursRemaining} firstName={firstName} />
      ) : null}
      {children}
    </StudioShell>
  );
}
