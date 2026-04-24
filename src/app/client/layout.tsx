import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ClientMobileMenuButton, ClientNav } from "./_components/client-nav";
import { Wordmark } from "@/components/brand/wordmark";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Mirror the trainer shell pattern — hamburger on mobile, full nav on desktop.
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
        <div className="mx-auto grid max-w-[1180px] grid-cols-[auto_1fr_auto] items-center gap-2 px-3 py-2 md:flex md:justify-between md:gap-6 md:px-8 md:py-4">
          <div className="flex items-center md:hidden">
            <ClientMobileMenuButton />
          </div>
          <Link
            href="/client/dashboard"
            className="flex items-center justify-center md:justify-start"
          >
            <Wordmark variant="inline" name={firstName} />
          </Link>
          <div className="flex items-center justify-end gap-4 md:gap-6">
            <ClientNav />
            <UserButton afterSignOutUrl="/" appearance={{ elements: { avatarBox: "size-8" } }} />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1180px] px-5 py-6 md:px-8 md:py-10">{children}</main>
    </div>
  );
}
