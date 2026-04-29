import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { PickStudio } from "./pick-studio";
import { Wordmark } from "@/components/brand/wordmark";
import { listClientMemberships } from "@/lib/trainer";

export const dynamic = "force-dynamic";

/**
 * Studio picker shown when a Clerk user is a client of more than one
 * trainer. Picking sets a cookie and routes back to /client, which
 * then renders the chosen studio's profile + calendar.
 *
 * Single-membership users skip this page entirely (they're sent to
 * /client directly from /me and the layout).
 */
export default async function PickStudioPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const memberships = await listClientMemberships();
  if (memberships.length === 0) redirect("/onboarding");
  if (memberships.length === 1) redirect("/client");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-10 md:px-6 md:py-16">
      <header className="rise-in mb-8 md:mb-12">
        <Wordmark variant="inline-platform" />
      </header>
      <section className="rise-in">
        <p className="mb-3 text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">
          choose a studio
        </p>
        <h1 className="text-3xl leading-tight">Which one are you opening?</h1>
        <p className="mt-2 text-sm text-[color:var(--color-ink)]/70">
          You&rsquo;re a client of more than one trainer. Each has its own calendar
          and profile — pick where you want to land.
        </p>
        <PickStudio
          memberships={memberships.map((m) => ({
            tenantId: m.tenantId,
            trainerName: m.trainerName,
            subdomainSlug: m.subdomainSlug,
          }))}
        />
      </section>
    </main>
  );
}
