import { auth, currentUser } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";

import { subscribeToPackage } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wordmark } from "@/components/brand/wordmark";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string; pkgId: string }> };

/**
 * Subscribe landing page. If the visitor is signed out, bounce them through
 * Clerk sign-up and come back here after. Once signed in, call the action
 * to attach them to the trainer's tenant and create a pending subscription.
 */
export default async function SubscribePage({ params }: Props) {
  const { slug, pkgId } = await params;

  const admin = createSupabaseAdminClient();
  const { data: trainer } = await admin
    .from("trainer_public")
    .select("*")
    .eq("subdomain_slug", slug)
    .maybeSingle();
  if (!trainer) notFound();

  const { data: pkg } = await admin
    .from("packages")
    .select("id, name, session_count, duration_days, price_usd, payment_mode, cancellation_policy, active, tenant_id")
    .eq("id", pkgId)
    .maybeSingle();
  if (!pkg || !pkg.active || pkg.tenant_id !== trainer.id) notFound();

  const { userId } = await auth();
  if (!userId) {
    const redirectUrl = `/subscribe/${pkgId}`;
    redirect(`/sign-up?redirect_url=${encodeURIComponent(redirectUrl)}`);
  }

  const user = await currentUser();
  const firstName = trainer.display_name.split(" ")[0] ?? trainer.display_name;

  return (
    <main className="mx-auto max-w-xl px-6 py-16 rise-in">
      <Wordmark variant="inline" name={firstName} />
      <h1 className="mt-12 font-display text-4xl">Reserve this block.</h1>
      <p className="mt-3 text-[color:var(--color-ink)]/75">
        You&rsquo;re about to start training with {trainer.display_name}. Confirm your block and
        we&rsquo;ll let them know you&rsquo;re ready.
      </p>

      <Card className="mt-10">
        <CardHeader>
          <CardTitle>{pkg.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 text-sm tabular-nums">
            <Row label="sessions" value={`${pkg.session_count}`} />
            <Row label="validity" value={`${pkg.duration_days} days`} />
            <Row label="price" value={`$${pkg.price_usd.toLocaleString()} usd`} />
            <Row
              label="cancellation"
              value={pkg.cancellation_policy === "credited" ? "credited within cutoff" : "forfeits session"}
            />
            <Row label="payment" value={pkg.payment_mode === "online" ? "online" : "cash / transfer"} />
          </dl>
        </CardContent>
      </Card>

      <form
        className="mt-8"
        action={async () => {
          "use server";
          const result = await subscribeToPackage({
            packageId: pkgId,
            trainerId: trainer.id,
            displayName: user?.firstName ?? user?.fullName ?? user?.username ?? "Client",
            email: user?.primaryEmailAddress?.emailAddress ?? null,
          });
          if (!result.ok) throw new Error(result.error);
          redirect(`/client/dashboard?welcome=1`);
        }}
      >
        <Button type="submit" size="lg" className="w-full">
          confirm and book
        </Button>
      </form>

      <p className="mt-4 text-xs text-[color:var(--color-stone)]">
        No charge happens now. {firstName} will confirm your payment by {pkg.payment_mode === "online" ? "link" : "cash or transfer"}, then your sessions unlock.
      </p>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-xs font-medium uppercase tracking-[0.18em] text-[color:var(--color-stone)]">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
