import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Post-sign-in router. Looks up the signed-in Clerk user and sends
 * them to the right surface:
 *   - trainer → /studio/dashboard
 *   - client → /client/dashboard
 *   - pending-client (has /join code, not yet claimed) → /join
 *   - unknown → /onboarding (treat as new trainer)
 *
 * Set NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/me so that every
 * sign-in lands here and gets routed correctly.
 */
export default async function MePage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const admin = createSupabaseAdminClient();

  const [{ data: trainer }, { data: client }, { data: pending }] = await Promise.all([
    admin.from("trainers").select("subdomain_slug").eq("clerk_id", userId).maybeSingle(),
    admin.from("clients").select("id").eq("clerk_id", userId).maybeSingle(),
    admin.from("pending_clients").select("code").eq("clerk_id", userId).maybeSingle(),
  ]);

  if (trainer) redirect("/studio/dashboard");
  if (client) redirect("/client/dashboard");
  if (pending) redirect("/join"); // show them their unclaimed code
  redirect("/onboarding"); // new user — default to trainer onboarding
}
