/**
 * Edge-runtime-safe Supabase client factory.
 *
 * `src/lib/supabase/server.ts` uses `cookies()` from `next/headers` and
 * Clerk's `getToken()` — both Node-only. Middleware runs in the Edge
 * runtime where those imports fail. This factory builds a minimal
 * anon-key client with no cookie/storage adapters; it works in Edge.
 *
 * Use only for paths that need a read against rows reachable via:
 *   - an RPC declared `SECURITY DEFINER` + `GRANT EXECUTE TO anon`
 *   - OR a table with an explicit anon-readable RLS policy
 *
 * Do NOT pass the service-role key to this client — middleware code
 * ships to every signed-out edge request and any leak would expose it.
 */
import { createClient } from "@supabase/supabase-js";

export function createSupabaseEdgeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      "createSupabaseEdgeClient: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY missing",
    );
  }
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
