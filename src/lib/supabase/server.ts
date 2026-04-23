import { auth } from "@clerk/nextjs/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { env } from "@/lib/env";

/**
 * Supabase client for Server Components / Server Actions / Route Handlers.
 *
 * Attaches a Clerk-signed JWT (template: `supabase`) so Postgres RLS can
 * read `auth.jwt()->>'sub'` and restrict rows to the current user. The
 * Clerk JWT template must be signed with the Supabase project's JWT
 * secret (HS256) and include `{ "sub": "{{user.id}}" }`.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { getToken } = await auth();
  const token = await getToken({ template: "supabase" });

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Component context — cookies are read-only there. Safe to ignore.
        }
      },
    },
    global: {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  });
}

/**
 * Bypasses RLS. Use sparingly — only in trusted server paths where we have
 * already authorized the caller (e.g. webhook handlers, super admin actions).
 */
export function createSupabaseAdminClient() {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required to create an admin client");
  }
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
