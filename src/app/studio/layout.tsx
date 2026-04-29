import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { StudioShell } from "./_components/studio-shell";
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
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const admin = createSupabaseAdminClient();
  const { data: trainer } = await admin
    .from("trainers")
    .select("id, display_name, subdomain_slug")
    .eq("clerk_id", userId)
    .maybeSingle();

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

  return <StudioShell trainer={trainer}>{children}</StudioShell>;
}
