import { SignUp } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ClaimInviteButton } from "./claim-button";
import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ code: string }> };

/**
 * Client-side of the invite flow. Anyone with the link can land here;
 * if they're signed out, they see SignUp; if they're signed in, a
 * one-click "accept" button claims the invite.
 */
export default async function InvitePage({ params }: Props) {
  const { code } = await params;
  const admin = createSupabaseAdminClient();

  const { data: invite } = await admin
    .from("client_invites")
    .select("code, tenant_id, display_name, claimed_at, trainers(display_name, subdomain_slug)")
    .eq("code", code.toUpperCase())
    .maybeSingle();

  if (!invite) notFound();

  const trainersRel = invite.trainers as
    | { display_name: string; subdomain_slug: string }
    | Array<{ display_name: string; subdomain_slug: string }>
    | null;
  const trainer = Array.isArray(trainersRel) ? trainersRel[0] ?? null : trainersRel;
  const trainerName = trainer?.display_name ?? "Your trainer";
  const firstName = trainerName.split(" ")[0] ?? trainerName;

  if (invite.claimed_at) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-start justify-center px-6 py-16 rise-in">
        <Wordmark variant="inline" name={firstName} />
        <h1 className="mt-10 text-3xl font-semibold tracking-tight">This invite has been used.</h1>
        <p className="mt-3 text-[color:var(--color-ink)]/75">
          Ask {firstName} for a fresh link if you still need access.
        </p>
      </main>
    );
  }

  const { userId } = await auth();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-start justify-center px-6 py-16 rise-in">
      <Wordmark variant="inline" name={firstName} />
      <h1 className="mt-10 text-3xl font-semibold tracking-tight">
        {firstName} invited you to train.
      </h1>
      <p className="mt-3 text-[color:var(--color-ink)]/75">
        {userId ? "One click to accept and get started." : "Create an account — your studio will be ready in a second."}
      </p>

      {userId ? (
        <Card className="mt-10 w-full">
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-[color:var(--color-ink)]/75">
              You&rsquo;re signed in and ready. Accept the invite to join {trainerName}&rsquo;s studio.
            </p>
            <ClaimInviteButton code={invite.code} />
            <Link href="/sign-in" className="text-xs text-[color:var(--color-stone)] hover:text-[color:var(--color-moss-deep)]">
              use a different account
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-10 w-full">
          <SignUp
            fallbackRedirectUrl={`/invite/${invite.code}`}
            signInUrl={`/sign-in?redirect_url=${encodeURIComponent(`/invite/${invite.code}`)}`}
            appearance={{ elements: { card: "shadow-none bg-transparent p-0" } }}
          />
        </div>
      )}
    </main>
  );
}
