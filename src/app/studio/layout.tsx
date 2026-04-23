import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { StudioShell } from "./_components/studio-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantKind, getTenantSlug } from "@/lib/tenancy";

/**
 * The `/studio` surface is private — trainer-only. Redirects to:
 *  - /sign-in if unauthenticated
 *  - /onboarding if the Clerk user has no trainer row yet
 *  - the correct subdomain if they land on the wrong one
 */
export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const supabase = await createSupabaseServerClient();
  const { data: trainer } = await supabase
    .from("trainers")
    .select("id, display_name, subdomain_slug")
    .eq("clerk_id", userId)
    .maybeSingle();

  if (!trainer) redirect("/onboarding");

  const kind = await getTenantKind();
  const slug = await getTenantSlug();
  if (kind === "trainer" && slug && slug !== trainer.subdomain_slug) {
    // Trainer landed on another studio&rsquo;s subdomain — kick back to their own.
    redirect(`${process.env.NEXT_PUBLIC_APP_URL}`);
  }

  return <StudioShell trainer={trainer}>{children}</StudioShell>;
}
