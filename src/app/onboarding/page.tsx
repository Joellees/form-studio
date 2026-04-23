import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { OnboardingForm } from "./onboarding-form";
import { Wordmark } from "@/components/brand/wordmark";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await currentUser();
  const supabase = await createSupabaseServerClient();

  // If trainer record already exists, jump straight to their studio dashboard.
  const { data: trainer } = await supabase
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
        <h1 className="font-display text-4xl leading-tight">Name your studio.</h1>
        <p className="mt-3 text-[color:var(--color-ink)]/75">
          This is the address your clients will know you by. You can change the
          rest later — the subdomain is permanent for now.
        </p>
      </section>
      <OnboardingForm initialSlug={suggestion} initialName={user?.firstName ?? ""} />
    </main>
  );
}
