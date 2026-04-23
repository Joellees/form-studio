"use server";

import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Finds-or-creates a 6-character code for the given Clerk user. Idempotent —
 * calling it on the same user returns the same code.
 *
 * Collision handling: 6 chars from a 32-char alphabet = 1B possibilities,
 * so we just retry on unique-violation a few times instead of preflighting.
 */
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I for readability

function newCode(): string {
  let out = "";
  for (let i = 0; i < 6; i++) out += ALPHA[Math.floor(Math.random() * ALPHA.length)];
  return out;
}

export async function ensureClientCode(args: {
  clerkId: string;
  email: string | null;
  displayName: string | null;
}): Promise<{ code: string }> {
  const admin = createSupabaseAdminClient();

  const { data: existing } = await admin
    .from("pending_clients")
    .select("code")
    .eq("clerk_id", args.clerkId)
    .maybeSingle();
  if (existing?.code) return { code: existing.code };

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    const { error } = await admin.from("pending_clients").insert({
      code,
      clerk_id: args.clerkId,
      email: args.email,
      display_name: args.displayName,
    });
    if (!error) return { code };
    // 23505 = unique violation (code collision or clerk_id race) — retry
    if (error.code !== "23505") throw error;
  }
  throw new Error("Could not allocate a client code — try reloading");
}
