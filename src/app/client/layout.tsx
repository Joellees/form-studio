import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ClientStudioSwitcher } from "./studio-switcher";
import { Wordmark } from "@/components/brand/wordmark";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { CLIENT_TENANT_COOKIE, listClientMemberships } from "@/lib/trainer";
import { getTenantSlug } from "@/lib/tenancy";
import { cookies } from "next/headers";

/**
 * The client portal is a single page. Layout shows the wordmark, an
 * optional studio switcher (when the user is a client of more than
 * one trainer), and the avatar — every action lives inside the page.
 */
export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const admin = createSupabaseAdminClient();
  const memberships = await listClientMemberships();

  if (memberships.length === 0) {
    const { data: trainer } = await admin
      .from("trainers")
      .select("id")
      .eq("clerk_id", userId)
      .maybeSingle();
    if (trainer) redirect("/studio/dashboard");
    redirect("/onboarding");
  }

  // Resolve the active studio: subdomain wins, then cookie, then
  // single-membership, then send to the picker.
  const slug = await getTenantSlug();
  const jar = await cookies();
  const cookieTenant = jar.get(CLIENT_TENANT_COOKIE)?.value ?? null;

  const active =
    (slug ? memberships.find((m) => m.subdomainSlug === slug) : undefined) ??
    (cookieTenant ? memberships.find((m) => m.tenantId === cookieTenant) : undefined) ??
    (memberships.length === 1 ? memberships[0] : undefined);

  if (!active) redirect("/client/pick");

  const firstName = active.trainerName.split(" ")[0] ?? active.trainerName;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-[color:var(--color-stone-soft)]/50 bg-[color:var(--color-canvas)]/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-3 px-5 py-3 md:px-8 md:py-4">
          <Link href="/client" className="flex items-center">
            <Wordmark variant="inline" name={firstName} />
          </Link>
          <div className="flex items-center gap-3">
            {memberships.length > 1 ? (
              <ClientStudioSwitcher
                active={{ tenantId: active.tenantId, trainerName: active.trainerName }}
                memberships={memberships.map((m) => ({
                  tenantId: m.tenantId,
                  trainerName: m.trainerName,
                  subdomainSlug: m.subdomainSlug,
                }))}
              />
            ) : null}
            <UserButton afterSignOutUrl="/" appearance={{ elements: { avatarBox: "size-8" } }} />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1180px] px-5 py-6 md:px-8 md:py-10">{children}</main>
    </div>
  );
}
