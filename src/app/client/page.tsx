import { redirect } from "next/navigation";

/**
 * `/client` is a redirect alias to the canonical portal URL
 * `/client/dashboard`. Old links (including `?welcome=1` from the
 * invite-claim flow before it was retargeted) keep working.
 */
export default async function ClientPortalAlias({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const sp = await searchParams;
  const qs = sp.welcome ? `?welcome=${encodeURIComponent(sp.welcome)}` : "";
  redirect(`/client/dashboard${qs}`);
}
