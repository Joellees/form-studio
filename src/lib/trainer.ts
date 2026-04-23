import { auth } from "@clerk/nextjs/server";

import { createSupabaseAdminClient } from "@/lib/supabase/server";

export type TrainerContext = {
  id: string;
  clerkId: string;
  displayName: string;
  subdomainSlug: string;
  timezone: string;
};

/**
 * Loads the trainer row for the currently signed-in Clerk user.
 *
 * Uses the admin client by design: the Clerk user is already
 * authenticated (the `auth()` call at the top guarantees that), and
 * we filter by the verified Clerk ID. RLS on the trainers table would
 * otherwise require the Clerk JWT to be fully trusted by Supabase —
 * something that's fragile with the development Clerk instance and
 * the handshake-cookie dance on preview domains.
 *
 * Downstream server actions should scope their queries by
 * `tenant_id = trainer.id` explicitly.
 */
export async function requireTrainer(): Promise<TrainerContext> {
  const { userId } = await auth();
  if (!userId) throw new Error("Not authenticated");

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("trainers")
    .select("id, clerk_id, display_name, subdomain_slug, timezone")
    .eq("clerk_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("No trainer profile for this user");
  return {
    id: data.id,
    clerkId: data.clerk_id,
    displayName: data.display_name,
    subdomainSlug: data.subdomain_slug,
    timezone: data.timezone,
  };
}

export async function requireClient(): Promise<{ id: string; tenantId: string; clerkId: string }> {
  const { userId } = await auth();
  if (!userId) throw new Error("Not authenticated");
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("clients")
    .select("id, tenant_id, clerk_id")
    .eq("clerk_id", userId)
    .maybeSingle();
  if (!data) throw new Error("No client profile for this user");
  return { id: data.id, tenantId: data.tenant_id, clerkId: data.clerk_id };
}

export async function getTrainerBySlug(slug: string) {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("trainer_public")
    .select("*")
    .eq("subdomain_slug", slug)
    .maybeSingle();
  return data;
}
