import { auth } from "@clerk/nextjs/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type TrainerContext = {
  id: string;
  clerkId: string;
  displayName: string;
  subdomainSlug: string;
  timezone: string;
};

/**
 * Loads the trainer row for the currently signed-in Clerk user.
 * Throws if no trainer exists — call only from routes that have already
 * established the user must be a trainer (e.g. inside `/studio/*`).
 */
export async function requireTrainer(): Promise<TrainerContext> {
  const { userId } = await auth();
  if (!userId) throw new Error("Not authenticated");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
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

export async function getTrainerBySlug(slug: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("trainer_public")
    .select("*")
    .eq("subdomain_slug", slug)
    .maybeSingle();
  return data;
}
