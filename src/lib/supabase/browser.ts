import { createBrowserClient } from "@supabase/ssr";

import { env } from "@/lib/env";

/**
 * Browser-only Supabase client. Use for realtime subscriptions from Client
 * Components. For mutations, prefer Server Actions (see /lib/supabase/server.ts).
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
