import { SignUp } from "@clerk/nextjs";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { ensureClientCode } from "./actions";
import { Wordmark } from "@/components/brand/wordmark";
import { Card, CardContent } from "@/components/ui/card";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Client-side sign-up. A client creates their own account first, gets a
 * 6-character code, and shares it with their trainer. The trainer then
 * uses the code on `/studio/clients/new` to add them to their studio.
 */
export default async function JoinPage() {
  const { userId } = await auth();

  if (!userId) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-start justify-center px-6 py-16 rise-in">
        <Wordmark variant="inline-platform" />
        <h1 className="mt-10 text-3xl font-semibold tracking-tight">Join a studio.</h1>
        <p className="mt-3 text-[color:var(--color-ink)]/75">
          Create your account. Your trainer will add you once you share your code.
        </p>
        <div className="mt-8 w-full">
          <SignUp
            fallbackRedirectUrl="/join"
            signInUrl="/sign-in"
            appearance={{ elements: { card: "shadow-none bg-transparent p-0" } }}
          />
        </div>
      </main>
    );
  }

  const user = await currentUser();
  const admin = createSupabaseAdminClient();

  // If this user is already linked to a trainer, bounce them to their dashboard.
  const { data: existingClient } = await admin
    .from("clients")
    .select("id")
    .eq("clerk_id", userId)
    .maybeSingle();
  if (existingClient) redirect("/client/dashboard");

  const { code } = await ensureClientCode({
    clerkId: userId,
    email: user?.primaryEmailAddress?.emailAddress ?? null,
    displayName: user?.firstName ?? user?.fullName ?? null,
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-start justify-center px-6 py-16 rise-in">
      <Wordmark variant="inline-platform" />
      <h1 className="mt-10 text-3xl font-semibold tracking-tight">You&rsquo;re almost in.</h1>
      <p className="mt-3 text-[color:var(--color-ink)]/75">
        Send this code to your trainer. They&rsquo;ll add you to their studio and you&rsquo;ll see
        your sessions here.
      </p>

      <Card className="mt-10 w-full">
        <CardContent className="flex flex-col items-center gap-2 py-10">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-[color:var(--color-stone)]">
            your code
          </p>
          <p
            className="select-all text-[clamp(2.5rem,7vw,3.5rem)] font-bold tracking-[0.2em] tabular-nums text-[color:var(--color-ink)]"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {code}
          </p>
        </CardContent>
      </Card>

      <p className="mt-6 text-xs text-[color:var(--color-stone)]">
        This code is for {user?.primaryEmailAddress?.emailAddress ?? "your account"}. Keep it private.
      </p>
    </main>
  );
}
