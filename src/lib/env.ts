import { z } from "zod";

/**
 * Server-only secrets are stripped from client bundles by Next.js. If we
 * require them unconditionally, env.ts crashes when imported (transitively)
 * into any Client Component — which manifests as a generic "Something broke"
 * page with no clue as to the cause.
 *
 * Strategy: only validate server-only fields when we&rsquo;re actually on the
 * server. The public fields (NEXT_PUBLIC_*) are always validated.
 */
const isServer = typeof window === "undefined";

const publicSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_ROOT_DOMAIN: z.string().min(1),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

const serverOnlySchema = z.object({
  CLERK_SECRET_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional(),
  SUPER_ADMIN_CLERK_IDS: z.string().optional(),
});

function parse() {
  const publicResult = publicSchema.safeParse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_ROOT_DOMAIN: process.env.NEXT_PUBLIC_ROOT_DOMAIN,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!publicResult.success) {
    const issues = publicResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n  ");
    throw new Error(`Invalid public environment:\n  ${issues}`);
  }

  if (!isServer) {
    return {
      ...publicResult.data,
      CLERK_SECRET_KEY: "",
      SUPABASE_SERVICE_ROLE_KEY: undefined,
      RESEND_API_KEY: undefined,
      RESEND_FROM_EMAIL: undefined,
      SUPER_ADMIN_CLERK_IDS: undefined,
    };
  }

  const serverResult = serverOnlySchema.safeParse({
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    SUPER_ADMIN_CLERK_IDS: process.env.SUPER_ADMIN_CLERK_IDS,
  });
  if (!serverResult.success) {
    const issues = serverResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n  ");
    throw new Error(`Invalid server environment:\n  ${issues}`);
  }

  return { ...publicResult.data, ...serverResult.data };
}

export const env = parse();

export const superAdminClerkIds = new Set(
  (env.SUPER_ADMIN_CLERK_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

export function isSuperAdmin(clerkId: string | null | undefined): boolean {
  if (!clerkId) return false;
  return superAdminClerkIds.has(clerkId);
}
