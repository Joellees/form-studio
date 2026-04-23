import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Wordmark } from "@/components/brand/wordmark";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Client-facing surface. Expects the user to have a `clients` row; if not,
 * bounce to the marketing site.
 */
export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const supabase = await createSupabaseServerClient();
  const { data: client } = await supabase
    .from("clients")
    .select("id, display_name, tenant_id, trainers(display_name, subdomain_slug)")
    .eq("clerk_id", userId)
    .maybeSingle();

  if (!client) redirect("/");

  // @ts-expect-error — nested select typings
  const trainerName: string = client.trainers?.display_name ?? "Studio";
  const firstName = trainerName.split(" ")[0] ?? trainerName;

  return (
    <div className="min-h-screen">
      <header className="border-b border-[color:var(--color-stone-soft)]/70 bg-[color:var(--color-canvas)]/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between px-6 py-4">
          <Link href="/client/dashboard">
            <Wordmark variant="inline" name={firstName} />
          </Link>
          <nav className="flex items-center gap-6 text-sm">
            <Link href="/client/dashboard">overview</Link>
            <Link href="/client/calendar">calendar</Link>
            <Link href="/client/logs">logs</Link>
            <UserButton afterSignOutUrl="/" />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-[1180px] px-6 py-10">{children}</main>
    </div>
  );
}
