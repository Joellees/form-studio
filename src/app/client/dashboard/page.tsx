import { redirect } from "next/navigation";

/**
 * The portal collapsed into a single page at `/client`. Old links like
 * `/client/dashboard?welcome=1` keep working by redirecting through.
 */
export default async function ClientDashboardRedirect({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const sp = await searchParams;
  redirect(sp.welcome ? `/client?welcome=${encodeURIComponent(sp.welcome)}` : "/client");
}
