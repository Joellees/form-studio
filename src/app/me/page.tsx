import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Post-sign-in router. Looks up the signed-in Clerk user and sends
 * them to the right surface:
 *   - trainer → /studio/dashboard
 *   - client of one trainer → /client
 *   - client of multiple trainers → /client/pick
 *   - unknown → /onboarding (treat them as a new trainer setting up
 *     their own studio; if they were actually a client they'd be
 *     coming via an /invite/[code] link, not /me)
 *
 * Set NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/me so that every
 * sign-in lands here and gets routed correctly.
 */
export default async function MePage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const admin = createSupabaseAdminClient();

  const [{ data: trainer }, { data: clients }] = await Promise.all([
    admin.from("trainers").select("subdomain_slug").eq("clerk_id", userId).maybeSingle(),
    admin.from("clients").select("id").eq("clerk_id", userId),
  ]);

  if (trainer) redirect("/studio/dashboard");

  const memberships = clients ?? [];
  if (memberships.length === 0) redirect("/onboarding");
  if (memberships.length === 1) redirect("/client");
  redirect("/client/pick");
}
