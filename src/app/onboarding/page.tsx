import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { OnboardingForm } from "./onboarding-form";
import { Wordmark } from "@/components/brand/wordmark";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await currentUser();

  // Use the admin client for the existence check. RLS on trainers
  // requires a valid Clerk JWT that Supabase can verify — if the JWT
  // template claims don't align or signing is off, the user's own
  // row appears invisible and they get stuck on the onboarding form.
  // Here we've already authenticated via Clerk, so trusting userId to
  // look up the matching row is safe.
  const admin = createSupabaseAdminClient();
  const { data: trainer } = await admin
    .from("trainers")
    .select("subdomain_slug")
    .eq("clerk_id", userId)
    .maybeSingle();

  if (trainer?.subdomain_slug) {
    redirect(`/studio/dashboard`);
  }

  const suggestion = (user?.firstName ?? user?.username ?? "")
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .slice(0, 32);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col px-6 py-16">
      <header className="mb-12 rise-in">
        <Wordmark variant="inline-platform" />
      </header>
      <section className="rise-in">
        <p className="mb-4 text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">
          welcome
        </p>
        <h1 className="text-4xl leading-tight">Name your studio.</h1>
        <p className="mt-3 text-[color:var(--color-ink)]/75">
          This is the address your clients will know you by. You can change the
          rest later — the subdomain is permanent for now.
        </p>
      </section>
      <OnboardingForm initialSlug={suggestion} initialName={user?.firstName ?? ""} />
    </main>
  );
}
