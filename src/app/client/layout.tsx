import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ClientNav } from "./_components/client-nav";
import { Wordmark } from "@/components/brand/wordmark";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Client-facing surface. Expects the user to have a `clients` row. If
 * they're a trainer, bounce them to their own studio. If neither,
 * send them to /me which will work out where they should go.
 */
export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const admin = createSupabaseAdminClient();
  const { data: client } = await admin
    .from("clients")
    .select("id, display_name, tenant_id, trainers(display_name, subdomain_slug)")
    .eq("clerk_id", userId)
    .maybeSingle();

  if (!client) {
    const { data: trainer } = await admin.from("trainers").select("id").eq("clerk_id", userId).maybeSingle();
    if (trainer) redirect("/studio/dashboard");
    redirect("/me");
  }

  // @ts-expect-error — nested select typings
  const trainerName: string = client.trainers?.display_name ?? "Studio";
  const firstName = trainerName.split(" ")[0] ?? trainerName;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-[color:var(--color-stone-soft)]/50 bg-[color:var(--color-canvas)]/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-3 px-5 py-3 md:gap-8 md:px-8 md:py-5">
          <Link href="/client/dashboard" className="min-w-0">
            <Wordmark variant="inline" name={firstName} />
          </Link>
          <div className="flex items-center gap-2 md:gap-6">
            <ClientNav />
            <UserButton afterSignOutUrl="/" appearance={{ elements: { avatarBox: "size-8" } }} />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1180px] px-5 py-6 md:px-8 md:py-10">{children}</main>
    </div>
  );
}
