import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";

import { claimInvite } from "../actions";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ code: string }> };

/**
 * Auto-claim landing — the single endpoint the invite flow funnels
 * into after sign-up / sign-in. Server-rendered, redirect-only.
 *
 * Flow:
 *   not signed in           → redirect to /sign-in?redirect_url=<self>
 *   invite missing          → 404
 *   invite already claimed  → redirect to /client (idempotent retry)
 *   else                    → claim, then redirect to /client
 *
 * No UI is rendered here. The client lands on /client (the portal)
 * which acts as the welcome screen — per the spec, no interstitial.
 */
export default async function ClaimInvitePage({ params }: Props) {
  const { code } = await params;
  const { userId } = await auth();
  const selfPath = `/invite/${code}/claim`;

  if (!userId) {
    redirect(`/sign-in?redirect_url=${encodeURIComponent(selfPath)}`);
  }

  const admin = createSupabaseAdminClient();
  const { data: invite } = await admin
    .from("client_invites")
    .select("code")
    .eq("code", code.toUpperCase())
    .maybeSingle();

  if (!invite) notFound();

  const result = await claimInvite({ code: invite.code });

  if (!result.ok) {
    // Hard failure (e.g. invite claimed by a different user). Send to
    // /client/dashboard — `requireClient()` will route them to a sane
    // place (their existing portal, the studio picker, or sign-in).
    redirect("/client/dashboard");
  }

  redirect("/client/dashboard?welcome=1");
}
