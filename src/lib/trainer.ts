import { auth } from "@clerk/nextjs/server";
import { cookies, headers } from "next/headers";

import { isPreviewActive, PREVIEW_TRAINER_SLUG } from "@/lib/preview";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getTenantSlug } from "@/lib/tenancy";

/**
 * Cookie set when a client picks an active studio on the apex domain.
 * Holds the tenant uuid; the portal layout reads it to resolve which
 * `clients` row belongs to the active session. Subdomains bypass the
 * cookie — the slug is enough.
 */
export const CLIENT_TENANT_COOKIE = "fs_client_tenant";

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
  // Preview mode (Claude chat / web_fetch tooling): bypass Clerk and
  // resolve the seed trainer (Joelle) directly. The preview marker is
  // set by middleware after validating `BETA_PREVIEW_TOKEN`.
  const h = await headers();
  if (isPreviewActive(h)) {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("trainers")
      .select("id, clerk_id, display_name, subdomain_slug, timezone")
      .eq("subdomain_slug", PREVIEW_TRAINER_SLUG)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Preview trainer not found");
    return {
      id: data.id,
      clerkId: data.clerk_id ?? "preview",
      displayName: data.display_name,
      subdomainSlug: data.subdomain_slug,
      timezone: data.timezone,
    };
  }

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

export type ClientMembership = {
  id: string;
  tenantId: string;
  clerkId: string;
  trainerName: string;
  subdomainSlug: string | null;
};

/**
 * List every studio this Clerk user is a client of. A user can be a
 * client of multiple trainers (Phase 1.5: same Clerk ID, separate
 * `clients` rows scoped per tenant). The portal uses this to render a
 * picker on the apex domain and to resolve the active studio.
 */
export async function listClientMemberships(): Promise<ClientMembership[]> {
  const { userId } = await auth();
  if (!userId) return [];
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("clients")
    .select("id, tenant_id, clerk_id, trainers(display_name, subdomain_slug)")
    .eq("clerk_id", userId)
    .order("created_at", { ascending: false });
  return (data ?? []).map((row) => {
    const t = row.trainers as
      | { display_name?: string; subdomain_slug?: string }
      | { display_name?: string; subdomain_slug?: string }[]
      | null;
    const trainer = Array.isArray(t) ? t[0] ?? null : t;
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      clerkId: row.clerk_id as string,
      trainerName: trainer?.display_name ?? "Studio",
      subdomainSlug: trainer?.subdomain_slug ?? null,
    };
  });
}

/**
 * Resolve the *active* client membership. Resolution order:
 *   1. Trainer slug in the URL path (e.g. /s/rand on form-studio.app)
 *   2. Active-studio cookie set by the picker
 *   3. Single membership — pick it
 *   4. Throw — caller should redirect to the picker
 *
 * Throws on no membership at all (callers above this should redirect
 * to onboarding).
 */
export async function requireClient(): Promise<{ id: string; tenantId: string; clerkId: string }> {
  const { userId } = await auth();
  if (!userId) throw new Error("Not authenticated");

  const memberships = await listClientMemberships();
  if (memberships.length === 0) throw new Error("No client profile for this user");

  // 1. Subdomain wins — the URL is the user's stated intent.
  const slug = await getTenantSlug();
  if (slug) {
    const bySlug = memberships.find((m) => m.subdomainSlug === slug);
    if (bySlug) return { id: bySlug.id, tenantId: bySlug.tenantId, clerkId: bySlug.clerkId };
  }

  // 2. Cookie pin from a previous pick on the apex.
  const jar = await cookies();
  const cookieTenant = jar.get(CLIENT_TENANT_COOKIE)?.value;
  if (cookieTenant) {
    const byCookie = memberships.find((m) => m.tenantId === cookieTenant);
    if (byCookie) return { id: byCookie.id, tenantId: byCookie.tenantId, clerkId: byCookie.clerkId };
  }

  // 3. Single membership — no ambiguity.
  if (memberships.length === 1 && memberships[0]) {
    const only = memberships[0];
    return { id: only.id, tenantId: only.tenantId, clerkId: only.clerkId };
  }

  // 4. Multiple memberships, no signal — caller must show the picker.
  throw new Error("PICK_STUDIO");
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
